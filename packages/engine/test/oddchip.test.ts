import { describe, expect, it } from 'vitest';
import { splitPot } from '../src/pots';
import { call, check, fold, play, players, potEvents, stackOf, start } from './helpers';

describe('split pots and the odd chip', () => {
  it('splitPot gives odd chips to the first winners left of the button', () => {
    expect([...splitPot(35, [1, 2, 3], 1)]).toEqual([
      [2, 12],
      [3, 12],
      [1, 11],
    ]);
    expect([...splitPot(35, [1, 3], 1)]).toEqual([
      [3, 18],
      [1, 17],
    ]);
    // Wraps around the table
    expect([...splitPot(11, [2, 7], 7)]).toEqual([
      [2, 6],
      [7, 5],
    ]);
  });

  it('three-way chop when the board plays, odd chips left of the button', () => {
    // Blinds 5/10 with a 5 BB ante: pot = 3 x 10 + 5 = 35
    let s = start({
      players: players([1, 500], [2, 500], [3, 500]),
      buttonSeat: 1,
      sbSeat: 2,
      bbSeat: 3,
      smallBlind: 5,
      bigBlind: 10,
      bigBlindAnte: 5,
      holes: { 1: '2c 3d', 2: '2d 3c', 3: '2h 3h' },
      board: 'As Ks Qs Js Ts',
    });
    s = play(s, [
      [1, call],
      [2, call],
      [3, check],
    ]);
    for (let i = 0; i < 3; i++) s = play(s, [[2, check], [3, check], [1, check]]);
    expect(s.phase).toBe('complete');
    const pot = potEvents(s)[0];
    expect(pot).toMatchObject({ amount: 35, description: 'Royal Flush' });
    // seat 2 is first left of the button, then seat 3
    expect(stackOf(s, 2)).toBe(490 + 12);
    expect(stackOf(s, 3)).toBe(485 + 12);
    expect(stackOf(s, 1)).toBe(490 + 11);
  });

  it('two-way chop of an odd pot after a fold', () => {
    let s = start({
      players: players([1, 500], [2, 500], [3, 500]),
      buttonSeat: 1,
      sbSeat: 2,
      bbSeat: 3,
      smallBlind: 5,
      bigBlind: 10,
      bigBlindAnte: 5,
      holes: { 1: '2c 3d', 2: '4d 5c', 3: '2h 3h' },
      board: 'As Ks Qs Js 9d',
    });
    s = play(s, [
      [1, call],
      [2, call],
      [3, check],
      [2, fold],
    ]);
    for (let i = 0; i < 3; i++) s = play(s, [[3, check], [1, check]]);
    // Seats 1 and 3 both play the board: pot 35, split 17/18, seat 3 is first left of the button among winners.
    const pot = potEvents(s)[0];
    expect(pot).toMatchObject({ amount: 35 });
    expect(stackOf(s, 3)).toBe(485 + 18);
    expect(stackOf(s, 1)).toBe(490 + 17);
    expect(stackOf(s, 2)).toBe(490);
  });
});
