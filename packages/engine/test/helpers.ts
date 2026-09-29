import { type Card, clockwiseFrom, fullDeck, parseCards } from '../src';
import { applyAction, startHand } from '../src/hand';
import type { HandConfig, HandState, PlayerAction } from '../src/types';

/**
 * Builds a deck that deals the given hole cards and board.
 * Dealing order matches the engine: one card at a time clockwise from the
 * seat left of the button, twice; then burn+flop, burn+turn, burn+river,
 * and (for a second run) burn+cards again.
 */
export function riggedDeck(opts: {
  buttonSeat: number;
  holes: Record<number, string>;
  board?: string;
  board2Extra?: string;
}): Card[] {
  const seats = Object.keys(opts.holes).map(Number);
  const order = clockwiseFrom(opts.buttonSeat, seats);
  const used = new Set<Card>();
  const slots: (Card | null)[] = [];
  const take = (c: Card) => {
    if (used.has(c)) throw new Error(`card used twice: ${c}`);
    used.add(c);
    return c;
  };
  const holes = Object.fromEntries(seats.map((s) => [s, parseCards(opts.holes[s])]));
  for (let r = 0; r < 2; r++) for (const s of order) slots.push(take(holes[s][r]));
  const board = opts.board ? parseCards(opts.board) : [];
  const pushStreet = (cards: Card[]) => {
    slots.push(null); // burn
    for (const c of cards) slots.push(take(c));
  };
  if (board.length >= 3) pushStreet(board.slice(0, 3));
  if (board.length >= 4) pushStreet(board.slice(3, 4));
  if (board.length >= 5) pushStreet(board.slice(4, 5));
  if (opts.board2Extra) for (const c of parseCards(opts.board2Extra)) pushStreet([c]);
  const rest = fullDeck().filter((c) => !used.has(c));
  const deck = slots.map((c) => (c === null ? rest.shift()! : c));
  return [...deck, ...rest];
}

export function start(
  partial: Partial<HandConfig> & Pick<HandConfig, 'players' | 'buttonSeat' | 'bbSeat'> & { holes?: Record<number, string>; board?: string; board2Extra?: string },
): HandState {
  const { holes, board, board2Extra, ...cfg } = partial;
  const deck =
    cfg.deck ??
    (holes ? riggedDeck({ buttonSeat: cfg.buttonSeat, holes, board, board2Extra }) : fullDeck());
  return startHand({
    handNo: 1,
    sbSeat: null,
    smallBlind: 50,
    bigBlind: 100,
    ...cfg,
    deck,
  } as HandConfig);
}

export const players = (...stacks: [number, number][]) => stacks.map(([seat, stack]) => ({ seat, id: `p${seat}`, stack }));

/** Applies a list of [seat, action] steps. */
export function play(s: HandState, steps: [number, PlayerAction][]): HandState {
  for (const [seat, a] of steps) s = applyAction(s, seat, a);
  return s;
}

export const fold: PlayerAction = { type: 'fold' };
export const check: PlayerAction = { type: 'check' };
export const call: PlayerAction = { type: 'call' };
export const allIn: PlayerAction = { type: 'allIn' };
export const bet = (to: number): PlayerAction => ({ type: 'bet', to });
export const raise = (to: number): PlayerAction => ({ type: 'raise', to });

export const stackOf = (s: HandState, seat: number) => s.players.find((p) => p.seat === seat)!.stack;
export const totalChips = (s: HandState) =>
  s.players.reduce((t, p) => t + p.stack + p.committed + p.ante, 0);
export const startTotal = (s: HandState) => s.players.reduce((t, p) => t + p.startStack, 0);
export const potEvents = (s: HandState) => s.events.filter((e) => e.type === 'pot');
