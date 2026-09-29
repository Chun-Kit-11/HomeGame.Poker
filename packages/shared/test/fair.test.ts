import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SeedStream, combineClientSeeds, commitmentOf, shuffleDeck, verifyHand } from '../src/fair';

describe('provably fair shuffle', () => {
  const seed = 'a'.repeat(64);

  it('commitment is plain SHA-256 of the seed text (checkable with any tool)', () => {
    expect(commitmentOf(seed)).toBe(createHash('sha256').update(seed).digest('hex'));
  });

  it('the stream matches an independent Node crypto HMAC implementation', () => {
    const s = new SeedStream(seed, '1:x|4:y', 'ROOM#1');
    const block = createHmac('sha256', seed).update('1:x|4:y:ROOM#1:0').digest();
    for (let i = 0; i < 8; i++) expect(s.nextUint32()).toBe(block.readUInt32BE(i * 4));
    const block2 = createHmac('sha256', seed).update('1:x|4:y:ROOM#1:1').digest();
    expect(s.nextUint32()).toBe(block2.readUInt32BE(0));
  });

  it('is deterministic and produces a permutation', () => {
    const a = shuffleDeck(seed, 'c', 'H#1');
    const b = shuffleDeck(seed, 'c', 'H#1');
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i));
  });

  it('any change to a seed or the hand id changes the deck', () => {
    const base = shuffleDeck(seed, 'c', 'H#1');
    expect(shuffleDeck('b'.repeat(64), 'c', 'H#1')).not.toEqual(base);
    expect(shuffleDeck(seed, 'd', 'H#1')).not.toEqual(base);
    expect(shuffleDeck(seed, 'c', 'H#2')).not.toEqual(base);
  });

  it('client seeds are combined in seat order regardless of arrival order', () => {
    expect(combineClientSeeds([{ seat: 5, seed: 'q' }, { seat: 1, seed: 'p' }])).toBe('1:p|5:q');
  });

  it('verifyHand detects a wrong commitment', () => {
    const h = commitmentOf(seed);
    expect(verifyHand({ serverSeed: seed, serverSeedHash: h, clientSeeds: '', handId: 'x' }).hashOk).toBe(true);
    expect(verifyHand({ serverSeed: seed, serverSeedHash: h.replace(/^./, '0'), clientSeeds: '', handId: 'x' }).hashOk).toBe(h.startsWith('0'));
  });

  it('is statistically uniform: each card lands in each position about equally (chi-square)', () => {
    const N = 20_000;
    const counts = Array.from({ length: 52 }, () => new Array(52).fill(0));
    for (let i = 0; i < N; i++) {
      const deck = shuffleDeck(randomBytes(32).toString('hex'), 'x', `T#${i}`);
      deck.forEach((card, pos) => counts[pos][card]++);
    }
    // Chi-square over the 52x52 table: 51*51 = 2601 degrees of freedom.
    const expected = N / 52;
    let chi = 0;
    for (const row of counts) for (const c of row) chi += (c - expected) ** 2 / expected;
    // mean 2601, sd ~ 72; accept within ~5 sd
    expect(chi).toBeGreaterThan(2601 - 360);
    expect(chi).toBeLessThan(2601 + 360);
  });

  it('rejection sampling gives exact uniformity for small ranges', () => {
    const s = new SeedStream(seed, '', 'u');
    const counts = new Array(3).fill(0);
    for (let i = 0; i < 30_000; i++) counts[s.nextInt(3)]++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });
});
