import { describe, expect, it } from 'vitest';
import { computePots } from '../src/pots';
import { allIn, call, fold, play, players, potEvents, stackOf, start, startTotal } from './helpers';

describe('side pots', () => {
  it('computePots layers all-in levels and includes folded chips', () => {
    const pots = computePots([
      { seat: 1, committed: 100, folded: false },
      { seat: 2, committed: 300, folded: false },
      { seat: 3, committed: 600, folded: false },
      { seat: 4, committed: 600, folded: false },
      { seat: 5, committed: 250, folded: true },
    ]);
    expect(pots).toEqual([
      { amount: 500, eligible: [1, 2, 3, 4] },
      { amount: 750, eligible: [2, 3, 4] },
      { amount: 600, eligible: [3, 4] },
    ]);
  });

  it('three all-ins of different sizes: each pot goes to the best eligible hand', () => {
    // Seat 1 has the best hand but the shortest stack; seat 4 the worst hand.
    let s = start({
      players: players([1, 100], [2, 300], [3, 600], [4, 1000]),
      buttonSeat: 4,
      sbSeat: 1,
      bbSeat: 2,
      smallBlind: 5,
      bigBlind: 10,
      holes: { 1: 'As Ad', 2: 'Ks Kd', 3: 'Qs Qd', 4: '7c 2d' },
      board: '3c 8h 9s Jd 4c',
    });
    s = play(s, [
      [3, allIn], // 600
      [4, call], // 600, 400 behind
      [1, allIn], // 100
      [2, allIn], // 300
    ]);
    expect(s.phase).toBe('complete');
    const pots = potEvents(s);
    expect(pots.map((p) => p.type === 'pot' && [p.amount, p.winners])).toEqual([
      [400, [{ seat: 1, amount: 400 }]],
      [600, [{ seat: 2, amount: 600 }]],
      [600, [{ seat: 3, amount: 600 }]],
    ]);
    expect([1, 2, 3, 4].map((x) => stackOf(s, x))).toEqual([400, 600, 600, 400]);
    expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(startTotal(s));
  });

  it('side pot tie splits only that pot', () => {
    let s = start({
      players: players([1, 100], [2, 500], [3, 500]),
      buttonSeat: 3,
      sbSeat: 1,
      bbSeat: 2,
      smallBlind: 5,
      bigBlind: 10,
      holes: { 1: 'As Ad', 2: 'Kh Qh', 3: 'Kd Qd' },
      board: '2c 7s 9s Jd 3c',
    });
    s = play(s, [
      [3, allIn],
      [1, allIn],
      [2, call],
    ]);
    const pots = potEvents(s);
    expect(pots[0]).toMatchObject({ amount: 300, winners: [{ seat: 1, amount: 300 }] });
    expect(pots[1]).toMatchObject({ amount: 800, winners: [{ seat: 2, amount: 400 }, { seat: 3, amount: 400 }] });
  });

  it('uncalled part of a bet is returned before pots are formed', () => {
    let s = start({
      players: players([1, 1000], [2, 250], [3, 1000]),
      buttonSeat: 3,
      sbSeat: 1,
      bbSeat: 2,
      smallBlind: 5,
      bigBlind: 10,
      holes: { 1: 'As Ad', 2: 'Kh Kd', 3: '7c 2d' },
      board: '2c 8s 9s Jd 3c',
    });
    s = play(s, [
      [3, fold],
      [1, allIn], // 1000
      [2, allIn], // 250 (call for less)
    ]);
    const uncalled = s.events.find((e) => e.type === 'uncalled');
    expect(uncalled).toEqual({ type: 'uncalled', seat: 1, amount: 750 });
    expect(stackOf(s, 1)).toBe(1000 - 250 + 500);
    expect(stackOf(s, 2)).toBe(0);
  });

  it('big blind ante is dead money in the main pot and the blind has priority', () => {
    // BB has 150: posts 100 blind, 50 ante.
    let s = start({
      players: players([1, 1000], [2, 150], [3, 1000]),
      buttonSeat: 3,
      sbSeat: 1,
      bbSeat: 2,
      smallBlind: 50,
      bigBlind: 100,
      bigBlindAnte: 100,
      holes: { 1: '7c 2d', 2: 'As Ad', 3: '8c 3d' },
      board: '2c 8s 9s Jd 4c',
    });
    const posts = s.events.filter((e) => e.type === 'post');
    expect(posts).toEqual([
      { type: 'post', seat: 1, kind: 'sb', amount: 50, allIn: false },
      { type: 'post', seat: 2, kind: 'bb', amount: 100, allIn: false },
      { type: 'post', seat: 2, kind: 'ante', amount: 50, allIn: true },
    ]);
    s = play(s, [
      [3, call],
      [1, call],
    ]);
    // BB is all-in; the other two continue betting in a side pot.
    expect(s.street).toBe('flop');
    s = play(s, [
      [1, { type: 'bet', to: 200 }],
      [3, fold],
    ]);
    // 300 live + 50 ante = 350 main pot for BB's aces; seat 1 wins the uncalled 200 back.
    expect(stackOf(s, 2)).toBe(350);
    expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(2150);
  });
});
