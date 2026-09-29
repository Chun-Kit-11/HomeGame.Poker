export interface Contribution {
  seat: number;
  /** Total live chips put in this hand (excluding dead antes). */
  committed: number;
  /** Folded or mucked players contribute but cannot win. */
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Seats that can win this pot, in seat order. */
  eligible: number[];
}

/**
 * Splits contributions into a main pot and side pots.
 * Each all-in level of a live player creates a layer; folded players' chips
 * fall into whichever layers they reach. Layers with identical eligible sets merge.
 * `deadMoney` (e.g. the big blind ante) goes into the main pot.
 */
export function computePots(contribs: readonly Contribution[], deadMoney = 0): Pot[] {
  const live = contribs.filter((c) => !c.folded && c.committed > 0);
  const levels = [...new Set(live.map((c) => c.committed))].sort((a, b) => a - b);
  const maxAll = Math.max(0, ...contribs.map((c) => c.committed));
  if (levels.length === 0 || levels[levels.length - 1] < maxAll) levels.push(maxAll);

  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    if (level <= prev) continue;
    let amount = 0;
    for (const c of contribs) amount += Math.max(0, Math.min(c.committed, level) - prev);
    const eligible = live
      .filter((c) => c.committed >= level)
      .map((c) => c.seat)
      .sort((a, b) => a - b);
    prev = level;
    if (amount === 0) continue;
    const last = pots[pots.length - 1];
    if (eligible.length === 0 && last) {
      // Only folded money above every live player (cannot normally happen once uncalled bets are returned)
      last.amount += amount;
    } else if (last && sameSet(last.eligible, eligible)) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  if (deadMoney > 0) {
    if (pots.length === 0) pots.push({ amount: 0, eligible: live.map((c) => c.seat).sort((a, b) => a - b) });
    pots[0].amount += deadMoney;
  }
  return pots;
}

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Splits `amount` between `winners` equally. Odd chips go one at a time to the
 * winners closest to the left of the button (clockwise order).
 */
export function splitPot(amount: number, winners: number[], buttonSeat: number): Map<number, number> {
  const ordered = clockwiseFrom(buttonSeat, winners);
  const share = Math.floor(amount / ordered.length);
  let remainder = amount - share * ordered.length;
  const out = new Map<number, number>();
  for (const seat of ordered) {
    out.set(seat, share + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

/** Seats ordered clockwise starting with the first seat strictly after `from`. */
export function clockwiseFrom(from: number, seats: readonly number[]): number[] {
  return [...seats].sort((a, b) => dist(from, a) - dist(from, b));
}

function dist(from: number, seat: number) {
  const d = (seat - from + 1000) % 1000;
  return d === 0 ? 1000 : d;
}
