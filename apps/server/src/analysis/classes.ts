import { RANK_CHARS, type Card } from '@poker/engine';

/** The 169 starting-hand classes: "AA", "AKs", "AKo", ... in a fixed order. */
export const CLASSES: string[] = (() => {
  const out: string[] = [];
  for (let hi = 12; hi >= 0; hi--) {
    for (let lo = hi; lo >= 0; lo--) {
      if (hi === lo) out.push(RANK_CHARS[hi] + RANK_CHARS[lo]);
      else {
        out.push(`${RANK_CHARS[hi]}${RANK_CHARS[lo]}s`);
        out.push(`${RANK_CHARS[hi]}${RANK_CHARS[lo]}o`);
      }
    }
  }
  return out;
})();

export const CLASS_INDEX = new Map(CLASSES.map((c, i) => [c, i]));

export function classOf(a: Card, b: Card): string {
  const ra = a >> 2;
  const rb = b >> 2;
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  if (hi === lo) return RANK_CHARS[hi] + RANK_CHARS[lo];
  return `${RANK_CHARS[hi]}${RANK_CHARS[lo]}${(a & 3) === (b & 3) ? 's' : 'o'}`;
}

/** All concrete two-card combos of a class. */
export function combosOf(cls: string): [Card, Card][] {
  const hi = RANK_CHARS.indexOf(cls[0]);
  const lo = RANK_CHARS.indexOf(cls[1]);
  const out: [Card, Card][] = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      const a = (hi << 2) | s1;
      const b = (lo << 2) | s2;
      if (hi === lo) {
        if (s2 > s1) out.push([a, b]);
      } else if (cls[2] === 's' ? s1 === s2 : s1 !== s2) out.push([a, b]);
    }
  }
  return out;
}

export const COMBO_COUNT = (cls: string) => (cls.length === 2 ? 6 : cls[2] === 's' ? 4 : 12);
