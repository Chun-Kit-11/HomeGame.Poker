import { describe, expect, it } from 'vitest';
import { cashConfig, makeRoom, playPassively, settle as settleTick } from './harness';

describe('ledger mode session', () => {
  it('a cash session with rebuys ends with balances summing to zero and a valid settlement', async () => {
    const config = cashConfig(
      { autoApprove: true, moneyMode: 'LEDGER', ledger: { currency: 'RM', ratio: { chips: 3, minor: 1 }, entryPrice: 0, rebuyPrice: 0, addOnPrice: 0 } },
      { minBuyIn: 40, maxBuyIn: 200 },
    );
    const { room, transport, clock, persistence } = makeRoom(config);
    const users = ['host', 'bob', 'cara', 'dan'];
    users.forEach((u, i) => {
      room.join(u, u);
      room.requestSeat(u, i, 100 + i * 13, 'waitForBB');
    });
    room.start('host');
    await settleTick();
    for (let h = 0; h < 6; h++) {
      await playPassively(room, transport, clock, users);
      if (h === 2) room.requestRebuy('bob', 50); // top-up mid-session
      await clock.advance(1500);
    }
    room.leaveSeat('cara'); // leaves mid-session
    await playPassively(room, transport, clock, users);
    await clock.advance(1500);
    room.end('host');
    await playPassively(room, transport, clock, users);
    await clock.advance(10);
    await room.flush();

    const results = persistence.ended.get('room1') as {
      ledger: { balances: { userId: string; net: number }[]; transfers: { from: string; to: string; amount: number }[]; discrepancies: unknown[] };
    };
    const { balances, transfers, discrepancies } = results.ledger;
    expect(discrepancies).toEqual([]);
    expect(balances.reduce((t, b) => t + b.net, 0)).toBe(0);
    const left = new Map(balances.map((b) => [b.userId, b.net]));
    for (const t of transfers) {
      left.set(t.from, left.get(t.from)! + t.amount);
      left.set(t.to, left.get(t.to)! - t.amount);
    }
    for (const v of left.values()) expect(v).toBe(0);
    // Chips in == chips out
    const chipsIn = persistence.ledger.filter((l) => l.type !== 'CASH_OUT').reduce((t, l) => t + l.chips, 0);
    const chipsOut = persistence.ledger.filter((l) => l.type === 'CASH_OUT').reduce((t, l) => t + l.chips, 0);
    expect(chipsIn).toBe(chipsOut);
  });
});
