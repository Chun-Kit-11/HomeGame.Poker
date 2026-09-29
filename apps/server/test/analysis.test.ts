import { describe, expect, it } from 'vitest';
import { applyAction, parseCards, startHand, type HandState, type PlayerAction } from '@poker/engine';
import { analyzeHand, AnalysisError, handPercentile, topRange } from '../src/analysis/analyze';
import data from '../src/analysis/preflop-data.json';
import { riggedDeck } from '../../../packages/engine/test/helpers';

function play(opts: { stacks: [number, number][]; button: number; sb: number; bb: number; holes: Record<number, string>; board: string; steps: [number, PlayerAction][] }): HandState {
  let s = startHand({
    handNo: 1,
    players: opts.stacks.map(([seat, stack]) => ({ seat, id: `p${seat}`, stack })),
    buttonSeat: opts.button,
    sbSeat: opts.sb,
    bbSeat: opts.bb,
    smallBlind: 50,
    bigBlind: 100,
    deck: riggedDeck({ buttonSeat: opts.button, holes: opts.holes, board: opts.board }),
  });
  for (const [seat, a] of opts.steps) s = applyAction(s, seat, a);
  // Losing hands at showdown are mucked so the hand completes
  while (s.phase === 'showdown' && s.showdown?.awaiting != null) s = applyAction(s, s.showdown.awaiting, { type: 'muck' });
  return s;
}

const analyse = (s: HandState, hero: number) =>
  analyzeHand({
    config: s.config,
    events: s.events,
    heroSeat: hero,
    heroCards: s.players.find((p) => p.seat === hero)!.holeCards,
    names: { 1: 'alice', 2: 'bob', 3: 'cara' },
    samples: 3000,
    seed: 12345,
  });

describe('hand analysis', () => {
  it('precomputed data matches published heads-up push/fold charts', () => {
    const pct = data.pushPercentByStack as Record<string, number>;
    expect(pct['10']).toBeGreaterThan(54);
    expect(pct['10']).toBeLessThan(62);
    expect(data.pushMax.AA).toBe(25);
    expect(data.pushMax['72o']).toBeLessThan(3);
    expect(data.ranking[0].hand).toBe('AA');
    expect(handPercentile('AA')).toBe(0);
    expect(topRange(100).size).toBe(169);
  });

  it('refuses hands that are not finished', () => {
    const s = play({ stacks: [[1, 1000], [2, 1000]], button: 1, sb: 1, bb: 2, holes: { 1: 'As Ad', 2: 'Kc Kd' }, board: '2c 7h 9s Jd 3c', steps: [] });
    expect(() => analyse(s, 1)).toThrow(AnalysisError);
  });

  it('short-stacked small blind: push/fold equilibrium (K7o shoves at 8bb, 72o folds)', () => {
    const shove = play({
      stacks: [[1, 800], [2, 5000]],
      button: 1,
      sb: 1,
      bb: 2,
      holes: { 1: 'Kc 7d', 2: 'Qs Qd' },
      board: '2c 3h 9s Jd 4c',
      steps: [[1, { type: 'allIn' }], [2, { type: 'call' }]],
    });
    const [d] = analyse(shove, 1);
    expect(d.tier).toBe('B');
    expect(d.recommendation.action).toBe('shove');
    expect(d.matches).toBe(true);

    const trash = play({ stacks: [[1, 800], [2, 5000]], button: 1, sb: 1, bb: 2, holes: { 1: '7c 2d', 2: 'Qs Qd' }, board: '2c 3h 9s Jd 4c', steps: [[1, { type: 'allIn' }], [2, { type: 'call' }]] });
    const [t] = analyse(trash, 1);
    expect(t.recommendation.action).toBe('fold');
    expect(t.matches).toBe(false);
  });

  it('big blind facing a small-blind shove uses the Nash calling range', () => {
    const s = play({ stacks: [[1, 1000], [2, 5000]], button: 1, sb: 1, bb: 2, holes: { 1: '9c 8c', 2: 'As 5d' }, board: '2c 3h 9s Jd 4c', steps: [[1, { type: 'allIn' }], [2, { type: 'call' }]] });
    const [d] = analyse(s, 2);
    expect(d.source).toMatch(/Nash/);
    expect(d.recommendation.action).toBe('call');
  });

  it('river: folds air to a big bet, raises the nuts; pot odds and MDF are exact', () => {
    const steps: [number, PlayerAction][] = [
      [3, { type: 'call' }],
      [1, { type: 'call' }],
      [2, { type: 'check' }],
      [1, { type: 'check' }], [2, { type: 'check' }], [3, { type: 'check' }],
      [1, { type: 'check' }], [2, { type: 'check' }], [3, { type: 'check' }],
      [1, { type: 'fold' }],
      [2, { type: 'bet', to: 300 }],
      [3, { type: 'call' }],
    ];
    const base = { stacks: [[1, 5000], [2, 5000], [3, 5000]] as [number, number][], button: 3, sb: 1, bb: 2, board: 'Ks Qd 8h 4c 2s' };
    const air = play({ ...base, holes: { 1: 'Jc Tc', 2: 'Ah Kd', 3: '7c 3d' }, steps });
    const d = analyse(air, 3).at(-1)!;
    expect(d.street).toBe('river');
    expect(d.pot).toBe(600);
    expect(d.toCall).toBe(300);
    expect(d.requiredEquity).toBeCloseTo(1 / 3, 5);
    expect(d.mdf).toBeCloseTo(0.5, 5);
    expect(d.recommendation.action).toBe('fold');
    expect(d.evCall!).toBeLessThan(0);

    const nuts = play({ ...base, board: 'Ks Qd 8h 4c 2s', holes: { 1: 'Jc Tc', 2: 'Ah Qh', 3: 'Kh Kd' }, steps });
    const n = analyse(nuts, 3).at(-1)!;
    expect(n.equity!).toBeGreaterThan(0.9);
    expect(n.recommendation.action).toBe('raise');
  });

  it("never uses opponents' actual (unshown) cards", () => {
    const mk = (villain: string) =>
      play({
        stacks: [[1, 5000], [2, 5000]],
        button: 1,
        sb: 1,
        bb: 2,
        holes: { 1: 'Ac Kd', 2: villain },
        board: 'Qs 9d 4h 7c 2s',
        steps: [
          [1, { type: 'raise', to: 250 }],
          [2, { type: 'call' }],
          [2, { type: 'check' }], [1, { type: 'bet', to: 300 }], [2, { type: 'fold' }],
        ],
      });
    const a = analyse(mk('Jh Th'), 1);
    const b = analyse(mk('3c 3d'), 1);
    expect(a.map((d) => [d.equity, d.recommendation])).toEqual(b.map((d) => [d.equity, d.recommendation]));
  });
});
