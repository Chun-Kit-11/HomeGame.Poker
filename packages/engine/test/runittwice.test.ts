import { describe, expect, it } from 'vitest';
import { pendingSeats } from '../src/hand';
import { allIn, call, fold, play, players, potEvents, stackOf, start } from './helpers';

const setup = () =>
  start({
    players: players([1, 1000], [2, 1000], [3, 1000]),
    buttonSeat: 3,
    sbSeat: 1,
    bbSeat: 2,
    runItTwiceAllowed: true,
    holes: { 1: 'As Ad', 2: 'Kc Kd', 3: '7c 2d' },
    board: '3c 8h 9s Jd 4c', // run 1: aces win
    board2Extra: 'Kh 5d 6h', // run 2: flop reused? no - second run deals turn/river/... after flop
  });

describe('run it twice', () => {
  it('asks every player in the pot and runs twice if all agree', () => {
    // All-in on the flop so the second run deals a new turn and river.
    let s = play(setup(), [
      [3, fold],
      [1, call],
      [2, { type: 'check' }],
      [1, allIn],
      [2, call],
    ]);
    expect(s.phase).toBe('runItTwice');
    expect(pendingSeats(s).sort()).toEqual([1, 2]);
    s = play(s, [
      [1, { type: 'runItTwice', agree: true }],
      [2, { type: 'runItTwice', agree: true }],
    ]);
    expect(s.phase).toBe('complete');
    expect(s.board2).not.toBeNull();
    expect(s.board2!.slice(0, 3)).toEqual(s.board.slice(0, 3));
    const pots = potEvents(s);
    expect(pots).toHaveLength(2);
    // Pot is 2000: 1000 per run. Run 1: board 3c 8h 9s Jd 4c -> aces. Run 2: turn Kh -> set of kings.
    expect(pots[0]).toMatchObject({ run: 1, amount: 1000, winners: [{ seat: 1, amount: 1000 }] });
    expect(pots[1]).toMatchObject({ run: 2, amount: 1000, winners: [{ seat: 2, amount: 1000 }] });
    expect(stackOf(s, 1)).toBe(1000);
    expect(stackOf(s, 2)).toBe(1000);
  });

  it('runs once if anyone declines', () => {
    let s = play(setup(), [
      [3, fold],
      [1, call],
      [2, { type: 'check' }],
      [1, allIn],
      [2, call],
      [2, { type: 'runItTwice', agree: false }],
    ]);
    expect(s.phase).toBe('complete');
    expect(s.board2).toBeNull();
    expect(stackOf(s, 1)).toBe(2000);
  });
});
