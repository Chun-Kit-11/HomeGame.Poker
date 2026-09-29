import type { Card } from './cards';
import { describeScore, scoreHand } from './evaluator';
import { clockwiseFrom, computePots, splitPot } from './pots';
import {
  ActionError,
  type HandConfig,
  type HandState,
  type LegalActions,
  type PlayerAction,
  type PlayerState,
  type Street,
} from './types';

/**
 * No-Limit Hold'em hand state machine.
 *
 * Pure and deterministic: `startHand` and `applyAction` never mutate their
 * input, never read the clock and never use randomness (the shuffled deck is
 * supplied in the config). Every change is appended to `state.events`, which
 * doubles as the hand history.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startHand(config: HandConfig): HandState {
  validateConfig(config);
  const { deck, ...rest } = config;
  const players: PlayerState[] = [...config.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      seat: p.seat,
      id: p.id,
      startStack: p.stack,
      stack: p.stack,
      streetBet: 0,
      committed: 0,
      ante: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      hasActed: false,
      actedAtBet: -1,
      shown: false,
      mucked: false,
    }));

  const s: HandState = {
    config: { ...rest, bigBlindAnte: rest.bigBlindAnte ?? 0, postBBSeats: rest.postBBSeats ?? [] },
    deck: [...deck],
    deckPos: 0,
    phase: 'betting',
    street: 'preflop',
    players,
    board: [],
    board2: null,
    currentBet: config.bigBlind,
    lastFullRaise: config.bigBlind,
    toAct: null,
    streetAggressor: null,
    deadMoney: 0,
    allInShowdown: false,
    ritVotes: null,
    runTwice: false,
    showdown: null,
    events: [],
    seq: 0,
  };

  s.events.push({
    type: 'handStart',
    handNo: config.handNo,
    buttonSeat: config.buttonSeat,
    sbSeat: config.sbSeat,
    bbSeat: config.bbSeat,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    bigBlindAnte: config.bigBlindAnte ?? 0,
    players: players.map((p) => ({ seat: p.seat, id: p.id, stack: p.stack })),
  });

  // Blinds. If the big blind cannot cover blind + ante, the blind takes priority.
  if (config.sbSeat !== null) postBlind(s, player(s, config.sbSeat), config.smallBlind, 'sb');
  const bb = player(s, config.bbSeat);
  postBlind(s, bb, config.bigBlind, 'bb');
  const ante = Math.min(config.bigBlindAnte ?? 0, bb.stack);
  if (ante > 0) {
    bb.stack -= ante;
    bb.ante = ante;
    s.deadMoney += ante;
    if (bb.stack === 0) bb.allIn = true;
    s.events.push({ type: 'post', seat: bb.seat, kind: 'ante', amount: ante, allIn: bb.allIn });
  }
  for (const seat of s.config.postBBSeats ?? []) postBlind(s, player(s, seat), config.bigBlind, 'postBB');

  // Deal two hole cards each, one at a time, starting left of the button.
  const order = clockwiseFrom(config.buttonSeat, players.map((p) => p.seat));
  for (let round = 0; round < 2; round++) {
    for (const seat of order) player(s, seat).holeCards.push(s.deck[s.deckPos++]);
  }
  s.events.push({ type: 'deal' });

  advance(s, config.bbSeat);
  return s;
}

/** Applies a player's action. Throws ActionError if it is illegal. */
export function applyAction(state: HandState, seat: number, action: PlayerAction): HandState {
  const s = structuredClone(state);
  switch (s.phase) {
    case 'complete':
      throw new ActionError('The hand is over');
    case 'runItTwice':
      applyRitVote(s, seat, action);
      break;
    case 'showdown':
      applyShowdownChoice(s, seat, action);
      break;
    case 'betting':
      applyBetting(s, seat, action);
      break;
  }
  s.seq++;
  return s;
}

/** What the player to act may do, or null if it is not their turn to bet. */
export function legalActions(s: HandState, seat: number): LegalActions | null {
  if (s.phase !== 'betting' || s.toAct !== seat) return null;
  const p = player(s, seat);
  const target = callTarget(s, p);
  const callAmount = Math.min(Math.max(0, target - p.streetBet), p.stack);
  const raiseRights = !p.hasActed || s.currentBet - p.actedAtBet >= s.lastFullRaise;
  const canAggress = othersCanAct(s, p) && raiseRights && p.stack > callAmount;
  const maxTo = p.streetBet + p.stack;
  const { bigBlind } = s.config;
  const opening = s.currentBet === 0;
  const fullTo = opening ? bigBlind : Math.max(s.currentBet, bigBlind) + s.lastFullRaise;
  return {
    seat,
    canFold: true,
    canCheck: callAmount === 0,
    canCall: callAmount > 0,
    callAmount,
    canBet: opening && canAggress,
    canRaise: !opening && canAggress,
    minTo: Math.min(fullTo, maxTo),
    maxTo,
  };
}

/** Seats whose decision the hand is waiting for. */
export function pendingSeats(s: HandState): number[] {
  switch (s.phase) {
    case 'betting':
      return s.toAct === null ? [] : [s.toAct];
    case 'runItTwice':
      return Object.entries(s.ritVotes ?? {})
        .filter(([, v]) => v === null)
        .map(([k]) => Number(k));
    case 'showdown':
      return s.showdown?.awaiting == null ? [] : [s.showdown.awaiting];
    default:
      return [];
  }
}

/** The action to take for `seat` when their timer expires: check/fold, decline run-it-twice, muck. */
export function timeoutAction(s: HandState, seat: number): PlayerAction | null {
  if (!pendingSeats(s).includes(seat)) return null;
  if (s.phase === 'betting') return legalActions(s, seat)!.canCheck ? { type: 'check' } : { type: 'fold' };
  if (s.phase === 'runItTwice') return { type: 'runItTwice', agree: false };
  if (s.phase === 'showdown') return { type: 'muck' };
  return null;
}

/** Total chips in the middle (live bets + dead money). */
export function potTotal(s: HandState): number {
  return s.players.reduce((t, p) => t + p.committed, 0) + s.deadMoney;
}

export function player(s: HandState, seat: number): PlayerState {
  const p = s.players.find((x) => x.seat === seat);
  if (!p) throw new ActionError(`No player in seat ${seat}`);
  return p;
}

/** Final hand descriptions for players still in at showdown, per board. */
export function showdownDescriptions(s: HandState, seat: number): string[] {
  const p = player(s, seat);
  const boards = s.board2 ? [s.board, s.board2] : [s.board];
  return boards.filter((b) => b.length === 5).map((b) => describeScore(scoreHand([...p.holeCards, ...b])));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateConfig(c: HandConfig) {
  const seats = c.players.map((p) => p.seat);
  if (c.players.length < 2) throw new ActionError('Need at least two players');
  if (new Set(seats).size !== seats.length) throw new ActionError('Duplicate seat');
  if (new Set(c.players.map((p) => p.id)).size !== c.players.length) throw new ActionError('Duplicate player');
  for (const p of c.players) {
    if (!Number.isInteger(p.stack) || p.stack <= 0) throw new ActionError(`Seat ${p.seat} has no chips`);
  }
  if (!seats.includes(c.bbSeat)) throw new ActionError('Big blind seat is empty');
  if (c.sbSeat !== null && !seats.includes(c.sbSeat)) throw new ActionError('Small blind seat is empty');
  if (c.sbSeat === c.bbSeat) throw new ActionError('SB and BB must differ');
  for (const s of c.postBBSeats ?? []) {
    if (!seats.includes(s) || s === c.bbSeat || s === c.sbSeat) throw new ActionError('Bad post-BB seat');
  }
  if (!(Number.isInteger(c.smallBlind) && Number.isInteger(c.bigBlind) && c.smallBlind >= 0 && c.bigBlind > 0 && c.smallBlind <= c.bigBlind)) {
    throw new ActionError('Bad blinds');
  }
  if (c.bigBlindAnte !== undefined && !(Number.isInteger(c.bigBlindAnte) && c.bigBlindAnte >= 0)) throw new ActionError('Bad ante');
  if (c.deck.length !== 52 || new Set(c.deck).size !== 52 || c.deck.some((x) => !Number.isInteger(x) || x < 0 || x > 51)) {
    throw new ActionError('Deck must contain each of the 52 cards once');
  }
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

function postBlind(s: HandState, p: PlayerState, amount: number, kind: 'sb' | 'bb' | 'postBB') {
  const amt = Math.min(amount, p.stack);
  putIn(p, amt);
  s.events.push({ type: 'post', seat: p.seat, kind, amount: amt, allIn: p.allIn });
}

function putIn(p: PlayerState, amount: number) {
  p.stack -= amount;
  p.streetBet += amount;
  p.committed += amount;
  if (p.stack === 0) p.allIn = true;
}

const inHand = (s: HandState) => s.players.filter((p) => !p.folded);

function othersCanAct(s: HandState, p: PlayerState) {
  return s.players.some((o) => o !== p && !o.folded && !o.allIn);
}

/**
 * The street bet a player must match. Normally the current bet; but if every
 * other live player is all-in, only the largest of their bets needs calling.
 */
function callTarget(s: HandState, p: PlayerState): number {
  if (othersCanAct(s, p)) return s.currentBet;
  const others = s.players.filter((o) => o !== p && !o.folded).map((o) => o.streetBet);
  return Math.min(s.currentBet, Math.max(0, ...others));
}

function needsToAct(s: HandState, p: PlayerState): boolean {
  if (p.folded || p.allIn) return false;
  if (p.streetBet < callTarget(s, p)) return true;
  return !p.hasActed && othersCanAct(s, p);
}

function applyBetting(s: HandState, seat: number, action: PlayerAction) {
  if (s.toAct !== seat) throw new ActionError('Not your turn');
  const p = player(s, seat);
  const la = legalActions(s, seat)!;
  const street = s.street;

  switch (action.type) {
    case 'fold':
      p.folded = true;
      s.events.push({ type: 'action', seat, street, action: 'fold', amount: 0, to: p.streetBet, allIn: false });
      break;
    case 'check':
      if (!la.canCheck) throw new ActionError(`You must call ${la.callAmount} or fold`);
      markActed(s, p);
      s.events.push({ type: 'action', seat, street, action: 'check', amount: 0, to: p.streetBet, allIn: false });
      break;
    case 'call':
      if (!la.canCall) {
        // Nothing to call: treat as a check.
        markActed(s, p);
        s.events.push({ type: 'action', seat, street, action: 'check', amount: 0, to: p.streetBet, allIn: false });
        break;
      }
      doCall(s, p, la.callAmount);
      break;
    case 'allIn':
      if (la.maxTo <= p.streetBet + la.callAmount) {
        doCall(s, p, la.callAmount);
      } else if (la.canBet || la.canRaise) {
        doRaise(s, p, la.maxTo, la);
      } else {
        throw new ActionError('Betting is not open to you: you may only call or fold');
      }
      break;
    case 'bet':
      if (!la.canBet) throw new ActionError(s.currentBet > 0 ? 'There is already a bet: raise instead' : 'You cannot bet');
      doRaise(s, p, action.to, la);
      break;
    case 'raise':
      if (!la.canRaise) throw new ActionError(s.currentBet === 0 ? 'Nothing to raise: bet instead' : 'Raising is not open to you');
      doRaise(s, p, action.to, la);
      break;
    default:
      throw new ActionError(`Cannot ${action.type} now`);
  }
  advance(s, seat);
}

function markActed(s: HandState, p: PlayerState) {
  p.hasActed = true;
  p.actedAtBet = s.currentBet;
}

function doCall(s: HandState, p: PlayerState, amount: number) {
  putIn(p, amount);
  markActed(s, p);
  s.events.push({ type: 'action', seat: p.seat, street: s.street, action: 'call', amount, to: p.streetBet, allIn: p.allIn });
}

function doRaise(s: HandState, p: PlayerState, to: number, la: LegalActions) {
  if (!Number.isSafeInteger(to)) throw new ActionError('Amount must be a whole number of chips');
  if (to > la.maxTo) throw new ActionError(`You only have ${la.maxTo} available`);
  if (to <= s.currentBet) throw new ActionError(`Must be more than the current bet of ${s.currentBet}`);
  if (to < la.minTo && to !== la.maxTo) throw new ActionError(`Minimum is ${la.minTo}`);

  const opening = s.currentBet === 0;
  const base = opening ? 0 : Math.max(s.currentBet, s.config.bigBlind);
  const fullTo = opening ? s.config.bigBlind : base + s.lastFullRaise;
  if (to >= fullTo) s.lastFullRaise = to - base; // a full bet/raise reopens the betting
  // An all-in for less than a full raise raises the bet but not the minimum increment,
  // and does not reopen betting for players who already acted.
  s.currentBet = to;
  s.streetAggressor = p.seat;
  const added = to - p.streetBet;
  putIn(p, added);
  p.hasActed = true;
  p.actedAtBet = to;
  s.events.push({
    type: 'action',
    seat: p.seat,
    street: s.street,
    action: opening ? 'bet' : 'raise',
    amount: added,
    to,
    allIn: p.allIn,
  });
}

/** Moves the hand forward after an action (or after posting blinds). */
function advance(s: HandState, fromSeat: number) {
  const live = inHand(s);
  if (live.length === 1) {
    winWithoutShowdown(s, live[0]);
    return;
  }
  const next = clockwiseFrom(fromSeat, s.players.map((p) => p.seat)).find((seat) => needsToAct(s, player(s, seat)));
  if (next !== undefined) {
    s.toAct = next;
    return;
  }
  endStreet(s);
}

function endStreet(s: HandState) {
  s.toAct = null;
  returnUncalled(s);
  for (const p of s.players) {
    p.streetBet = 0;
    p.hasActed = false;
    p.actedAtBet = -1;
  }
  s.currentBet = 0;
  s.lastFullRaise = s.config.bigBlind;

  const live = inHand(s);
  const actors = live.filter((p) => !p.allIn);
  const bettingClosed = actors.length <= 1;
  if (live.some((p) => p.allIn) && (bettingClosed || s.street === 'river')) tableHands(s);

  if (s.street === 'river') {
    startShowdown(s);
    return;
  }
  if (bettingClosed) {
    if (s.config.runItTwiceAllowed) {
      s.phase = 'runItTwice';
      s.ritVotes = Object.fromEntries(live.map((p) => [p.seat, null]));
      s.events.push({ type: 'ritOffer', seats: live.map((p) => p.seat) });
      return;
    }
    runOut(s);
    return;
  }
  dealStreet(s, 1);
  s.streetAggressor = null;
  advance(s, s.config.buttonSeat);
}

/** Returns the part of the largest contribution nobody else matched. */
function returnUncalled(s: HandState) {
  const sorted = [...s.players].sort((a, b) => b.committed - a.committed);
  const top = sorted[0];
  const second = sorted[1]?.committed ?? 0;
  const excess = top.committed - second;
  if (excess > 0) {
    top.committed -= excess;
    top.streetBet = Math.max(0, top.streetBet - excess);
    top.stack += excess;
    top.allIn = top.stack === 0;
    s.events.push({ type: 'uncalled', seat: top.seat, amount: excess });
  }
}

const NEXT_STREET: Record<Street, Street> = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'river' };

function dealStreet(s: HandState, run: 1 | 2) {
  const board = run === 1 ? s.board : s.board2!;
  const street: Street = board.length === 0 ? 'flop' : board.length === 3 ? 'turn' : 'river';
  s.deckPos++; // burn
  const n = street === 'flop' ? 3 : 1;
  const cards: Card[] = s.deck.slice(s.deckPos, s.deckPos + n);
  s.deckPos += n;
  board.push(...cards);
  if (run === 1) s.street = street;
  s.events.push({ type: 'street', street, cards, board: [...board], run });
}

/** All remaining hands are turned face up (someone is all-in and betting is over). */
function tableHands(s: HandState) {
  if (s.allInShowdown) return;
  s.allInShowdown = true;
  const live = inHand(s).map((p) => p.seat);
  for (const seat of clockwiseFrom(s.config.buttonSeat, live)) {
    const p = player(s, seat);
    p.shown = true;
    s.events.push({ type: 'reveal', seat, cards: [...p.holeCards] });
  }
}

function runOut(s: HandState) {
  const common = s.board.length;
  while (s.board.length < 5) dealStreet(s, 1);
  if (s.runTwice) {
    s.board2 = s.board.slice(0, common);
    while (s.board2.length < 5) dealStreet(s, 2);
  }
  s.street = 'river';
  startShowdown(s);
}

function applyRitVote(s: HandState, seat: number, action: PlayerAction) {
  if (action.type !== 'runItTwice') throw new ActionError('Waiting for the run-it-twice decision');
  if (!s.ritVotes || !(seat in s.ritVotes)) throw new ActionError('You are not in this pot');
  if (s.ritVotes[seat] !== null) throw new ActionError('Already voted');
  s.ritVotes[seat] = action.agree;
  s.events.push({ type: 'ritVote', seat, agree: action.agree });
  const votes = Object.values(s.ritVotes);
  if (!action.agree || votes.every((v) => v === true)) {
    s.runTwice = action.agree;
    s.events.push({ type: 'ritResult', runTwice: s.runTwice });
    s.phase = 'betting';
    runOut(s);
  }
}

// ---------------------------------------------------------------------------
// Showdown and pot distribution
// ---------------------------------------------------------------------------

function startShowdown(s: HandState) {
  s.phase = 'showdown';
  s.toAct = null;
  const live = inHand(s).map((p) => p.seat);
  const aggressor = s.streetAggressor !== null && live.includes(s.streetAggressor) ? s.streetAggressor : null;
  const first = aggressor ?? clockwiseFrom(s.config.buttonSeat, live)[0];
  const order = [first, ...clockwiseFrom(first, live).filter((x) => x !== first)];
  s.showdown = { order, next: 0, awaiting: null };
  continueShowdown(s);
}

function continueShowdown(s: HandState) {
  const sd = s.showdown!;
  while (sd.next < sd.order.length) {
    const p = player(s, sd.order[sd.next]);
    if (p.shown && s.allInShowdown) {
      sd.next++;
      continue;
    }
    if (canStillWin(s, p)) {
      show(s, p);
      sd.next++;
      continue;
    }
    sd.awaiting = p.seat;
    return;
  }
  sd.awaiting = null;
  distribute(s);
}

function show(s: HandState, p: PlayerState) {
  p.shown = true;
  s.events.push({ type: 'show', seat: p.seat, cards: [...p.holeCards], descriptions: showdownDescriptions(s, p.seat) });
}

/** Could this hand win or tie any pot it is eligible for, given the hands shown so far? */
function canStillWin(s: HandState, p: PlayerState): boolean {
  const board = s.board;
  const myScore = scoreHand([...p.holeCards, ...board]);
  for (const pot of currentPots(s)) {
    if (!pot.eligible.includes(p.seat)) continue;
    const shown = pot.eligible.map((seat) => player(s, seat)).filter((o) => o.shown && o !== p);
    if (shown.length === 0) return true;
    const best = Math.max(...shown.map((o) => scoreHand([...o.holeCards, ...board])));
    if (myScore >= best) return true;
  }
  return false;
}

function applyShowdownChoice(s: HandState, seat: number, action: PlayerAction) {
  const sd = s.showdown!;
  if (sd.awaiting !== seat) throw new ActionError('Not your turn to show');
  const p = player(s, seat);
  if (action.type === 'show') {
    show(s, p);
  } else if (action.type === 'muck') {
    p.mucked = true;
    s.events.push({ type: 'muck', seat });
  } else {
    throw new ActionError('Choose to show or muck');
  }
  sd.awaiting = null;
  sd.next++;
  continueShowdown(s);
}

function currentPots(s: HandState) {
  return computePots(
    s.players.map((p) => ({ seat: p.seat, committed: p.committed, folded: p.folded || p.mucked })),
    s.deadMoney,
  );
}

function distribute(s: HandState) {
  const boards = s.board2 ? [s.board, s.board2] : [s.board];
  currentPots(s).forEach((pot, index) => {
    const runAmounts = boards.length === 2 ? [pot.amount - Math.floor(pot.amount / 2), Math.floor(pot.amount / 2)] : [pot.amount];
    boards.forEach((board, r) => {
      const scores = pot.eligible.map((seat) => ({ seat, score: scoreHand([...player(s, seat).holeCards, ...board]) }));
      const best = Math.max(...scores.map((x) => x.score));
      const winners = scores.filter((x) => x.score === best).map((x) => x.seat);
      const shares = splitPot(runAmounts[r], winners, s.config.buttonSeat);
      for (const [seat, amt] of shares) player(s, seat).stack += amt;
      s.events.push({
        type: 'pot',
        index,
        run: (r + 1) as 1 | 2,
        amount: runAmounts[r],
        eligible: pot.eligible,
        winners: [...shares].map(([seat, amount]) => ({ seat, amount })),
        description: describeScore(best),
      });
    });
  });
  finish(s);
}

function winWithoutShowdown(s: HandState, winner: PlayerState) {
  s.toAct = null;
  returnUncalled(s);
  const amount = potTotal(s);
  winner.stack += amount;
  s.events.push({
    type: 'pot',
    index: 0,
    run: 1,
    amount,
    eligible: [winner.seat],
    winners: [{ seat: winner.seat, amount }],
    description: '',
  });
  finish(s);
}

function finish(s: HandState) {
  s.phase = 'complete';
  s.toAct = null;
  for (const p of s.players) p.allIn = p.stack === 0;
  s.events.push({
    type: 'handEnd',
    stacks: s.players.map((p) => ({ seat: p.seat, stack: p.stack, net: p.stack - p.startStack })),
  });
}
