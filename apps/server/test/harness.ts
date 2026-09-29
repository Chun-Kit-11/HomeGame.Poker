import { defaultLevels, defaultRoomConfig, type RoomConfig, type TableView } from '@poker/shared';
import type { Clock } from '../src/clock';
import { MemoryPersistence } from '../src/persistence';
import { CryptoDealer, type Dealer } from '../src/rooms/dealer';
import { Room, type RoomInfo, type Transport } from '../src/rooms/Room';

export class FakeClock implements Clock {
  t = 1_000_000;
  private id = 0;
  timers: { id: number; at: number; fn: () => void }[] = [];
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.id;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== h);
  };
  /** Advances time, running due timers (and letting promises settle between them). */
  async advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      await settle();
      const due = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = Math.max(this.t, due.at);
      due.fn();
    }
    this.t = target;
    await settle();
  }
}

export const settle = () => new Promise<void>((r) => setImmediate(r));

export class FakeTransport implements Transport {
  sent: { userId: string | '*'; event: string; payload: any }[] = [];
  evicted: string[] = [];
  toUser(userId: string, event: string, payload: unknown) {
    this.sent.push({ userId, event, payload: structuredClone(payload) });
  }
  toAll(event: string, payload: unknown) {
    this.sent.push({ userId: '*', event, payload: structuredClone(payload) });
  }
  evict(userId: string) {
    this.evicted.push(userId);
  }
  lastView(userId: string): TableView {
    const v = [...this.sent].reverse().find((m) => m.userId === userId && m.event === 'table:state');
    if (!v) throw new Error(`no view for ${userId}`);
    return v.payload;
  }
}

export function cashConfig(overrides: Partial<RoomConfig> = {}, cash: Partial<NonNullable<RoomConfig['cash']>> = {}): RoomConfig {
  const base = defaultRoomConfig('CASH', 'PLAY');
  return { ...base, ...overrides, cash: { ...base.cash!, smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200, ...cash } };
}

export function tournamentConfig(
  t: Partial<NonNullable<RoomConfig['tournament']>> = {},
  overrides: Partial<RoomConfig> = {},
): RoomConfig {
  const base = defaultRoomConfig('TOURNAMENT', overrides.moneyMode ?? 'PLAY');
  return { ...base, autoApprove: true, ...overrides, tournament: { ...base.tournament!, startingStack: 1000, levelMinutes: 10, levels: defaultLevels(1000), ...t } };
}

export function makeRoom(config: RoomConfig, opts: { dealer?: Dealer; RoomClass?: typeof Room } = {}) {
  const clock = new FakeClock();
  const transport = new FakeTransport();
  const persistence = new MemoryPersistence();
  const info: RoomInfo = { id: 'room1', code: 'TEST01', hostId: 'host', config, status: 'OPEN' };
  const RoomClass = opts.RoomClass ?? Room;
  const room = new RoomClass(info, {
    persistence,
    clock,
    transport,
    dealer: opts.dealer ?? new CryptoDealer(),
    delays: { afterHand: 1000, afterShowdown: 1000, decisionMs: 5000 },
  });
  return { room, clock, transport, persistence };
}

/** Plays whatever is pending with check/call so hands finish. */
export async function playPassively(room: Room, transport: FakeTransport, clock: FakeClock, users: string[]) {
  for (let i = 0; i < 200; i++) {
    await settle();
    room.broadcastNow();
    let acted = false;
    for (const u of users) {
      const v = transport.lastView(u);
      const h = v.hand;
      if (!h || h.phase === 'complete') continue;
      if (h.legal) {
        room.act(u, h.handNo, h.legal.canCheck ? { type: 'check' } : { type: 'call' });
        acted = true;
        break;
      }
      const mySeat = v.me.seat;
      if (mySeat !== null && h.ritPending.includes(mySeat)) {
        room.act(u, h.handNo, { type: 'runItTwice', agree: false });
        acted = true;
        break;
      }
      if (mySeat !== null && h.showdownAwaiting === mySeat) {
        room.act(u, h.handNo, { type: 'muck' });
        acted = true;
        break;
      }
    }
    if (!acted) return;
  }
}
