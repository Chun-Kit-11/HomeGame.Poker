import { z } from 'zod';
import type { Card, LegalActions, Phase, Street } from '@poker/engine';
import type { RoomConfig } from './config';

// ---------------------------------------------------------------------------
// Client -> server messages (validated with zod on the server)
// ---------------------------------------------------------------------------

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,10}$/);
const chips = z.number().int().min(1).max(1_000_000_000);

export const clientMessages = {
  'room:join': z.object({ code }),
  'room:leave': z.object({}),
  'seat:request': z.object({
    seat: z.number().int().min(0).max(8),
    amount: chips.optional(),
    entry: z.enum(['waitForBB', 'postBB']).default('waitForBB'),
  }),
  'seat:cancel': z.object({}),
  'player:action': z.object({
    handNo: z.number().int(),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('fold') }),
      z.object({ type: z.literal('check') }),
      z.object({ type: z.literal('call') }),
      z.object({ type: z.literal('bet'), to: chips }),
      z.object({ type: z.literal('raise'), to: chips }),
      z.object({ type: z.literal('allIn') }),
      z.object({ type: z.literal('show') }),
      z.object({ type: z.literal('muck') }),
      z.object({ type: z.literal('runItTwice'), agree: z.boolean() }),
    ]),
  }),
  'player:sitOut': z.object({}),
  'player:sitIn': z.object({ entry: z.enum(['waitForBB', 'postBB']).default('waitForBB') }),
  'player:leave': z.object({}),
  'player:rebuy': z.object({ amount: chips.optional() }),
  'player:addOn': z.object({}),
  'player:seed': z.object({ handNo: z.number().int(), seed: z.string().max(128) }),
  'host:start': z.object({}),
  'host:pause': z.object({}),
  'host:resume': z.object({}),
  'host:kick': z.object({ userId: z.string().min(1).max(64) }),
  'host:approve': z.object({ requestId: z.string().min(1).max(64) }),
  'host:deny': z.object({ requestId: z.string().min(1).max(64) }),
  'host:setBlinds': z.object({ smallBlind: chips, bigBlind: chips }),
  'host:setAutoApprove': z.object({ autoApprove: z.boolean() }),
  'host:end': z.object({}),
  'chat:send': z.object({ text: z.string().max(500) }),
  'chat:react': z.object({ emoji: z.string().max(16) }),
} as const;

export type ClientEvent = keyof typeof clientMessages;
export type ClientPayload<E extends ClientEvent> = z.input<(typeof clientMessages)[E]>;

export const REACTIONS = ['👍', '😂', '😮', '😡', '🔥', '👏', '😭', '🤔', '💰', '🙈'] as const;

/** Acknowledgement sent back for every client message. */
export type Ack = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export type SeatStatus = 'active' | 'waitForBB' | 'postBB' | 'sittingOut' | 'busted' | 'pending';

export interface SeatView {
  seat: number;
  userId: string;
  username: string;
  stack: number;
  status: SeatStatus;
  connected: boolean;
  timeBankChips: number;
  /** In the current hand */
  inHand: boolean;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  /** Hole cards: real cards if visible to this viewer, 'hidden' face-down, null if none */
  cards: Card[] | 'hidden' | null;
  /** Hand description when cards are face up and the board is complete */
  handDescription: string | null;
  lastAction: string | null;
  /** Chips won in the last completed hand */
  won: number;
  leaving: boolean;
  /** Buy-in amount pending approval (status 'pending') */
  pendingAmount?: number;
}

export interface PotView {
  amount: number;
  eligible: number[];
}

export interface HandView {
  handNo: number;
  phase: Phase;
  street: Street;
  board: Card[];
  board2: Card[] | null;
  buttonSeat: number;
  sbSeat: number | null;
  bbSeat: number;
  /** Pots from completed streets (current street bets are on the seats) */
  pots: PotView[];
  totalPot: number;
  currentBet: number;
  toAct: number | null;
  /** Epoch ms when the current decision times out */
  deadline: number | null;
  /** Epoch ms when the time-bank chip currently running started (null if not using bank) */
  usingTimeBank: boolean;
  /** Only for the viewer when it is their turn */
  legal: LegalActions | null;
  /** Seats that still need to vote on running it twice */
  ritPending: number[];
  showdownAwaiting: number | null;
  /** Filled in when the hand is complete */
  results: { seat: number; amount: number; description: string; pot: number; run: 1 | 2 }[];
  fair: { serverSeedHash: string; serverSeed: string | null } | null;
}

export interface BuyInRequestView {
  id: string;
  userId: string;
  username: string;
  kind: 'buyIn' | 'rebuy' | 'topUp' | 'entry' | 'addOn';
  amount: number;
  seat: number | null;
}

export interface TournamentView {
  level: number;
  levels: { sb: number; bb: number; ante: number }[];
  levelEndsAt: number | null;
  /** Remaining ms when paused */
  levelRemainingMs: number | null;
  lateRegOpen: boolean;
  rebuyOpen: boolean;
  addOnOpen: boolean;
  entrants: number;
  remaining: number;
  prizePool: number;
  payouts: number[];
  standings: { place: number; userId: string; username: string; prize: number }[];
  finished: boolean;
  myRebuys: number;
  myAddOn: boolean;
}

export interface PlayerStatsView {
  userId: string;
  username: string;
  /** Chips bought in (cash) */
  buyIn: number;
  cashOut: number;
  /** Current chips at the table (0 if not seated) */
  stack: number;
  net: number;
  /** Money net in minor units (ledger mode) */
  netMoney: number | null;
  handsPlayed: number;
}

export interface TableView {
  room: {
    id: string;
    code: string;
    name: string;
    hostId: string;
    gameMode: 'CASH' | 'TOURNAMENT';
    moneyMode: 'PLAY' | 'LEDGER';
    status: 'OPEN' | 'RUNNING' | 'PAUSED' | 'ENDED';
    config: RoomConfig;
    /** Blinds for the next hand */
    smallBlind: number;
    bigBlind: number;
    ante: number;
    pendingBlinds: { smallBlind: number; bigBlind: number } | null;
  };
  me: {
    userId: string;
    username: string;
    isHost: boolean;
    seat: number | null;
    pendingRequest: BuyInRequestView | null;
  };
  seats: (SeatView | null)[];
  hand: HandView | null;
  requests: BuyInRequestView[];
  spectators: { userId: string; username: string }[];
  tournament: TournamentView | null;
  stats: {
    handsPlayed: number;
    biggestPot: number;
    players: PlayerStatsView[];
  };
  notice: string | null;
  /** Server clock when this view was built (for countdowns on devices with skewed clocks) */
  serverNow: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  ts: number;
  system?: boolean;
}

/** Events the server pushes to clients. */
export interface ServerEvents {
  'table:state': (view: TableView) => void;
  /** Public hand events for animations/sounds (never contains private cards) */
  'table:event': (e: { kind: string; seat?: number; amount?: number; text?: string }) => void;
  'chat:message': (m: ChatMessage) => void;
  'chat:history': (m: ChatMessage[]) => void;
  'chat:reaction': (r: { userId: string; username: string; seat: number | null; emoji: string }) => void;
  'fair:commit': (c: { handNo: number; serverSeedHash: string; handId: string }) => void;
  'room:kicked': (r: { reason: string }) => void;
}
