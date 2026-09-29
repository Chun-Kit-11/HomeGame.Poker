import { clockwiseFrom } from './pots';

/**
 * Seat/blind assignment between hands using the DEAD BUTTON rule (TDA):
 *  - the big blind always moves forward to the next eligible player,
 *  - the small blind is posted by last hand's big blind (or is dead if they left),
 *  - the button goes to last hand's small-blind position (possibly an empty seat).
 * Heads-up: the button posts the small blind and the big blind alternates.
 */

export type EntryStatus =
  /** Normal player, dealt in every hand */
  | 'active'
  /** New/returning player waiting until the big blind reaches them */
  | 'waitForBB'
  /** New/returning player who posts a live big blind to be dealt in now */
  | 'postBB';

export interface PositionCandidate {
  seat: number;
  id: string;
  entry: EntryStatus;
}

export interface PrevPositions {
  buttonSeat: number;
  /** Seat of the small-blind position (even if the SB was dead) */
  sbPositionSeat: number;
  bbSeat: number;
  bbId: string;
}

export interface HandPositions {
  buttonSeat: number;
  /** Seat that posts the small blind, or null for a dead small blind */
  sbSeat: number | null;
  sbPositionSeat: number;
  bbSeat: number;
  bbId: string;
  /** Seats dealt into this hand, in seat order */
  dealtSeats: number[];
  /** Seats (not SB/BB) posting a live big blind to enter */
  postBBSeats: number[];
  headsUp: boolean;
}

/**
 * @param candidates everyone seated with chips who is not sitting out
 * @param prev positions of the previous hand, or null for the first hand
 * @param pickIndex chooses the first button (0..n-1); pass a CSPRNG-backed function
 */
export function nextPositions(
  candidates: readonly PositionCandidate[],
  prev: PrevPositions | null,
  pickIndex: (n: number) => number = () => 0,
): HandPositions | null {
  const cands = [...candidates].sort((a, b) => a.seat - b.seat);
  if (cands.length < 2) return null;
  const bySeat = new Map(cands.map((c) => [c.seat, c]));

  if (!prev) {
    const seats = cands.map((c) => c.seat);
    const button = seats[pickIndex(seats.length) % seats.length];
    return firstHand(seats, button, bySeat);
  }

  // The big blind moves to the next eligible player (waiting players included).
  const bbSeat = clockwiseFrom(prev.bbSeat, cands.map((c) => c.seat))[0];

  let dealt = new Set(cands.filter((c) => c.entry !== 'waitForBB').map((c) => c.seat));
  dealt.add(bbSeat);
  if (dealt.size < 2) dealt = new Set(cands.map((c) => c.seat));

  const build = (dealtSet: Set<number>): HandPositions => {
    const seats = [...dealtSet].sort((a, b) => a - b);
    const bbId = bySeat.get(bbSeat)!.id;
    if (seats.length === 2) {
      const other = seats.find((s) => s !== bbSeat)!;
      return { buttonSeat: other, sbSeat: other, sbPositionSeat: other, bbSeat, bbId, dealtSeats: seats, postBBSeats: [], headsUp: true };
    }
    const sbPositionSeat = prev.bbSeat;
    const prevBB = bySeat.get(prev.bbSeat);
    const sbSeat = prevBB && prevBB.id === prev.bbId && dealtSet.has(prev.bbSeat) && prev.bbSeat !== bbSeat ? prev.bbSeat : null;
    let buttonSeat = prev.sbPositionSeat;
    if (buttonSeat === bbSeat || buttonSeat === sbPositionSeat) {
      // Only possible when leaving heads-up: put the button on the dealt player before the SB position.
      const others = seats.filter((s) => s !== bbSeat && s !== sbPositionSeat);
      buttonSeat = clockwiseFrom(sbPositionSeat, others).at(-1)!;
    }
    const postBBSeats = seats.filter((s) => bySeat.get(s)!.entry === 'postBB' && s !== bbSeat && s !== sbSeat);
    return { buttonSeat, sbSeat, sbPositionSeat, bbSeat, bbId, dealtSeats: seats, postBBSeats, headsUp: false };
  };

  let pos = build(dealt);
  if (!pos.headsUp) {
    // New players posting in may not enter between the button and the big blind.
    const blocked = pos.postBBSeats.filter((s) => s === pos.buttonSeat || inOpenArc(pos.buttonSeat, pos.bbSeat, s));
    if (blocked.length > 0) {
      const reduced = new Set([...dealt].filter((s) => !blocked.includes(s)));
      pos = build(reduced.size >= 2 ? reduced : dealt);
    }
  }
  return pos;
}

function firstHand(seats: number[], button: number, bySeat: Map<number, PositionCandidate>): HandPositions {
  if (seats.length === 2) {
    const bb = seats.find((s) => s !== button)!;
    return { buttonSeat: button, sbSeat: button, sbPositionSeat: button, bbSeat: bb, bbId: bySeat.get(bb)!.id, dealtSeats: seats, postBBSeats: [], headsUp: true };
  }
  const [sb, bb] = clockwiseFrom(button, seats);
  return { buttonSeat: button, sbSeat: sb, sbPositionSeat: sb, bbSeat: bb, bbId: bySeat.get(bb)!.id, dealtSeats: seats, postBBSeats: [], headsUp: false };
}

/** True if `seat` lies strictly between `from` and `to` going clockwise. */
function inOpenArc(from: number, to: number, seat: number): boolean {
  const d = (x: number) => (x - from + 1000) % 1000;
  return d(seat) > 0 && d(seat) < d(to);
}

/** Converts positions into the `prev` record for the next hand. */
export function toPrev(p: HandPositions): PrevPositions {
  return { buttonSeat: p.buttonSeat, sbPositionSeat: p.sbPositionSeat, bbSeat: p.bbSeat, bbId: p.bbId };
}

/**
 * Position names for the dealt seats, e.g. BTN, SB, BB, UTG, UTG+1, MP, LJ, HJ, CO.
 */
export function positionLabels(dealtSeats: readonly number[], buttonSeat: number, sbSeat: number | null, bbSeat: number): Map<number, string> {
  const labels = new Map<number, string>();
  if (dealtSeats.length === 2) {
    labels.set(buttonSeat, 'BTN');
    labels.set(bbSeat, 'BB');
    return labels;
  }
  if (sbSeat !== null) labels.set(sbSeat, 'SB');
  labels.set(bbSeat, 'BB');
  const others = clockwiseFrom(bbSeat, dealtSeats).filter((s) => s !== sbSeat && s !== bbSeat);
  let rest = others;
  if (others.length > 0 && others[others.length - 1] === buttonSeat) {
    labels.set(buttonSeat, 'BTN');
    rest = others.slice(0, -1);
  }
  const names = MIDDLE_NAMES[rest.length] ?? [];
  rest.forEach((s, i) => labels.set(s, names[i] ?? `P${i + 1}`));
  return labels;
}

const MIDDLE_NAMES: Record<number, string[]> = {
  0: [],
  1: ['CO'],
  2: ['HJ', 'CO'],
  3: ['LJ', 'HJ', 'CO'],
  4: ['UTG', 'LJ', 'HJ', 'CO'],
  5: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  6: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
  7: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO'],
};
