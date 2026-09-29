import { describe, expect, it } from 'vitest';
import { pendingSeats, timeoutAction } from '../src/hand';
import { allIn, bet, call, check, play, players, stackOf, start } from './helpers';


const three = () =>
  start({
    players: players([1, 1000], [2, 1000], [3, 1000]),
    buttonSeat: 3,
    sbSeat: 1,
    bbSeat: 2,
    holes: { 1: 'Kc Kd', 2: 'As Ad', 3: '7c 2d' },
    board: '3c 8h 9s Jd 4c',
  });

function toRiver() {
  let s = play(three(), [
    [3, call],
    [1, call],
    [2, check],
  ]);
  s = play(s, [[1, check], [2, check], [3, check]]);
  s = play(s, [[1, check], [2, check], [3, check]]);
  return s;
}

describe('showdown', () => {
  it('last aggressor on the river shows first; losers may muck', () => {
    let s = toRiver();
    s = play(s, [
      [1, check],
      [2, check],
      [3, bet(200)], // bluff with 7-2
      [1, call],
      [2, call],
    ]);
    // Aggressor (seat 3) shows first; seat 1's KK beats it and seat 2's AA beats that,
    // so each could win when their turn came and shows automatically.
    const shows = s.events.filter((e) => e.type === 'show').map((e) => e.type === 'show' && e.seat);
    expect(shows).toEqual([3, 1, 2]);
    expect(s.phase).toBe('complete');
    expect(stackOf(s, 2)).toBe(1000 + 600);
  });

  it('a hand that cannot win may choose to muck', () => {
    let s = toRiver();
    s = play(s, [
      [1, bet(100)], // KK bets
      [2, call], // AA calls
      [3, call], // 72 calls
    ]);
    // Seat 1 shows KK first; seat 2 has AA (beats it) and shows; seat 3's 7-2 cannot win.
    expect(pendingSeats(s)).toEqual([3]);
    expect(timeoutAction(s, 3)).toEqual({ type: 'muck' });
    s = play(s, [[3, { type: 'muck' }]]);
    expect(s.phase).toBe('complete');
    const muck = s.events.find((e) => e.type === 'muck');
    expect(muck).toEqual({ type: 'muck', seat: 3 });
    expect(s.players.find((p) => p.seat === 3)!.shown).toBe(false);
    expect(stackOf(s, 2)).toBe(1000 - 200 + 600);
  });

  it('when nobody bets the river, the first player left of the button shows first', () => {
    let s = toRiver();
    s = play(s, [[1, check], [2, check], [3, check]]);
    expect(s.events.find((e) => e.type === 'show')).toMatchObject({ seat: 1 });
    // seat 2 (AA) shows automatically; seat 3 cannot win and is asked.
    expect(pendingSeats(s)).toEqual([3]);
    s = play(s, [[3, { type: 'show' }]]);
    expect(s.phase).toBe('complete');
  });

  it('all-in: every hand is tabled and nobody can muck', () => {
    let s = three();
    s = play(s, [
      [3, allIn],
      [1, call],
      [2, call],
    ]);
    expect(s.phase).toBe('complete');
    expect(s.events.filter((e) => e.type === 'reveal').map((e) => e.type === 'reveal' && e.seat)).toEqual([1, 2, 3]);
    expect(s.events.some((e) => e.type === 'muck')).toBe(false);
    expect(stackOf(s, 2)).toBe(3000);
  });
});
