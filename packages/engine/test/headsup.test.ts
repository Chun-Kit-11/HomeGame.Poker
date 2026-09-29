import { describe, expect, it } from 'vitest';
import { legalActions, pendingSeats } from '../src/hand';
import { call, check, fold, play, players, raise, stackOf, start } from './helpers';

const hu = () =>
  start({
    players: players([1, 1000], [2, 1000]),
    buttonSeat: 1,
    sbSeat: 1,
    bbSeat: 2,
    holes: { 1: 'As Ad', 2: 'Kc Kd' },
    board: '2c 7h 9s Jd 3c',
  });

describe('heads-up', () => {
  it('button posts the small blind and acts first preflop', () => {
    const s = hu();
    expect(stackOf(s, 1)).toBe(950);
    expect(stackOf(s, 2)).toBe(900);
    expect(s.toAct).toBe(1);
  });

  it('big blind keeps the option after a limp and acts first postflop', () => {
    let s = play(hu(), [[1, call]]);
    expect(s.toAct).toBe(2);
    expect(legalActions(s, 2)!.canCheck).toBe(true);
    expect(legalActions(s, 2)!.canRaise).toBe(true);
    s = play(s, [[2, check]]);
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(2); // BB first postflop, button last
    s = play(s, [[2, check]]);
    expect(s.toAct).toBe(1);
  });

  it('small blind fold returns nothing extra and BB wins the blinds', () => {
    const s = play(hu(), [[1, fold]]);
    expect(s.phase).toBe('complete');
    expect(stackOf(s, 1)).toBe(950);
    expect(stackOf(s, 2)).toBe(1050);
  });

  it('min-raise is the size of the previous raise', () => {
    let s = hu();
    expect(legalActions(s, 1)!.minTo).toBe(200);
    expect(() => play(s, [[1, raise(150)]])).toThrow(/Minimum is 200/);
    s = play(s, [[1, raise(300)]]); // raise of 200
    expect(legalActions(s, 2)!.minTo).toBe(500);
    s = play(s, [[2, raise(500)]]);
    expect(legalActions(s, 1)!.minTo).toBe(700);
  });

  it('checked-down river: first player left of the button (BB) shows first', () => {
    let s = play(hu(), [[1, call], [2, check]]);
    for (let i = 0; i < 3; i++) s = play(s, [[2, check], [1, check]]);
    expect(s.phase).toBe('complete');
    const shows = s.events.filter((e) => e.type === 'show' || e.type === 'muck');
    expect(shows[0]).toMatchObject({ type: 'show', seat: 2 });
    // AA wins; KK was offered show/muck, timed out/mucked is handled in showdown tests.
  });

  it('only one player is asked to act at a time', () => {
    const s = hu();
    expect(pendingSeats(s)).toEqual([1]);
  });
});
