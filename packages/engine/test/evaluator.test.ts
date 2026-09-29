import { describe, expect, it } from 'vitest';
import { HandCategory, categoryOf, describeScore, evaluateHand, parseCards, scoreHand } from '../src';
import { referenceScore7 } from './reference-evaluator';

const s = (cards: string) => scoreHand(parseCards(cards));
const d = (cards: string) => describeScore(s(cards));

describe('hand evaluator', () => {
  it('ranks categories correctly', () => {
    const order = [
      'As Kd 9h 7c 3s', // high card
      '2s 2d 9h 7c 3s', // pair
      '2s 2d 9h 9c 3s', // two pair
      '2s 2d 2h 9c 3s', // trips
      'As 2d 3h 4c 5s', // wheel straight
      '2s 7s 9s Js 3s', // flush
      '2s 2d 2h 3c 3s', // full house
      '2s 2d 2h 2c 3s', // quads
      'As 2s 3s 4s 5s', // steel wheel
    ];
    for (let i = 1; i < order.length; i++) expect(s(order[i])).toBeGreaterThan(s(order[i - 1]));
    expect(categoryOf(s('Ts Js Qs Ks As'))).toBe(HandCategory.StraightFlush);
  });

  it('handles kickers and ties', () => {
    expect(s('As Ad Kh 7c 3s')).toBeGreaterThan(s('Ac Ah Qh 7c 3s'));
    expect(s('As Ad Kh 7c 4s')).toBeGreaterThan(s('Ac Ah Kd 7d 3s'));
    expect(s('As Ad Kh 7c 3s')).toBe(s('Ac Ah Kd 7d 3c'));
    // Two pair: second pair then kicker
    expect(s('Ks Kd 9h 9c 2s')).toBeGreaterThan(s('Kh Kc 8h 8c As'));
    expect(s('Ks Kd 9h 9c 3s')).toBeGreaterThan(s('Kh Kc 9s 9d 2c'));
    // Wheel is the lowest straight; broadway beats king-high
    expect(s('2s 3d 4h 5c 6s')).toBeGreaterThan(s('As 2d 3h 4c 5s'));
    expect(s('Ts Jd Qh Kc As')).toBeGreaterThan(s('9s Td Jh Qc Ks'));
    // Q-K-A-2-3 is not a straight
    expect(categoryOf(s('Qs Kd Ah 2c 3s'))).toBe(HandCategory.HighCard);
    // Flush compares all five cards
    expect(s('As Ts 8s 6s 4s')).toBeGreaterThan(s('Ad Td 8d 6d 3d'));
  });

  it('picks the best five of seven', () => {
    // Board plays: both have the same straight
    expect(s('2c 3d 5s 6h 7d 8c 9s')).toBe(s('Ac Kd 5s 6h 7d 8c 9s'));
    // Two trips make a full house with the higher trips
    expect(d('Ks Kd Kh 7c 7s 7d 2c')).toBe('Full House, Kings full of Sevens');
    // Three pairs: best two pairs + best kicker (which may be the third pair)
    expect(s('As Ad Ks Kd Qs Qd 2c')).toBe(s('Ah Ac Kh Kc Qh 3c 2d'));
    // Flush + straight -> the flush; straight flush beats quads
    expect(categoryOf(s('4h 5h 6h 7h 9h 8c 2h'))).toBe(HandCategory.Flush);
    expect(categoryOf(s('4h 5h 6h 7h 8h 8c 8d'))).toBe(HandCategory.StraightFlush);
    // Six-card straight uses the top five
    expect(d('4c 5d 6h 7s 8c 9d Kh')).toBe('Straight, Nine high');
  });

  it('describes hands', () => {
    expect(d('As Ks Qs Js Ts')).toBe('Royal Flush');
    expect(d('9s 8s 7s 6s 5s')).toBe('Straight Flush, Nine high');
    expect(d('Qs Qd Qh Qc 3s')).toBe('Four of a Kind, Queens');
    expect(d('As 9s 7s 4s 2s')).toBe('Flush, Ace high');
    expect(d('As 2d 3h 4c 5s')).toBe('Straight, Five high');
    expect(d('9s 9d 9h Kc 3s')).toBe('Three of a Kind, Nines');
    expect(d('As Ad Th Tc 3s')).toBe('Two Pair, Aces and Tens');
    expect(d('Js Jd 9h 7c 3s')).toBe('Pair of Jacks');
    expect(d('As Qd 9h 7c 3s')).toBe('High Card, Ace');
    expect(d('6s 6d 6h 2c 2s')).toBe('Full House, Sixes full of Twos');
  });

  it('returns the best five cards', () => {
    const e = evaluateHand(parseCards('Ah Kh 2c Qh Jh 3d Th'));
    expect(e.description).toBe('Royal Flush');
    expect(e.best.sort()).toEqual(parseCards('Ah Kh Qh Jh Th').sort());
  });

  it('exhaustive: all 2,598,960 five-card hands have the known category counts', () => {
    const counts = new Array(9).fill(0);
    const distinct = new Set<number>();
    const h = [0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 52; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
              const sc = scoreHand(h);
              counts[categoryOf(sc)]++;
              distinct.add(sc);
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
    // There are exactly 7,462 distinct 5-card hand values.
    expect(distinct.size).toBe(7462);
  });

  it('agrees with an independent brute-force reference on 50,000 random 7-card hands', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let mismatches = 0;
    for (let i = 0; i < 50_000; i++) {
      const deck = Array.from({ length: 52 }, (_, k) => k);
      for (let k = 0; k < 7; k++) {
        const j = k + rnd(52 - k);
        [deck[k], deck[j]] = [deck[j], deck[k]];
      }
      const a = deck.slice(0, 7);
      const b = [...a.slice(0, 5), deck[7], deck[8]]; // same board, different hole cards
      const ea = scoreHand(a);
      const eb = scoreHand(b);
      const ra = referenceScore7(a);
      const rb = referenceScore7(b);
      if (Math.sign(ea - eb) !== Math.sign(compareRef(ra, rb)) || categoryOf(ea) !== ra[0]) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

function compareRef(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}
