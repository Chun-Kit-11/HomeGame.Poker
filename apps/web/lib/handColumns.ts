import { type HandEvent, cardsToString, equities } from '@poker/engine';
import type { HandDetail } from './handTypes';

export type StreetName = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: StreetName[] = ['preflop', 'flop', 'turn', 'river'];

export type ColumnItem =
  | { kind: 'blinds'; amount: number }
  | { kind: 'action'; seat: number; label: string; amount: number | null; allIn: boolean }
  | { kind: 'hands'; entries: { seat: number; cards: number[]; equity: number }[] }
  | { kind: 'result'; seat: number; cards: number[] | null; net: number };

export interface Column {
  street: StreetName;
  /** Pot at the start of the street (null preflop / not reached) */
  pot: number | null;
  items: ColumnItem[];
}

/** Turns a hand's event log into Pre-Flop / Flop / Turn / River columns like a hand-history viewer. */
export function buildColumns(hand: HandDetail): Column[] {
  const cols: Column[] = STREETS.map((street) => ({ street, pot: null, items: [] }));
  const col = (s: StreetName) => cols[STREETS.indexOf(s)];
  let pot = 0;
  let current: StreetName = 'preflop';
  let blinds = 0;
  let revealed: { seat: number; cards: number[] }[] = [];
  let board: number[] = [];
  const posts: ColumnItem[] = [];

  const addEquity = (target: StreetName) => {
    if (revealed.length < 2 || board.length >= 5) return;
    try {
      const eq = equities(
        revealed.map((r) => r.cards),
        board,
        { samples: 6000, seed: hand.handNo * 31 + board.length },
      );
      col(target).items.push({ kind: 'hands', entries: revealed.map((r, i) => ({ ...r, equity: eq[i] })) });
    } catch {
      /* inconsistent data: skip */
    }
  };

  for (const e of hand.events as HandEvent[]) {
    switch (e.type) {
      case 'post':
        pot += e.amount;
        blinds += e.amount;
        if (e.kind !== 'ante') posts.push({ kind: 'action', seat: e.seat, label: e.kind === 'sb' ? 'SB' : e.kind === 'bb' ? 'BB' : 'Post', amount: e.amount, allIn: e.allIn });
        break;
      case 'action': {
        pot += e.amount;
        const label = e.action === 'fold' ? 'Fold' : e.action === 'check' ? 'Check' : e.action === 'call' ? 'Call' : e.action === 'bet' ? 'Bet' : 'Raise';
        const amount = e.action === 'call' ? e.amount : e.action === 'bet' || e.action === 'raise' ? e.to : null;
        col(e.street).items.push({ kind: 'action', seat: e.seat, label, amount, allIn: e.allIn });
        break;
      }
      case 'uncalled':
        pot -= e.amount;
        break;
      case 'reveal':
        revealed.push({ seat: e.seat, cards: e.cards });
        break;
      case 'street':
        if (e.run !== 1) break;
        // Hands were tabled on the previous street: show their win % there first
        if (revealed.length >= 2 && !col(current).items.some((i) => i.kind === 'hands')) addEquity(current);
        current = e.street;
        board = e.board;
        col(current).pot = pot;
        if (revealed.length >= 2) addEquity(current);
        break;
      default:
        break;
    }
  }
  if (revealed.length >= 2 && !col(current).items.some((i) => i.kind === 'hands') && board.length < 5) addEquity(current);
  col('preflop').items.unshift({ kind: 'blinds', amount: blinds }, ...posts);

  // Results go in the last street reached, biggest winner first
  const results: ColumnItem[] = [...hand.players]
    .sort((a, b) => b.net - a.net)
    .map((p) => ({ kind: 'result', seat: p.seat, cards: p.holeCards, net: p.net }));
  col(current).items.push(...results);
  revealed = [];
  return cols;
}

/** Winners of the hand (seat -> chips won), from the pot events. */
export function winnings(hand: HandDetail): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of hand.events as HandEvent[]) if (e.type === 'pot') for (const w of e.winners) out.set(w.seat, (out.get(w.seat) ?? 0) + w.amount);
  return out;
}

/** Plain-text hand history for downloading or sharing. */
export function handToText(hand: HandDetail, nameOf: (seat: number) => string): string {
  const lines: string[] = [];
  const cfg = hand.config;
  lines.push(`Home Game - ${hand.room.name} (${hand.room.code}) - Hand #${hand.handNo}`);
  lines.push(`${new Date(hand.endedAt).toLocaleString()} - Blinds ${hand.smallBlind}/${hand.bigBlind}${hand.ante ? ` - BB ante ${hand.ante}` : ''}`);
  lines.push(`Button: seat ${cfg.buttonSeat + 1}`);
  for (const p of hand.players) lines.push(`Seat ${p.seat + 1}: ${nameOf(p.seat)} [${p.position}] (${p.startStack} chips)`);
  const me = hand.players.find((p) => p.seat === hand.mySeat);
  if (me?.holeCards) lines.push(`*** HOLE CARDS ***`, `Dealt to ${nameOf(me.seat)} [${cardsToString(me.holeCards)}]`);
  for (const e of hand.events as HandEvent[]) {
    if (e.type === 'post') lines.push(`${nameOf(e.seat)}: posts ${e.kind === 'sb' ? 'small blind' : e.kind === 'bb' ? 'big blind' : e.kind === 'ante' ? 'the BB ante' : 'a big blind'} ${e.amount}`);
    if (e.type === 'street') lines.push(`*** ${e.run === 2 ? 'SECOND ' : ''}${e.street.toUpperCase()} *** [${cardsToString(e.board)}]`);
    if (e.type === 'action') {
      const t = e.action === 'fold' ? 'folds' : e.action === 'check' ? 'checks' : e.action === 'call' ? `calls ${e.amount}` : e.action === 'bet' ? `bets ${e.to}` : `raises to ${e.to}`;
      lines.push(`${nameOf(e.seat)}: ${t}${e.allIn ? ' and is all-in' : ''}`);
    }
    if (e.type === 'uncalled') lines.push(`Uncalled bet (${e.amount}) returned to ${nameOf(e.seat)}`);
    if (e.type === 'reveal' || e.type === 'show') lines.push(`${nameOf(e.seat)}: shows [${cardsToString(e.cards)}]`);
    if (e.type === 'muck') lines.push(`${nameOf(e.seat)}: mucks`);
    if (e.type === 'pot') for (const w of e.winners) lines.push(`${nameOf(w.seat)} collected ${w.amount} from ${e.index === 0 ? 'the main pot' : `side pot ${e.index}`}${e.description ? ` (${e.description})` : ''}`);
  }
  lines.push('*** SUMMARY ***', `Total pot ${hand.potTotal} | Board [${cardsToString(hand.board.board)}]${hand.board.board2 ? ` / [${cardsToString(hand.board.board2)}]` : ''}`);
  for (const p of hand.players) lines.push(`Seat ${p.seat + 1}: ${nameOf(p.seat)} ${p.net >= 0 ? '+' : ''}${p.net}`);
  lines.push(`Verify: server seed ${hand.fair.serverSeed} (SHA-256 ${hand.fair.serverSeedHash})`);
  return lines.join('\n');
}
