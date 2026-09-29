import { describe, expect, it } from 'vitest';
import { computeStandings, defaultLevels, defaultPayouts, placePrizes, rankStandings } from '../src';

describe('tournament maths', () => {
  it('default payout structure by field size', () => {
    expect(defaultPayouts(3)).toEqual([100]);
    expect(defaultPayouts(4)).toEqual([100]);
    expect(defaultPayouts(5)).toEqual([65, 35]);
    expect(defaultPayouts(6)).toEqual([65, 35]);
    expect(defaultPayouts(7)).toEqual([50, 30, 20]);
    expect(defaultPayouts(9)).toEqual([50, 30, 20]);
  });

  it('prizes always sum to the pool', () => {
    for (const pool of [0, 1, 99, 10_000, 12_345, 99_999]) {
      for (const pct of [[100], [65, 35], [50, 30, 20], [33, 33, 34]]) {
        const p = placePrizes(pool, pct, 9);
        expect(p.reduce((a, b) => a + b, 0)).toBe(pool);
      }
    }
    expect(placePrizes(10_000, [50, 30, 20], 2)).toEqual([6250, 3750]); // rescaled when fewer players
  });

  it('ranks by elimination order, stack size within the same hand, and shares exact ties', () => {
    const r = rankStandings(
      [{ userId: 'win', stack: 9000 }],
      [
        { userId: 'first-out', handNo: 3, startStack: 500 },
        { userId: 'b', handNo: 10, startStack: 800 },
        { userId: 'c', handNo: 10, startStack: 1200 },
        { userId: 'd', handNo: 12, startStack: 700 },
        { userId: 'e', handNo: 12, startStack: 700 },
      ],
    );
    expect(r).toEqual([
      { userId: 'win', place: 1 },
      { userId: 'd', place: 2 },
      { userId: 'e', place: 2 },
      { userId: 'c', place: 4 },
      { userId: 'b', place: 5 },
      { userId: 'first-out', place: 6 },
    ]);
  });

  it('tied players split the prizes of the places they occupy', () => {
    const s = computeStandings(
      [{ userId: 'w', stack: 1 }],
      [
        { userId: 'x', handNo: 5, startStack: 100 },
        { userId: 'y', handNo: 5, startStack: 100 },
        { userId: 'z', handNo: 1, startStack: 100 },
        { userId: 'q', handNo: 0, startStack: 100 },
        { userId: 'r', handNo: 0, startStack: 50 },
        { userId: 's', handNo: 0, startStack: 40 },
      ],
      10_001,
      null, // 7 players -> 50/30/20
    );
    const prize = Object.fromEntries(s.map((x) => [x.userId, x.prize]));
    expect(prize.w).toBe(5001);
    expect(prize.x + prize.y).toBe(3000 + 2000);
    expect(Math.abs(prize.x - prize.y)).toBeLessThanOrEqual(1);
    expect(prize.z).toBe(0);
    expect(s.reduce((t, x) => t + x.prize, 0)).toBe(10_001);
  });

  it('default blind schedule scales and has BB antes from level 3', () => {
    const l = defaultLevels(10_000);
    expect(l[0]).toEqual({ sb: 25, bb: 50, ante: 0 });
    expect(l[1].ante).toBe(0);
    expect(l[2]).toEqual({ sb: 75, bb: 150, ante: 150 });
    const small = defaultLevels(1_500);
    for (let i = 1; i < small.length; i++) expect(small[i].bb).toBeGreaterThanOrEqual(small[i - 1].bb);
    for (const lv of small) expect(lv.sb).toBeLessThanOrEqual(lv.bb);
  });
});
