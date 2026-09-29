import { type Card, RANK_NAMES, RANK_PLURALS, rankOf, suitOf } from './cards';

/**
 * Hand evaluator for 5, 6 or 7 cards.
 *
 * The result is a single integer "score": higher is better, equal means a tie.
 *   score = category * 16^5 + r1 * 16^4 + r2 * 16^3 + r3 * 16^2 + r4 * 16 + r5
 * where r1..r5 are the ranks that matter for that category in order of importance.
 */
export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

const WHEEL = 0b1_0000_0000_1111; // A,5,4,3,2

function make(category: number, r: number[]): number {
  let s = category;
  for (let i = 0; i < 5; i++) s = s * 16 + (r[i] ?? 0);
  return s;
}

/** Highest straight in a 13-bit rank mask, as the rank of its top card, or -1. */
function straightHigh(mask: number): number {
  for (let high = 12; high >= 4; high--) {
    if (((mask >> (high - 4)) & 0x1f) === 0x1f) return high;
  }
  return (mask & WHEEL) === WHEEL ? 3 : -1;
}

/** Top `n` ranks set in `mask`, excluding those in `exclude`. */
function topRanks(mask: number, n: number, exclude = 0): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (mask & (1 << r) && !(exclude & (1 << r))) out.push(r);
  }
  return out;
}

export function scoreHand(cards: readonly Card[]): number {
  if (cards.length < 5 || cards.length > 7) throw new Error(`Need 5-7 cards, got ${cards.length}`);
  const counts = new Array<number>(13).fill(0);
  const suitCounts = [0, 0, 0, 0];
  const suitMasks = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    counts[r]++;
    suitCounts[s]++;
    suitMasks[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMasks[flushSuit]);
    if (sf >= 0) return make(HandCategory.StraightFlush, [sf]);
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quad >= 0) return make(HandCategory.Quads, [quad, topRanks(rankMask, 1, 1 << quad)[0]]);
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const pairRank = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return make(HandCategory.FullHouse, [trips[0], pairRank]);
  }
  if (flushSuit >= 0) return make(HandCategory.Flush, topRanks(suitMasks[flushSuit], 5));
  const st = straightHigh(rankMask);
  if (st >= 0) return make(HandCategory.Straight, [st]);
  if (trips.length > 0) {
    return make(HandCategory.Trips, [trips[0], ...topRanks(rankMask, 2, 1 << trips[0])]);
  }
  if (pairs.length >= 2) {
    const ex = (1 << pairs[0]) | (1 << pairs[1]);
    return make(HandCategory.TwoPair, [pairs[0], pairs[1], topRanks(rankMask, 1, ex)[0]]);
  }
  if (pairs.length === 1) {
    return make(HandCategory.Pair, [pairs[0], ...topRanks(rankMask, 3, 1 << pairs[0])]);
  }
  return make(HandCategory.HighCard, topRanks(rankMask, 5));
}

export const categoryOf = (score: number): HandCategory => Math.floor(score / 0x100000) as HandCategory;

/** The five significant ranks encoded in a score. */
export function ranksOf(score: number): number[] {
  const out: number[] = [];
  for (let i = 4; i >= 0; i--) out.push(Math.floor(score / 16 ** i) % 16);
  return out;
}

/** Human-readable description, e.g. "Flush, Ace high" or "Full House, Kings full of Sevens". */
export function describeScore(score: number): string {
  const [a, b] = ranksOf(score);
  switch (categoryOf(score)) {
    case HandCategory.StraightFlush:
      return a === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[a]} high`;
    case HandCategory.Quads:
      return `Four of a Kind, ${RANK_PLURALS[a]}`;
    case HandCategory.FullHouse:
      return `Full House, ${RANK_PLURALS[a]} full of ${RANK_PLURALS[b]}`;
    case HandCategory.Flush:
      return `Flush, ${RANK_NAMES[a]} high`;
    case HandCategory.Straight:
      return `Straight, ${RANK_NAMES[a]} high`;
    case HandCategory.Trips:
      return `Three of a Kind, ${RANK_PLURALS[a]}`;
    case HandCategory.TwoPair:
      return `Two Pair, ${RANK_PLURALS[a]} and ${RANK_PLURALS[b]}`;
    case HandCategory.Pair:
      return `Pair of ${RANK_PLURALS[a]}`;
    default:
      return `High Card, ${RANK_NAMES[a]}`;
  }
}

export interface EvaluatedHand {
  score: number;
  category: HandCategory;
  description: string;
  /** The best five cards (for highlighting). */
  best: Card[];
}

/** Full evaluation including the best 5-card combination. */
export function evaluateHand(cards: readonly Card[]): EvaluatedHand {
  const score = scoreHand(cards);
  let best: Card[] = cards.slice(0, 5);
  if (cards.length > 5) {
    const n = cards.length;
    search: for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
              if (scoreHand(five) === score) {
                best = five;
                break search;
              }
            }
  }
  return { score, category: categoryOf(score), description: describeScore(score), best };
}
