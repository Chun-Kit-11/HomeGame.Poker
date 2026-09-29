import { describe, expect, it } from 'vitest';
import { applyAction, fullDeck, startHand, timeoutAction } from '../src';
import { type PositionCandidate, nextPositions, toPrev } from '../src/positions';

describe('player leaving mid-session', () => {
  it('a player leaving mid-hand is folded when their turn comes; next hand skips their seat', () => {
    const cands = (seats: number[]): PositionCandidate[] => seats.map((seat) => ({ seat, id: `p${seat}`, entry: 'active' }));
    const stacks = new Map([
      [1, 1000],
      [2, 1000],
      [3, 1000],
      [4, 1000],
    ]);
    const pos = nextPositions(cands([1, 2, 3, 4]), null, () => 0)!; // btn 1, sb 2, bb 3
    let s = startHand({
      handNo: 1,
      players: pos.dealtSeats.map((seat) => ({ seat, id: `p${seat}`, stack: stacks.get(seat)! })),
      buttonSeat: pos.buttonSeat,
      sbSeat: pos.sbSeat,
      bbSeat: pos.bbSeat,
      smallBlind: 50,
      bigBlind: 100,
      deck: fullDeck(),
    });
    expect(s.toAct).toBe(4);
    s = applyAction(s, 4, { type: 'call' });
    // Seat 1 has left the table: the server auto-acts with the timeout action.
    expect(s.toAct).toBe(1);
    const auto = timeoutAction(s, 1)!;
    expect(auto).toEqual({ type: 'fold' });
    s = applyAction(s, 1, auto);
    s = applyAction(s, 2, { type: 'fold' });
    s = applyAction(s, 3, { type: 'check' });
    while (s.phase !== 'complete') s = applyAction(s, s.toAct!, { type: 'check' });
    const total = s.players.reduce((t, p) => t + p.stack, 0);
    expect(total).toBe(4000);

    // Seat 1 (the button) is gone for the next hand: dead-button rule applies.
    const next = nextPositions(cands([2, 3, 4]), toPrev(pos))!;
    expect(next).toMatchObject({ buttonSeat: 2, sbSeat: 3, bbSeat: 4, dealtSeats: [2, 3, 4] });
    // And when the big blind leaves too, the small blind is dead.
    const after = nextPositions(cands([2, 3]), toPrev(next))!;
    expect(after.headsUp).toBe(true);
    expect(after.bbSeat).toBe(2);
    expect(after.buttonSeat).toBe(3);
  });
});
