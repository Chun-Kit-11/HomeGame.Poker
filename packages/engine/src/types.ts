import type { Card } from './cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type Phase =
  /** Players are betting; `toAct` says whose turn it is */
  | 'betting'
  /** Everyone is all-in before the river; players vote on running it twice */
  | 'runItTwice'
  /** River showdown; `showdown.awaiting` must choose to show or muck */
  | 'showdown'
  | 'complete';

export interface HandPlayerInit {
  seat: number;
  id: string;
  stack: number;
}

export interface HandConfig {
  handNo: number;
  players: HandPlayerInit[];
  /** Button seat (may be an empty seat under the dead-button rule) */
  buttonSeat: number;
  /** Seat posting the small blind, or null for a dead small blind */
  sbSeat: number | null;
  bbSeat: number;
  /** Seats posting a live big blind to enter the game */
  postBBSeats?: number[];
  smallBlind: number;
  bigBlind: number;
  /** Big blind ante: paid by the big blind for the whole table (dead money) */
  bigBlindAnte?: number;
  /** A full shuffled deck of 52 cards */
  deck: Card[];
  /** Cash games only: offer run-it-twice when all-in before the river */
  runItTwiceAllowed?: boolean;
}

export interface PlayerState {
  seat: number;
  id: string;
  startStack: number;
  stack: number;
  /** Chips put in on the current street */
  streetBet: number;
  /** Live chips put in this hand (excludes the dead ante) */
  committed: number;
  /** Dead chips (ante) put in this hand */
  ante: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  /** Voluntarily acted this street (posting a blind does not count) */
  hasActed: boolean;
  /** The table bet level right after this player's last action this street (-1 = none) */
  actedAtBet: number;
  shown: boolean;
  mucked: boolean;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** Opening bet on a street: `to` is the player's total street bet */
  | { type: 'bet'; to: number }
  /** Raise: `to` is the player's total street bet after raising */
  | { type: 'raise'; to: number }
  | { type: 'allIn' }
  | { type: 'show' }
  | { type: 'muck' }
  | { type: 'runItTwice'; agree: boolean };

export type HandEvent =
  | {
      type: 'handStart';
      handNo: number;
      buttonSeat: number;
      sbSeat: number | null;
      bbSeat: number;
      smallBlind: number;
      bigBlind: number;
      bigBlindAnte: number;
      players: { seat: number; id: string; stack: number }[];
    }
  | { type: 'post'; seat: number; kind: 'sb' | 'bb' | 'ante' | 'postBB'; amount: number; allIn: boolean }
  | { type: 'deal' }
  | {
      type: 'action';
      seat: number;
      street: Street;
      action: 'fold' | 'check' | 'call' | 'bet' | 'raise';
      /** Chips added by this action */
      amount: number;
      /** Player's total street bet afterwards */
      to: number;
      allIn: boolean;
    }
  | { type: 'uncalled'; seat: number; amount: number }
  | { type: 'street'; street: Street; cards: Card[]; board: Card[]; run: 1 | 2 }
  | { type: 'reveal'; seat: number; cards: Card[] }
  | { type: 'ritOffer'; seats: number[] }
  | { type: 'ritVote'; seat: number; agree: boolean }
  | { type: 'ritResult'; runTwice: boolean }
  | { type: 'show'; seat: number; cards: Card[]; descriptions: string[] }
  | { type: 'muck'; seat: number }
  | {
      type: 'pot';
      index: number;
      /** 1 or 2 when the board was run twice */
      run: 1 | 2;
      amount: number;
      eligible: number[];
      winners: { seat: number; amount: number }[];
      /** Winning hand description ("" if won without showdown) */
      description: string;
    }
  | { type: 'handEnd'; stacks: { seat: number; stack: number; net: number }[] };

export interface ShowdownState {
  /** Seats in showing order */
  order: number[];
  /** Index into `order` of the next player to resolve */
  next: number;
  /** Seat that must choose show/muck, or null */
  awaiting: number | null;
}

export interface HandState {
  config: Omit<HandConfig, 'deck'>;
  deck: Card[];
  deckPos: number;
  phase: Phase;
  street: Street;
  players: PlayerState[];
  board: Card[];
  /** Second board when run twice */
  board2: Card[] | null;
  /** Highest street bet (nominal: at least the big blind preflop) */
  currentBet: number;
  /** Size of the last full bet/raise this street: the minimum raise increment */
  lastFullRaise: number;
  /** Seat whose turn it is, or null */
  toAct: number | null;
  /** Last player to bet/raise on the current street */
  streetAggressor: number | null;
  /** Dead money (big blind ante) that goes into the main pot */
  deadMoney: number;
  /** All remaining hands are face up because betting is closed */
  allInShowdown: boolean;
  ritVotes: Record<number, boolean | null> | null;
  runTwice: boolean;
  showdown: ShowdownState | null;
  events: HandEvent[];
  /** Sequence number incremented on every accepted action (for idempotency/timers) */
  seq: number;
}

export interface LegalActions {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Minimum legal `to` for bet/raise (an all-in for less is always allowed) */
  minTo: number;
  /** Maximum `to` (all-in) */
  maxTo: number;
}

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}
