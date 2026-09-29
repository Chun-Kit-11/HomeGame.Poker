import { describe, expect, it } from 'vitest';
import { preflopFlags } from '../src';
import { call, fold, play, players, raise, start } from './helpers';

describe('preflop flags for player profiles', () => {
  const table = () => start({ players: players([1, 1000], [2, 1000], [3, 1000], [4, 1000]), buttonSeat: 4, sbSeat: 1, bbSeat: 2 });

  it('button open after folds is a steal attempt; BB re-raise is a 3-bet', () => {
    const s = play(table(), [
      [3, fold],
      [4, raise(250)],
      [1, fold],
      [2, raise(800)],
      [4, fold],
    ]);
    expect(preflopFlags(s.events, 4, 'BTN')).toMatchObject({ stealOpp: true, steal: true, vpip: true, pfr: true, threeBet: false });
    expect(preflopFlags(s.events, 2, 'BB')).toMatchObject({ threeBetOpp: true, threeBet: true, vpip: true, pfr: true });
    expect(preflopFlags(s.events, 1, 'SB')).toMatchObject({ stealOpp: false, vpip: false });
  });

  it('a limp before you removes the steal opportunity; calling a raise is not a 3-bet', () => {
    const s = play(table(), [
      [3, call],
      [4, raise(300)],
      [1, call],
      [2, fold],
      [3, fold],
    ]);
    expect(preflopFlags(s.events, 4, 'BTN').stealOpp).toBe(false);
    expect(preflopFlags(s.events, 1, 'SB')).toMatchObject({ threeBetOpp: true, threeBet: false, vpip: true, pfr: false });
  });
});
