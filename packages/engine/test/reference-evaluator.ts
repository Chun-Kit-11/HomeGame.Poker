/**
 * Deliberately simple, independent evaluator used only to cross-check the
 * fast evaluator: sorts a 5-card hand into [category, ...tiebreak ranks] and
 * takes the max over all 21 five-card subsets of seven cards.
 */
export function referenceScore5(cards: number[]): number[] {
  const ranks = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const suits = cards.map((c) => c & 3);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join(',') === '12,3,2,1,0') straightHigh = 3;
  }
  const groups = new Map<number, number>();
  for (const r of ranks) groups.set(r, (groups.get(r) ?? 0) + 1);
  // sort by count desc then rank desc
  const g = [...groups.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = g.map(([r]) => r);
  const shape = g.map(([, c]) => c).join('');
  if (straightHigh >= 0 && flush) return [8, straightHigh];
  if (shape === '41') return [7, ...byGroup];
  if (shape === '32') return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh >= 0) return [4, straightHigh];
  if (shape === '311') return [3, ...byGroup];
  if (shape === '221') return [2, ...byGroup];
  if (shape === '2111') return [1, ...byGroup];
  return [0, ...ranks];
}

export function referenceScore7(cards: number[]): number[] {
  let best: number[] | null = null;
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      const sc = referenceScore5(five);
      if (!best || cmp(sc, best) > 0) best = sc;
    }
  return best!;
}

function cmp(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}
