import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TableView } from '@poker/shared';
import { realClock } from '../src/clock';
import { MemoryPersistence } from '../src/persistence';
import { RateLimiter } from '../src/ratelimit';
import { CryptoDealer } from '../src/rooms/dealer';
import { RoomManager } from '../src/rooms/RoomManager';
import { attachGateway, socketTransport } from '../src/sockets/gateway';
import { cashConfig } from './harness';

const PLAYERS = ['alice', 'bob', 'cara', 'dan'];
const SPECTATOR = 'eve';

describe('hole card privacy over real sockets', () => {
  let http: HttpServer;
  let io: Server;
  let url: string;
  const persistence = new MemoryPersistence();
  let manager: RoomManager;

  beforeAll(async () => {
    http = createServer();
    io = new Server(http);
    manager = new RoomManager({
      persistence,
      clock: realClock,
      dealer: () => new CryptoDealer(),
      transport: (code) => socketTransport(io, code),
      loadRoom: async () => null,
      delays: { afterHand: 30, afterShowdown: 30, decisionMs: 2000, runoutStep: 20 },
    });
    manager.add({ id: 'leakroom', code: 'LEAK01', hostId: 'alice', config: cashConfig({ autoApprove: true }, { runItTwice: true }), status: 'OPEN' });
    // Test auth: the cookie is simply "uid=<name>"
    attachGateway(io, manager, async (cookie) => {
      const uid = cookie?.match(/uid=(\w+)/)?.[1];
      return uid ? { id: uid, username: uid } : null;
    }, { actions: new RateLimiter(1000, 1000) });
    await new Promise<void>((r) => http.listen(0, r));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    manager.disposeAll();
    io.close();
    await new Promise((r) => http.close(r));
  });

  it('rejects unauthenticated sockets', async () => {
    const s = connect(url, { transports: ['websocket'], reconnection: false });
    const err = await new Promise<Error>((r) => s.on('connect_error', r));
    expect(err.message).toBe('unauthorized');
    s.close();
  });

  it('never sends another player\'s hole cards unless shown, over 25+ hands', async () => {
    const received = new Map<string, { event: string; payload: unknown }[]>();
    const sockets = new Map<string, Socket>();
    const emit = (s: Socket, event: string, data: unknown) =>
      new Promise<{ ok: boolean; error?: string }>((r) => s.emit(event, data, r));

    for (const u of [...PLAYERS, SPECTATOR]) {
      const s = connect(url, { transports: ['websocket'], extraHeaders: { cookie: `uid=${u}` }, reconnection: false });
      const log: { event: string; payload: unknown }[] = [];
      received.set(u, log);
      s.onAny((event, payload) => log.push({ event, payload: structuredClone(payload) }));
      sockets.set(u, s);
      await new Promise<void>((r) => s.on('connect', () => r()));
      expect(await emit(s, 'room:join', { code: 'LEAK01' })).toEqual({ ok: true });
    }
    for (const [i, u] of PLAYERS.entries()) {
      expect(await emit(sockets.get(u)!, 'seat:request', { seat: i * 2, amount: 200 })).toEqual({ ok: true });
    }

    // Simple bots: act on their own latest view.
    let rnd = 7;
    const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    const acting = new Set<string>();
    const latest = new Map<string, TableView>();
    const errors: string[] = [];
    for (const u of PLAYERS) {
      const s = sockets.get(u)!;
      const tryAct = async (): Promise<void> => {
        const v = latest.get(u);
        const h = v?.hand;
        if (!v || !h || h.phase === 'complete' || acting.has(u)) return;
        const me = v.me.seat;
        let action: unknown = null;
        if (h.legal) {
          const r = random();
          action = r < 0.15 ? { type: 'fold' } : r < 0.3 && (h.legal.canRaise || h.legal.canBet) ? { type: 'allIn' } : h.legal.canCheck ? { type: 'check' } : { type: 'call' };
        } else if (me !== null && h.ritPending.includes(me)) action = { type: 'runItTwice', agree: random() < 0.5 };
        else if (me !== null && h.showdownAwaiting === me) action = { type: random() < 0.5 ? 'show' : 'muck' };
        if (!action) return;
        acting.add(u);
        latest.delete(u);
        const res = await emit(s, 'player:action', { handNo: h.handNo, action });
        if (!res.ok) errors.push(res.error!);
        acting.delete(u);
        await tryAct();
      };
      s.on('table:state', (v: TableView) => {
        latest.set(u, v);
        void tryAct();
      });
      // Rebuy when busted so the game keeps going
      s.on('table:state', (v: TableView) => {
        const mine = v.me.seat !== null ? v.seats[v.me.seat] : null;
        if (mine && mine.status === 'busted' && !v.me.pendingRequest) void emit(s, 'player:rebuy', { amount: 200 });
      });
    }

    expect(await emit(sockets.get('alice')!, 'host:start', {})).toEqual({ ok: true });

    const deadline = Date.now() + 60_000;
    while (persistence.hands.length < 25 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    // Only late run-it-twice votes (after someone already declined) may be rejected.
    expect(errors.filter((e) => e !== 'That hand is over')).toEqual([]);
    expect(persistence.hands.length).toBeGreaterThanOrEqual(25);
    for (const s of sockets.values()) s.close();

    // Ground truth from the server's hand records
    const byHand = new Map(persistence.hands.map((h) => [h.handNo, h]));
    let checkedViews = 0;
    let sawShownCards = false;
    for (const [user, log] of received) {
      for (const { event, payload } of log) {
        const json = JSON.stringify(payload);
        expect(json).not.toMatch(/"deck"|"holeCards"|"deckPos"/);
        if (event !== 'table:state') continue;
        const view = payload as TableView;
        if (!view.hand) continue;
        const record = byHand.get(view.hand.handNo);
        if (!record) continue; // hand still in progress at the end
        checkedViews++;
        for (const seat of view.seats) {
          if (!seat || !Array.isArray(seat.cards)) continue;
          const truth = record.players.find((p) => p.seat === seat.seat)!;
          if (!truth) continue;
          expect(seat.cards).toEqual(truth.holeCards);
          if (seat.userId !== user) {
            // Someone else's cards: only allowed if they were shown at showdown
            expect(truth.shown).toBe(true);
            sawShownCards = true;
          }
        }
      }
    }
    expect(checkedViews).toBeGreaterThan(100);
    expect(sawShownCards).toBe(true);
    // The spectator never saw any unshown hole cards (covered above) and never had legal actions
    const eveViews = received.get(SPECTATOR)!.filter((m) => m.event === 'table:state').map((m) => m.payload as TableView);
    expect(eveViews.every((v) => !v.hand || v.hand.legal === null)).toBe(true);
  });
});
