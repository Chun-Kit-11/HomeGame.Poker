import { describe, expect, it } from 'vitest';
import { legalActions } from '../src/hand';
import { allIn, bet, call, check, fold, play, players, raise, start } from './helpers';

describe('incomplete all-in raises', () => {
  const four = (stacks: [number, number, number, number]) =>
    start({
      players: players([1, stacks[0]], [2, stacks[1]], [3, stacks[2]], [4, stacks[3]]),
      buttonSeat: 4,
      sbSeat: 1,
      bbSeat: 2,
    });

  it('does not reopen betting for a player who already acted', () => {
    let s = four([1000, 1000, 1000, 150]);
    s = play(s, [
      [3, call], // UTG limps 100
      [4, allIn], // 150: raise of 50 < 100, incomplete
      [1, fold],
    ]);
    // BB has not acted yet: full options
    expect(legalActions(s, 2)!.canRaise).toBe(true);
    expect(legalActions(s, 2)!.minTo).toBe(250); // 150 + full raise of 100
    s = play(s, [[2, call]]);
    // UTG faces only 50 more (< a full raise): may call or fold, not raise
    const la = legalActions(s, 3)!;
    expect(la.callAmount).toBe(50);
    expect(la.canRaise).toBe(false);
    expect(() => play(s, [[3, raise(400)]])).toThrow(/not open/);
    expect(() => play(s, [[3, allIn]])).toThrow(/not open/);
    s = play(s, [[3, call]]);
    expect(s.street).toBe('flop');
  });

  it('a full raise after an incomplete all-in reopens betting', () => {
    let s = four([1000, 1000, 1000, 150]);
    s = play(s, [
      [3, call],
      [4, allIn], // 150
      [1, fold],
      [2, raise(250)], // full raise over 150
    ]);
    expect(legalActions(s, 3)!.canRaise).toBe(true);
  });

  it('several short all-ins that add up to a full raise reopen betting', () => {
    let s = start({
      players: players([1, 1000], [2, 1000], [3, 250], [4, 300]),
      buttonSeat: 4,
      sbSeat: 1,
      bbSeat: 2,
    });
    s = play(s, [
      [3, call],
      [4, call],
      [1, call],
      [2, check],
    ]);
    // flop: 3 has 150 left, 4 has 200 left
    s = play(s, [
      [1, bet(100)],
      [2, fold],
      [3, allIn], // 150: +50, incomplete
      [4, allIn], // 200: +50 over 150, incomplete, but 100 over seat 1's bet
    ]);
    const la = legalActions(s, 1)!;
    expect(la.callAmount).toBe(100);
    // Seat 1 now faces a full raise in total (100) and may raise... but every
    // opponent is all-in, so there is nobody left to raise against.
    expect(la.canRaise).toBe(false);
  });

  it('cumulative short all-ins reopen betting when someone can still respond', () => {
    let s = start({
      players: players([1, 1000], [2, 1000], [3, 250], [4, 300], [5, 1000]),
      buttonSeat: 5,
      sbSeat: 1,
      bbSeat: 2,
    });
    s = play(s, [
      [3, call],
      [4, call],
      [5, call],
      [1, call],
      [2, check],
    ]);
    s = play(s, [
      [1, bet(100)],
      [2, fold],
      [3, allIn], // 150
      [4, allIn], // 200
      [5, call],
    ]);
    // Seat 1 bet 100 and now faces 200: a full raise's worth, so betting reopens.
    const la = legalActions(s, 1)!;
    expect(la.canRaise).toBe(true);
    expect(la.minTo).toBe(300);
    // Seat 5 had called 200, only faces a re-raise if seat 1 raises.
  });

  it('an all-in bet smaller than the big blind', () => {
    let s = start({
      players: players([1, 160], [2, 1000], [3, 1000], [4, 1000]),
      buttonSeat: 4,
      sbSeat: 1,
      bbSeat: 2,
    });
    s = play(s, [
      [3, call],
      [4, call],
      [1, call],
      [2, check],
    ]);
    // Flop: seat 1 (first to act) bets all-in for 60, less than the big blind.
    s = play(s, [[1, allIn]]);
    // Seat 2 has not acted: may call 60 or raise to at least a full bet plus a full raise.
    let la = legalActions(s, 2)!;
    expect(la.callAmount).toBe(60);
    expect(la.minTo).toBe(200);
    s = play(s, [[2, raise(200)]]);
    expect(legalActions(s, 3)!.minTo).toBe(300);
  });

  it('a player who checked cannot raise a short all-in bet (TDA: not facing a full bet)', () => {
    let s = start({
      players: players([1, 1000], [2, 1000], [3, 160]),
      buttonSeat: 3,
      sbSeat: 1,
      bbSeat: 2,
    });
    s = play(s, [
      [3, call],
      [1, call],
      [2, check],
      [1, check],
      [2, check],
      [3, allIn], // 60
    ]);
    const la = legalActions(s, 1)!;
    expect(la.callAmount).toBe(60);
    expect(la.canRaise).toBe(false);
  });

  it('players must call the full big blind when the big blind is all-in for less', () => {
    const s = start({
      players: players([1, 1000], [2, 30], [3, 1000]),
      buttonSeat: 3,
      sbSeat: 1,
      bbSeat: 2,
    });
    const la = legalActions(s, 3)!;
    expect(la.callAmount).toBe(100);
    expect(la.minTo).toBe(200);
  });
});
