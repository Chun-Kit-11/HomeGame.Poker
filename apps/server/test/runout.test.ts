import { describe, expect, it } from 'vitest';
import { cashConfig, settle } from './harness';
import { Room } from '../src/rooms/Room';
import { MemoryPersistence } from '../src/persistence';
import { FakeClock, FakeTransport } from './harness';

describe('all-in runout reveal', () => {
  it('reveals the board street by street with win percentages, and settles only at the end', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const persistence = new MemoryPersistence();
    const deck = Array.from({ length: 52 }, (_, i) => 51 - i); // fixed deck
    const room = new Room(
      { id: 'r', code: 'RUN001', hostId: 'host', config: cashConfig({ autoApprove: true }), status: 'OPEN' },
      {
        persistence,
        clock,
        transport,
        dealer: { prepare: async () => ({ deck, fair: { serverSeedHash: '', serverSeed: '', handId: '', clientSeeds: [] } }) },
        delays: { afterHand: 1000, afterShowdown: 1000, decisionMs: 5000, runoutStep: 1600 },
      },
    );
    for (const [i, u] of ['host', 'bob'].entries()) {
      room.join(u, u);
      room.requestSeat(u, i, 100, 'waitForBB');
    }
    room.start('host');
    await settle();
    room.broadcastNow();
    let v = transport.lastView('host');
    const first = v.seats[v.hand!.toAct!]!.userId;
    const second = first === 'host' ? 'bob' : 'host';
    room.act(first, 1, { type: 'allIn' });
    room.act(second, 1, { type: 'call' });
    room.broadcastNow();
    v = transport.lastView('host');
    expect(v.hand!.board).toHaveLength(0); // preflop all-in: nothing shown yet
    expect(v.hand!.results).toEqual([]);
    const eqs = v.seats.filter(Boolean).map((s) => s!.equity!);
    expect(eqs.every((e) => e > 0 || e === 0)).toBe(true);
    expect(eqs[0] + eqs[1]).toBeCloseTo(1, 5);
    expect(v.seats.every((s) => !s || s.won === 0)).toBe(true);
    expect(v.stats.handsPlayed).toBe(0);
    await room.flush();
    expect(persistence.hands).toHaveLength(0); // not settled yet

    await clock.advance(1600);
    room.broadcastNow();
    expect(transport.lastView('host').hand!.board).toHaveLength(3);
    await clock.advance(1600);
    room.broadcastNow();
    expect(transport.lastView('host').hand!.board).toHaveLength(4);
    await clock.advance(1600);
    room.broadcastNow();
    v = transport.lastView('host');
    expect(v.hand!.board).toHaveLength(5);
    expect(v.hand!.results.length).toBeGreaterThan(0);
    expect(v.seats.every((s) => !s || s.equity === null)).toBe(true);
    await room.flush();
    expect(persistence.hands).toHaveLength(1);
    room.dispose();
  });
});
