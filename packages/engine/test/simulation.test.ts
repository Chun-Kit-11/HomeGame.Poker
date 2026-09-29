import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, pendingSeats, startHand } from '../src/hand';
import { type PositionCandidate, type PrevPositions, nextPositions, toPrev } from '../src/positions';
import type { HandState, PlayerAction } from '../src/types';

/** Small deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function botAction(s: HandState, seat: number, rnd: () => number): PlayerAction {
  if (s.phase === 'runItTwice') return { type: 'runItTwice', agree: rnd() < 0.5 };
  if (s.phase === 'showdown') return rnd() < 0.5 ? { type: 'show' } : { type: 'muck' };
  const la = legalActions(s, seat)!;
  const r = rnd();
  if (r < 0.12) return { type: 'fold' };
  const aggressive = la.canBet || la.canRaise;
  if (r < 0.2) return aggressive ? { type: 'allIn' } : la.canCheck ? { type: 'check' } : { type: 'call' };
  if (r < 0.45 && (la.canBet || la.canRaise)) {
    const to = la.minTo + Math.floor(rnd() * (la.maxTo - la.minTo + 1));
    return { type: la.canBet ? 'bet' : 'raise', to };
  }
  return la.canCheck ? { type: 'check' } : { type: 'call' };
}

const chipsOnTable = (s: HandState) => s.players.reduce((t, p) => t + p.stack + p.committed + p.ante, 0);

describe('simulation', () => {
  it('12,000 random bot hands: chips are always conserved and every hand completes', () => {
    const rnd = mulberry32(20260929);
    let hands = 0;
    let sessions = 0;
    while (hands < 12_000) {
      sessions++;
      // A fresh table of 2-9 players with random stacks and blinds
      const n = 2 + Math.floor(rnd() * 8);
      const allSeats = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rnd() - 0.5).slice(0, n);
      const bb = [2, 10, 100][Math.floor(rnd() * 3)];
      const sb = Math.floor(bb / 2);
      const ante = rnd() < 0.3 ? bb : 0;
      const stacks = new Map(allSeats.map((s) => [s, bb * (1 + Math.floor(rnd() * 150))]));
      const sessionTotal = [...stacks.values()].reduce((a, b) => a + b, 0);
      let prev: PrevPositions | null = null;

      for (let h = 0; h < 60 && hands < 12_000; h++) {
        const cands: PositionCandidate[] = [...stacks.entries()]
          .filter(([, st]) => st > 0)
          .map(([seat]) => ({ seat, id: `p${seat}`, entry: 'active' }));
        const pos = nextPositions(cands, prev, (k) => Math.floor(rnd() * k));
        if (!pos) break;
        prev = toPrev(pos);
        const deck = Array.from({ length: 52 }, (_, i) => i);
        for (let i = 51; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        let s = startHand({
          handNo: h + 1,
          players: pos.dealtSeats.map((seat) => ({ seat, id: `p${seat}`, stack: stacks.get(seat)! })),
          buttonSeat: pos.buttonSeat,
          sbSeat: pos.sbSeat,
          bbSeat: pos.bbSeat,
          smallBlind: sb,
          bigBlind: bb,
          bigBlindAnte: ante,
          deck,
          runItTwiceAllowed: rnd() < 0.3,
        });
        const handTotal = s.players.reduce((t, p) => t + p.startStack, 0);
        let steps = 0;
        while (s.phase !== 'complete') {
          const pending = pendingSeats(s);
          expect(pending.length).toBeGreaterThan(0);
          const seat = pending[Math.floor(rnd() * pending.length)];
          s = applyAction(s, seat, botAction(s, seat, rnd));
          if (chipsOnTable(s) !== handTotal && s.phase !== 'complete') {
            throw new Error(`chips not conserved mid-hand ${hands}`);
          }
          if (++steps > 500) throw new Error('hand did not terminate');
        }
        // After the hand, all chips are back in stacks
        const final = s.players.reduce((t, p) => t + p.stack, 0);
        if (final !== handTotal) throw new Error(`hand ${hands}: ${final} != ${handTotal}`);
        for (const p of s.players) {
          if (p.stack < 0 || !Number.isInteger(p.stack)) throw new Error('bad stack');
          stacks.set(p.seat, p.stack);
        }
        // No card appears twice
        const seen = [...s.board, ...(s.board2 ?? []).slice(s.board.length), ...s.players.flatMap((p) => p.holeCards)];
        if (new Set(seen).size !== seen.length) throw new Error('duplicate card');
        // pot events account for every chip put in
        const potSum = s.events.reduce((t, e) => t + (e.type === 'pot' ? e.amount : 0), 0);
        const uncalled = s.events.reduce((t, e) => t + (e.type === 'uncalled' ? e.amount : 0), 0);
        const posted = s.events.reduce((t, e) => t + (e.type === 'post' || e.type === 'action' ? e.amount : 0), 0);
        if (potSum !== posted - uncalled) throw new Error(`pot mismatch in hand ${hands}`);
        hands++;
      }
      expect([...stacks.values()].reduce((a, b) => a + b, 0)).toBe(sessionTotal);
    }
    expect(hands).toBe(12_000);
    expect(sessions).toBeGreaterThan(100);
  });
});
