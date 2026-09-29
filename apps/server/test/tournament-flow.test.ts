import { describe, expect, it } from 'vitest';
import { defaultLevels, defaultRoomConfig } from '@poker/shared';
import { TournamentRoom } from '../src/rooms/TournamentRoom';
import { makeRoom, settle, tournamentConfig, type FakeClock, type FakeTransport } from './harness';

const MIN = 60_000;

/** Bots that shove every hand so the tournament ends quickly. */
async function shoveUntil(room: TournamentRoom, transport: FakeTransport, clock: FakeClock, users: string[], done: () => boolean, maxSteps = 3000) {
  for (let i = 0; i < maxSteps && !done(); i++) {
    await settle();
    room.broadcastNow();
    let acted = false;
    for (const u of users) {
      let v;
      try {
        v = transport.lastView(u);
      } catch {
        continue;
      }
      const h = v.hand;
      if (!h || h.phase === 'complete' || v.me.seat === null) continue;
      try {
        if (h.legal) {
          room.act(u, h.handNo, h.legal.canBet || h.legal.canRaise ? { type: 'allIn' } : h.legal.canCall ? { type: 'call' } : { type: 'check' });
          acted = true;
        } else if (h.showdownAwaiting === v.me.seat) {
          room.act(u, h.handNo, { type: 'muck' });
          acted = true;
        }
      } catch {
        /* stale view */
      }
      if (acted) break;
    }
    if (!acted) await clock.advance(1000);
  }
}

function setup(t = {}, overrides = {}, users = ['host', 'bob', 'cara', 'dan', 'eve']) {
  const r = makeRoom(tournamentConfig(t, overrides), { RoomClass: TournamentRoom });
  const room = r.room as TournamentRoom;
  users.forEach((u, i) => {
    room.join(u, u);
    room.requestSeat(u, i, undefined, 'waitForBB');
  });
  return { ...r, room, users };
}

describe('tournament', () => {
  it('needs two registered players to start and records entries at the start', async () => {
    const { room, persistence } = setup({}, { moneyMode: 'LEDGER', ledger: defaultRoomConfig('TOURNAMENT', 'LEDGER').ledger }, ['host']);
    expect(() => room.start('host')).toThrow(/two players/);
    room.join('bob', 'bob');
    room.requestSeat('bob', 4, undefined, 'waitForBB');
    room.leaveSeat('bob'); // unregister before start: no ledger entry
    room.requestSeat('bob', 4, undefined, 'waitForBB');
    await room.flush();
    expect(persistence.ledger).toHaveLength(0);
    room.start('host');
    await room.flush();
    expect(persistence.ledger.map((l) => [l.type, l.amountMinor])).toEqual([
      ['ENTRY', 2000],
      ['ENTRY', 2000],
    ]);
    room.dispose();
  });

  it('blind levels advance on the clock, BB antes start at level 3, and pausing stops the clock', async () => {
    const { room, transport, clock } = setup();
    room.start('host');
    await settle();
    room.broadcastNow();
    let v = transport.lastView('host');
    expect(v.tournament!.level).toBe(1);
    expect(v.room.bigBlind).toBe(defaultLevels(1000)[0].bb);
    expect(v.room.ante).toBe(0);
    await clock.advance(10 * MIN);
    room.broadcastNow();
    expect(transport.lastView('host').tournament!.level).toBe(2);
    room.pause('host');
    await clock.advance(60 * MIN);
    room.broadcastNow();
    v = transport.lastView('host');
    expect(v.tournament!.level).toBe(2);
    expect(v.tournament!.levelRemainingMs).toBe(10 * MIN);
    room.resume('host');
    await clock.advance(10 * MIN);
    room.broadcastNow();
    v = transport.lastView('host');
    expect(v.tournament!.level).toBe(3);
    expect(v.room.ante).toBe(v.room.bigBlind);
    room.dispose();
  });

  it('late registration is open through level 5 and closes at level 6', async () => {
    const { room, clock } = setup({ levelMinutes: 1 }, {}, ['host', 'bob']);
    room.start('host');
    room.pause('host'); // keep hands from running; the clock is what matters
    room.resume('host');
    room.join('late', 'late');
    await clock.advance(4 * MIN + 30_000); // level 5
    room.requestSeat('late', 7, undefined, 'waitForBB');
    expect(room.seatOf('late')!.stack).toBe(1000);
    room.join('later', 'later');
    await clock.advance(MIN); // level 6
    expect(() => room.requestSeat('later', 8, undefined, 'waitForBB')).toThrow(/Registration is closed/);
    room.dispose();
  });

  it('plays down to one winner; standings and payouts balance the ledger (ledger mode)', async () => {
    const ledger = { currency: 'RM', ratio: { chips: 1, minor: 1 }, entryPrice: 5000, rebuyPrice: 5000, addOnPrice: 5000 };
    const { room, transport, clock, persistence, users } = setup({}, { moneyMode: 'LEDGER', ledger });
    room.start('host');
    await shoveUntil(room, transport, clock, users, () => room.status === 'ENDED');
    await room.flush();
    expect(room.status).toBe('ENDED');
    const results = persistence.ended.get('room1') as { tournament: { standings: { place: number; prize: number }[]; prizePool: number } };
    const st = results.tournament.standings;
    expect(st).toHaveLength(5);
    expect(results.tournament.prizePool).toBe(25_000);
    // 5 entrants: 65% / 35%
    expect(st.find((s) => s.place === 1)!.prize).toBe(16_250);
    expect(st.reduce((t, s) => t + s.prize, 0)).toBe(25_000);
    // Money in minus money out is zero
    const net = persistence.ledger.reduce((t, l) => t + (l.type === 'PAYOUT' ? l.amountMinor : -l.amountMinor), 0);
    expect(net).toBe(0);
  });

  it('rebuys: busted players may rebuy during the rebuy period; afterwards they are eliminated', async () => {
    const { room, transport, clock, users } = setup({ rebuy: { enabled: true, untilLevel: 2, chips: 1000 }, levelMinutes: 30 }, {}, ['host', 'bob', 'cara']);
    room.start('host');
    // Shove until somebody busts
    await shoveUntil(room, transport, clock, users, () => users.some((u) => room.seatOf(u)?.status === 'busted'));
    const busted = users.find((u) => room.seatOf(u)?.status === 'busted')!;
    expect(busted).toBeDefined();
    room.requestRebuy(busted);
    expect(room.seatOf(busted)!.stack).toBe(1000);
    room.broadcastNow();
    expect(transport.lastView(busted).tournament!.myRebuys).toBe(1);
    // Past the rebuy period: rebuys refused
    await clock.advance(60 * MIN);
    expect(() => room.requestRebuy(busted)).toThrow(/rebuy period is over/);
    room.dispose();
  });
});
