import type { Card } from './cards';
import { scoreHand } from './evaluator';

/**
 * Each player's share of the pot if the board is run out, given everyone's
 * hole cards. Exact enumeration when two or fewer board cards are to come
 * (flop/turn); a seeded Monte Carlo preflop. Ties split. Results sum to 1.
 */
export function equities(holes: readonly Card[][], board: readonly Card[], opts: { samples?: number; seed?: number } = {}): number[] {
  const used = new Set<Card>([...board, ...holes.flat()]);
  if (used.size !== board.length + holes.length * 2) throw new Error('Duplicate cards');
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const need = 5 - board.length;
  const shares = new Array<number>(holes.length).fill(0);
  let runs = 0;

  const settle = (full: Card[]) => {
    let best = -1;
    let winners: number[] = [];
    for (let i = 0; i < holes.length; i++) {
      const s = scoreHand([...holes[i], ...full]);
      if (s > best) {
        best = s;
        winners = [i];
      } else if (s === best) winners.push(i);
    }
    for (const w of winners) shares[w] += 1 / winners.length;
    runs++;
  };

  if (need === 0) settle([...board]);
  else if (need === 1) for (const a of deck) settle([...board, a]);
  else if (need === 2) {
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) settle([...board, deck[i], deck[j]]);
  } else {
    let s = opts.seed ?? 0x1234567;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const samples = opts.samples ?? 20_000;
    const d = [...deck];
    for (let n = 0; n < samples; n++) {
      for (let k = 0; k < need; k++) {
        const j = k + Math.floor(rnd() * (d.length - k));
        [d[k], d[j]] = [d[j], d[k]];
      }
      settle([...board, ...d.slice(0, need)]);
    }
  }
  return shares.map((x) => x / runs);
}
