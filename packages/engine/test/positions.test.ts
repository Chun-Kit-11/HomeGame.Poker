import { describe, expect, it } from 'vitest';
import { type PositionCandidate, nextPositions, positionLabels, toPrev } from '../src/positions';

const c = (seat: number, entry: PositionCandidate['entry'] = 'active'): PositionCandidate => ({ seat, id: `p${seat}`, entry });

describe('button and blinds (dead button rule)', () => {
  it('first hand: SB and BB follow the chosen button', () => {
    const p = nextPositions([c(1), c(3), c(5), c(7)], null, () => 1)!;
    expect(p).toMatchObject({ buttonSeat: 3, sbSeat: 5, bbSeat: 7, dealtSeats: [1, 3, 5, 7] });
  });

  it('first hand heads-up: button is the small blind', () => {
    const p = nextPositions([c(2), c(6)], null, () => 0)!;
    expect(p).toMatchObject({ buttonSeat: 2, sbSeat: 2, bbSeat: 6, headsUp: true });
  });

  it('normal rotation moves everything one player clockwise', () => {
    let p = nextPositions([c(1), c(3), c(5), c(7)], null, () => 0)!; // btn 1, sb 3, bb 5
    p = nextPositions([c(1), c(3), c(5), c(7)], toPrev(p))!;
    expect(p).toMatchObject({ buttonSeat: 3, sbSeat: 5, bbSeat: 7 });
    p = nextPositions([c(1), c(3), c(5), c(7)], toPrev(p))!;
    expect(p).toMatchObject({ buttonSeat: 5, sbSeat: 7, bbSeat: 1 });
  });

  it('the big blind leaving produces a dead small blind next hand', () => {
    const prev = { buttonSeat: 1, sbPositionSeat: 3, bbSeat: 5, bbId: 'p5' };
    // Player in seat 5 (last BB) left.
    const p = nextPositions([c(1), c(3), c(7), c(8)], prev)!;
    expect(p).toMatchObject({ buttonSeat: 3, sbSeat: null, sbPositionSeat: 5, bbSeat: 7 });
  });

  it('the small blind leaving produces a dead button next hand', () => {
    const prev = { buttonSeat: 1, sbPositionSeat: 3, bbSeat: 5, bbId: 'p5' };
    // Player in seat 3 (last SB) left: button stays on the empty seat 3.
    const p = nextPositions([c(1), c(5), c(7), c(8)], prev)!;
    expect(p).toMatchObject({ buttonSeat: 3, sbSeat: 5, bbSeat: 7 });
  });

  it('nobody skips the big blind when a player busts', () => {
    const seats = [1, 2, 3, 4, 5];
    let cands = seats.map((s) => c(s));
    let p = nextPositions(cands, null, () => 0)!; // btn 1 sb 2 bb 3
    const bbCount = new Map<number, number>();
    for (let hand = 0; hand < 20; hand++) {
      bbCount.set(p.bbSeat, (bbCount.get(p.bbSeat) ?? 0) + 1);
      if (hand === 7) cands = cands.filter((x) => x.seat !== 4); // seat 4 busts
      const before = p.bbSeat;
      p = nextPositions(cands, toPrev(p))!;
      expect(p.bbSeat).not.toBe(before); // never the big blind twice in a row
    }
    // Every remaining player paid the big blind a similar number of times
    const counts = [1, 2, 3, 5].map((s) => bbCount.get(s) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('going heads-up: the player who was just BB does not get the BB twice', () => {
    const prev = { buttonSeat: 1, sbPositionSeat: 2, bbSeat: 3, bbId: 'p3' };
    // seat 2 busted; seats 1 and 3 remain
    const p = nextPositions([c(1), c(3)], prev)!;
    expect(p).toMatchObject({ headsUp: true, bbSeat: 1, buttonSeat: 3, sbSeat: 3 });
  });

  it('heads-up to three-handed keeps the rotation valid', () => {
    const prev = { buttonSeat: 1, sbPositionSeat: 1, bbSeat: 5, bbId: 'p5' };
    // New player sits in seat 3 (between the button and BB), joins as active
    const p = nextPositions([c(1), c(3), c(5)], prev)!;
    expect(p.bbSeat).toBe(1);
    expect(p.sbSeat).toBe(5);
    expect(p.buttonSeat).toBe(3);
    expect(new Set([p.bbSeat, p.sbSeat, p.buttonSeat]).size).toBe(3);
  });

  it('a new player waiting for the big blind is dealt in only when the BB reaches them', () => {
    const prev = { buttonSeat: 1, sbPositionSeat: 2, bbSeat: 3, bbId: 'p3' };
    let p = nextPositions([c(1), c(2), c(3), c(6, 'waitForBB'), c(8)], prev)!;
    // seat 6 is the next seat after BB 3, so they get the BB right away
    expect(p.bbSeat).toBe(6);
    expect(p.dealtSeats).toContain(6);

    p = nextPositions([c(1), c(2), c(3), c(5), c(6, 'waitForBB')], { buttonSeat: 3, sbPositionSeat: 5, bbSeat: 1, bbId: 'p1' })!;
    // BB moves to seat 2; seat 6 keeps waiting
    expect(p.bbSeat).toBe(2);
    expect(p.dealtSeats).not.toContain(6);
  });

  it('a new player posting a big blind is dealt in, except between the button and the BB', () => {
    const prev = { buttonSeat: 1, sbPositionSeat: 2, bbSeat: 3, bbId: 'p3' };
    let p = nextPositions([c(1), c(2), c(3), c(5), c(7, 'postBB')], prev)!;
    // btn 2, sb 3, bb 5: seat 7 posts
    expect(p).toMatchObject({ buttonSeat: 2, sbSeat: 3, bbSeat: 5 });
    expect(p.postBBSeats).toEqual([7]);
    expect(p.dealtSeats).toContain(7);

    // A player sitting in the small-blind area must wait
    p = nextPositions([c(1), c(2), c(3), c(4, 'postBB'), c(6)], { buttonSeat: 8, sbPositionSeat: 1, bbSeat: 3, bbId: 'p3' })!;
    // btn 1, sb 3, bb = next after 3 = 4 (the new player takes the BB itself)
    expect(p.bbSeat).toBe(4);
    expect(p.postBBSeats).toEqual([]);
  });

  it('labels positions', () => {
    const l = positionLabels([1, 2, 3, 4, 5, 6], 6, 1, 2);
    expect(Object.fromEntries(l)).toEqual({ 1: 'SB', 2: 'BB', 3: 'LJ', 4: 'HJ', 5: 'CO', 6: 'BTN' });
    expect(Object.fromEntries(positionLabels([3, 7], 3, 3, 7))).toEqual({ 3: 'BTN', 7: 'BB' });
  });
});
