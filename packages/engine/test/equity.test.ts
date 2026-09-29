import { describe, expect, it } from 'vitest';
import { equities, parseCards } from '../src';

const h = (s: string) => parseCards(s);

describe('equities', () => {
  it('preflop classics (Monte Carlo within 1%)', () => {
    const [aa, kk] = equities([h('As Ah'), h('Kd Kc')], []);
    // Exact value by full enumeration of all 1,712,304 boards: 0.81255
    expect(Math.abs(aa - 0.81255)).toBeLessThan(0.01);
    expect(aa + kk).toBeCloseTo(1, 10);
    // AKs vs 22: close to a coin flip
    const [ak] = equities([h('As Ks'), h('2d 2c')], []);
    expect(Math.abs(ak - 0.5)).toBeLessThan(0.03);
  });

  it('exact on the turn: one out', () => {
    // Board gives KK a set; AA needs one of the two remaining aces? Only one ace left: 1 out of 44
    const e = equities([h('As Ah'), h('Kd Kc')], h('Ks 7d 2c 9h'));
    expect(e[0]).toBeCloseTo(2 / 44, 10); // Ad and Ac both still in the deck
  });

  it('exact on the flop and ties split', () => {
    const e = equities([h('Ac 2c'), h('Ad 2d')], h('Ks Qs Js'));
    // Same ranks: they tie unless a flush is made (spade needed for neither) -> always a split
    expect(e[0]).toBeCloseTo(0.5, 10);
    expect(e[1]).toBeCloseTo(0.5, 10);
  });

  it('three-way shares sum to one', () => {
    const e = equities([h('As Ah'), h('Kd Kc'), h('7s 8s')], h('2s 5s 9d'));
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(() => equities([h('As Ah'), h('As Kc')], [])).toThrow(/Duplicate/);
  });
});
