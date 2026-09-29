import { describe, expect, it } from 'vitest';
import { computeBalances, csvField, findDiscrepancies, type LedgerLine, settle, toCsv } from '../src/ledger';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/** Random cash session: buy-ins, rebuys, and chips moving between players, then everyone cashes out. */
function randomCashSession(r: () => number): LedgerLine[] {
  const n = 2 + Math.floor(r() * 9);
  const stacks = new Map<string, number>();
  const lines: LedgerLine[] = [];
  for (let i = 0; i < n; i++) {
    const buy = 1 + Math.floor(r() * 1000);
    stacks.set(`p${i}`, buy);
    lines.push({ userId: `p${i}`, type: 'BUY_IN', chips: buy, amountMinor: 0 });
  }
  for (let k = 0; k < 50; k++) {
    const ids = [...stacks.keys()];
    const a = ids[Math.floor(r() * ids.length)];
    const b = ids[Math.floor(r() * ids.length)];
    const amt = Math.floor(r() * stacks.get(a)!);
    stacks.set(a, stacks.get(a)! - amt);
    stacks.set(b, stacks.get(b)! + amt);
    if (r() < 0.1) {
      const add = 1 + Math.floor(r() * 300);
      stacks.set(a, stacks.get(a)! + add);
      lines.push({ userId: a, type: stacks.get(a)! === add ? 'REBUY' : 'TOP_UP', chips: add, amountMinor: 0 });
    }
  }
  for (const [id, s] of stacks) lines.push({ userId: id, type: 'CASH_OUT', chips: s, amountMinor: 0 });
  return lines;
}

describe('ledger', () => {
  it('always sums to zero, including awkward chip ratios (1,000 random sessions)', () => {
    const r = rng(42);
    const ratios = [
      { chips: 1, minor: 100 },
      { chips: 100, minor: 100 },
      { chips: 3, minor: 1 },
      { chips: 7, minor: 11 },
    ];
    for (let i = 0; i < 1000; i++) {
      const lines = randomCashSession(r);
      const ratio = ratios[i % ratios.length];
      const { balances } = computeBalances(lines, 'CASH', ratio);
      expect(balances.reduce((t, b) => t + b.net, 0)).toBe(0);
      expect(findDiscrepancies(balances, 'CASH')).toEqual([]);
      // Each net is the exact value rounded to within one minor unit
      for (const b of balances) {
        const exact = ((b.chipsOut - b.chipsIn) * ratio.minor) / ratio.chips;
        expect(Math.abs(b.net - exact)).toBeLessThan(1);
      }
      // The settlement moves exactly the right amounts
      const transfers = settle(balances);
      const after = new Map(balances.map((b) => [b.userId, b.net]));
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0);
        after.set(t.from, after.get(t.from)! + t.amount);
        after.set(t.to, after.get(t.to)! - t.amount);
      }
      for (const v of after.values()) expect(v).toBe(0);
    }
  });

  it('flags chips that were never cashed out and results that do not balance', () => {
    const lines: LedgerLine[] = [
      { userId: 'a', type: 'BUY_IN', chips: 100, amountMinor: 100 },
      { userId: 'b', type: 'BUY_IN', chips: 100, amountMinor: 100 },
      { userId: 'a', type: 'CASH_OUT', chips: 150, amountMinor: 150 },
    ];
    const { balances } = computeBalances(lines, 'CASH', { chips: 1, minor: 1 });
    const d = findDiscrepancies(balances, 'CASH');
    expect(d.map((x) => x.kind).sort()).toEqual(['chips', 'money']);
  });

  it('tournament: prices and payouts balance to zero', () => {
    const lines: LedgerLine[] = [
      { userId: 'a', type: 'ENTRY', chips: 1000, amountMinor: 2000 },
      { userId: 'b', type: 'ENTRY', chips: 1000, amountMinor: 2000 },
      { userId: 'b', type: 'REBUY', chips: 1000, amountMinor: 2000 },
      { userId: 'c', type: 'ENTRY', chips: 1000, amountMinor: 2000 },
      { userId: 'a', type: 'PAYOUT', chips: 0, amountMinor: 8000 },
    ];
    const { balances } = computeBalances(lines, 'TOURNAMENT');
    expect(Object.fromEntries(balances.map((b) => [b.userId, b.net]))).toEqual({ a: 6000, b: -4000, c: -2000 });
    expect(findDiscrepancies(balances, 'TOURNAMENT')).toEqual([]);
  });

  it('finds the minimum number of transfers (checked against brute force)', () => {
    // Two independent pairs: 2 transfers, whereas naive greedy can use 3
    const t = settle([
      { userId: 'a', net: 5 },
      { userId: 'b', net: -5 },
      { userId: 'c', net: 7 },
      { userId: 'd', net: -7 },
    ]);
    expect(t).toHaveLength(2);
    const r = rng(7);
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(r() * 6);
      const nets = Array.from({ length: n - 1 }, () => Math.floor(r() * 21) - 10);
      nets.push(-nets.reduce((a, b) => a + b, 0));
      const bal = nets.map((net, k) => ({ userId: `u${k}`, net }));
      expect(settle(bal).length).toBe(bruteMin(nets.filter((x) => x !== 0)));
    }
  });

  it('writes safe CSV', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('-12.50')).toBe('-12.50');
    expect(toCsv([['x', 1], ['y', 2]])).toBe('x,1\r\ny,2\r\n');
  });
});

/** Minimum transfers = n - (max number of disjoint zero-sum groups), by brute force over set partitions. */
function bruteMin(nets: number[]): number {
  const n = nets.length;
  let best = 0;
  const assign = (i: number, groups: number[]) => {
    if (i === n) {
      if (groups.every((g) => g === 0)) best = Math.max(best, groups.length);
      return;
    }
    for (let g = 0; g < groups.length; g++) {
      groups[g] += nets[i];
      assign(i + 1, groups);
      groups[g] -= nets[i];
    }
    groups.push(nets[i]);
    assign(i + 1, groups);
    groups.pop();
  };
  assign(0, []);
  return n - best;
}
