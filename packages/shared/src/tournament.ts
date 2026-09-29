import { defaultPayouts } from './config';

export interface Elimination {
  userId: string;
  /** Hand in which they busted (players busting in the same hand are ranked together) */
  handNo: number;
  /** Chips at the start of that hand: the bigger stack finishes higher */
  startStack: number;
}

export interface Standing {
  place: number;
  userId: string;
  /** Prize in minor units (0 in play-chip mode) */
  prize: number;
}

/**
 * Final standings: remaining players by chip count (winner first), then
 * eliminated players with the most recent bust-outs first. Players busting in
 * the same hand are ordered by starting stack; equal stacks share a place.
 */
export function rankStandings(remaining: { userId: string; stack: number }[], eliminations: Elimination[]): { place: number; userId: string }[] {
  type Entry = { userId: string; key: [number, number] };
  // key: [group (higher = better), stack within group]
  const entries: Entry[] = [
    ...remaining.map((r) => ({ userId: r.userId, key: [Number.MAX_SAFE_INTEGER, r.stack] as [number, number] })),
    ...eliminations.map((e) => ({ userId: e.userId, key: [e.handNo, e.startStack] as [number, number] })),
  ];
  entries.sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1]);
  const out: { place: number; userId: string }[] = [];
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    const tied = prev && prev.key[0] === e.key[0] && prev.key[1] === e.key[1] && e.key[0] !== Number.MAX_SAFE_INTEGER;
    out.push({ userId: e.userId, place: tied ? out[i - 1].place : i + 1 });
  });
  return out;
}

/**
 * Splits the prize pool by place percentages. Places beyond the number of
 * players are dropped and the remaining percentages rescaled. Rounding
 * leftovers go to first place so the payouts always sum to the pool exactly.
 */
export function placePrizes(pool: number, percents: number[], players: number): number[] {
  const used = percents.slice(0, Math.max(1, Math.min(percents.length, players)));
  const total = used.reduce((a, b) => a + b, 0) || 1;
  const prizes = used.map((p) => Math.floor((pool * p) / total));
  prizes[0] += pool - prizes.reduce((a, b) => a + b, 0);
  return prizes;
}

/** Standings with prizes. Tied players share the prizes of the places they occupy. */
export function computeStandings(
  remaining: { userId: string; stack: number }[],
  eliminations: Elimination[],
  pool: number,
  percents: number[] | null,
): Standing[] {
  const ranked = rankStandings(remaining, eliminations);
  const pct = percents ?? defaultPayouts(ranked.length);
  const prizes = placePrizes(pool, pct, ranked.length);
  const out: Standing[] = [];
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].place === ranked[i].place) j++;
    const group = ranked.slice(i, j + 1);
    const sum = group.reduce((t, _g, k) => t + (prizes[i + k] ?? 0), 0);
    const share = Math.floor(sum / group.length);
    let extra = sum - share * group.length;
    for (const g of group) {
      out.push({ place: g.place, userId: g.userId, prize: share + (extra > 0 ? 1 : 0) });
      if (extra > 0) extra--;
    }
    i = j + 1;
  }
  return out;
}
