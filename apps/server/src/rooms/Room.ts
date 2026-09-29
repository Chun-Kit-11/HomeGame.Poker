import { randomInt, randomUUID } from 'node:crypto';
import {
  ActionError,
  type HandState,
  type PlayerAction,
  type PrevPositions,
  applyAction,
  computePots,
  describeScore,
  scoreHand,
  handStats,
  legalActions,
  nextPositions,
  pendingSeats,
  positionLabels,
  potTotal,
  showdownDescriptions,
  startHand,
  timeoutAction,
  toPrev,
} from '@poker/engine';
import {
  type BuyInRequestView,
  type ChatMessage,
  type HandView,
  type RoomConfig,
  type SeatStatus,
  type SeatView,
  type TableView,
  computeBalances,
  findDiscrepancies,
  sanitizeChat,
  settle,
} from '@poker/shared';
import type { Clock } from '../clock';
import type { LedgerType, Persistence, RoomStatusValue } from '../persistence';
import type { Dealer, FairRecord } from './dealer';

export class RoomError extends Error {}

export interface Transport {
  /** Sends to every socket of one user in this room */
  toUser(userId: string, event: string, payload: unknown): void;
  /** Sends to every socket in this room */
  toAll(event: string, payload: unknown): void;
  /** Removes a user's sockets from the room channel */
  evict(userId: string): void;
}

export interface RoomDeps {
  persistence: Persistence;
  clock: Clock;
  dealer: Dealer;
  transport: Transport;
  /** Delays in ms (overridable in tests) */
  delays?: Partial<typeof DEFAULT_DELAYS>;
}

const DEFAULT_DELAYS = {
  /** Pause after a hand won without showdown */
  afterHand: 2500,
  /** Pause after a showdown so everyone can see the cards */
  afterShowdown: 5500,
  /** Time to decide show/muck or run-it-twice */
  decisionMs: 10_000,
};

export interface RoomInfo {
  id: string;
  code: string;
  hostId: string;
  config: RoomConfig;
  status: RoomStatusValue;
}

export interface SeatPlayer {
  userId: string;
  username: string;
  seat: number;
  stack: number;
  status: SeatStatus;
  timeBankChips: number;
  handsTowardRefill: number;
  consecutiveTimeouts: number;
  sitOutNext: boolean;
  leaving: boolean;
  /** Chips approved while in a hand, added when it ends */
  pendingChips: number;
  pendingAmount?: number;
}

interface Member {
  userId: string;
  username: string;
  sockets: number;
}

export interface BuyInRequest extends BuyInRequestView {
  entry: 'waitForBB' | 'postBB';
}

interface LedgerLine {
  userId: string;
  type: LedgerType;
  chips: number;
  amountMinor: number;
}

interface ActiveTimer {
  handle: unknown;
  key: string;
  deadline: number;
  usingBank: boolean;
}

export interface RoomSnapshot {
  version: 1;
  handNo: number;
  prev: PrevPositions | null;
  seats: Omit<SeatPlayer, 'pendingAmount'>[];
  pendingBlinds: { smallBlind: number; bigBlind: number } | null;
  cashBlinds: { smallBlind: number; bigBlind: number } | null;
  stats: { handsPlayed: number; biggestPot: number; handsByUser: Record<string, number> };
  ledger: LedgerLine[];
  usernames: Record<string, string>;
  autoApprove: boolean;
  extra?: unknown;
}

export class Room {
  readonly id: string;
  readonly code: string;
  readonly hostId: string;
  config: RoomConfig;
  status: RoomStatusValue;

  protected seats: (SeatPlayer | null)[];
  protected members = new Map<string, Member>();
  protected usernames = new Map<string, string>();
  protected banned = new Set<string>();
  protected requests: BuyInRequest[] = [];
  protected chat: ChatMessage[] = [];
  protected ledger: LedgerLine[] = [];

  protected hand: HandState | null = null;
  protected handFair: FairRecord | null = null;
  protected handStartedAt = new Date();
  protected handSeats = new Map<number, string>(); // seat -> userId for the current hand
  protected handNo = 0;
  protected prev: PrevPositions | null = null;
  protected starting = false;
  protected endAfterHand = false;
  protected nextHandTimer: unknown = null;
  protected timer: ActiveTimer | null = null;
  protected cashBlinds: { smallBlind: number; bigBlind: number } | null;
  protected pendingBlinds: { smallBlind: number; bigBlind: number } | null = null;
  protected stats = { handsPlayed: 0, biggestPot: 0, handsByUser: {} as Record<string, number> };
  protected lastActions = new Map<number, string>();
  protected notice: string | null = null;
  protected broadcastQueued = false;
  protected writeChain: Promise<void> = Promise.resolve();
  protected readonly delays: typeof DEFAULT_DELAYS;

  constructor(
    info: RoomInfo,
    protected deps: RoomDeps,
    snapshot?: RoomSnapshot | null,
  ) {
    this.id = info.id;
    this.code = info.code;
    this.hostId = info.hostId;
    this.config = info.config;
    this.status = info.status;
    this.delays = { ...DEFAULT_DELAYS, ...deps.delays };
    this.seats = Array.from({ length: info.config.maxSeats }, () => null);
    this.cashBlinds = info.config.cash ? { smallBlind: info.config.cash.smallBlind, bigBlind: info.config.cash.bigBlind } : null;
    if (snapshot) this.restore(snapshot);
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  join(userId: string, username: string) {
    if (this.banned.has(userId)) throw new RoomError('You were removed from this room');
    const m = this.members.get(userId) ?? { userId, username, sockets: 0 };
    m.sockets++;
    this.members.set(userId, m);
    this.usernames.set(userId, username);
    const seated = this.seatOf(userId);
    if (seated) this.queueBroadcast();
    this.persist((p) => p.markMember(this.id, userId, false));
    this.deps.transport.toUser(userId, 'chat:history', this.chat);
    this.queueBroadcast();
  }

  /** A socket disconnected (the seat is held). */
  disconnect(userId: string) {
    const m = this.members.get(userId);
    if (!m) return;
    m.sockets = Math.max(0, m.sockets - 1);
    if (m.sockets === 0 && !this.seatOf(userId)) this.members.delete(userId);
    this.rearmTimerForConnectivity(userId);
    this.queueBroadcast();
  }

  isMember(userId: string) {
    return this.members.has(userId);
  }

  isConnected(userId: string) {
    return (this.members.get(userId)?.sockets ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Seating and buy-ins
  // -------------------------------------------------------------------------

  requestSeat(userId: string, seat: number, amount: number | undefined, entry: 'waitForBB' | 'postBB') {
    this.assertOpen();
    if (!this.members.has(userId)) throw new RoomError('Join the room first');
    if (seat < 0 || seat >= this.seats.length) throw new RoomError('No such seat');
    if (this.seats[seat]) throw new RoomError('That seat is taken');
    if (this.seatOf(userId)) throw new RoomError('You already have a seat at this table');
    const chips = this.validateBuyIn(userId, amount);
    const username = this.usernames.get(userId)!;
    this.seats[seat] = this.newSeatPlayer(userId, username, seat, 'pending');
    this.seats[seat]!.pendingAmount = chips;
    const req: BuyInRequest = { id: randomUUID(), userId, username, kind: this.buyInKind(), amount: chips, seat, entry };
    this.requests.push(req);
    if (this.config.autoApprove || userId === this.hostId) this.approve(this.hostId, req.id);
    else this.system(`${username} asks to sit down with ${chips.toLocaleString()} chips`);
    this.queueBroadcast();
  }

  /** Cash: buy-in must be within limits. Overridden by tournaments. */
  protected validateBuyIn(_userId: string, amount: number | undefined): number {
    const cash = this.config.cash!;
    const chips = amount ?? cash.maxBuyIn;
    if (chips < cash.minBuyIn || chips > cash.maxBuyIn) {
      throw new RoomError(`Buy-in must be between ${cash.minBuyIn} and ${cash.maxBuyIn}`);
    }
    return chips;
  }

  protected buyInKind(): BuyInRequest['kind'] {
    return 'buyIn';
  }

  cancelRequest(userId: string) {
    const req = this.requests.find((r) => r.userId === userId);
    if (!req) throw new RoomError('No pending request');
    this.dropRequest(req);
    this.queueBroadcast();
  }

  requestRebuy(userId: string, amount: number | undefined) {
    this.assertOpen();
    const sp = this.seatOf(userId);
    if (!sp || sp.status === 'pending') throw new RoomError('You are not seated');
    if (this.requests.some((r) => r.userId === userId)) throw new RoomError('You already have a pending request');
    const cash = this.config.cash;
    if (!cash) throw new RoomError('Rebuys are handled by the tournament');
    const current = sp.stack + sp.pendingChips;
    const room = cash.maxBuyIn - current;
    const chips = amount ?? room;
    if (chips < 1 || chips > room) throw new RoomError(`You can add up to ${Math.max(0, room)} chips`);
    if (current === 0 && chips < cash.minBuyIn) throw new RoomError(`Rebuy must be at least ${cash.minBuyIn}`);
    const req: BuyInRequest = {
      id: randomUUID(),
      userId,
      username: sp.username,
      kind: current === 0 ? 'rebuy' : 'topUp',
      amount: chips,
      seat: sp.seat,
      entry: 'waitForBB',
    };
    this.requests.push(req);
    if (this.config.autoApprove || userId === this.hostId) this.approve(this.hostId, req.id);
    else this.system(`${sp.username} requests a ${req.kind === 'rebuy' ? 'rebuy' : 'top-up'} of ${chips.toLocaleString()}`);
    this.queueBroadcast();
  }

  approve(byUserId: string, requestId: string) {
    this.assertHost(byUserId);
    const req = this.requests.find((r) => r.id === requestId);
    if (!req) throw new RoomError('Request not found');
    this.requests = this.requests.filter((r) => r !== req);
    this.applyApproved(req);
    this.queueBroadcast();
    this.maybeStartHand();
  }

  deny(byUserId: string, requestId: string) {
    this.assertHost(byUserId);
    const req = this.requests.find((r) => r.id === requestId);
    if (!req) throw new RoomError('Request not found');
    this.dropRequest(req);
    this.system(`Request from ${req.username} was declined`);
    this.queueBroadcast();
  }

  protected dropRequest(req: BuyInRequest) {
    this.requests = this.requests.filter((r) => r !== req);
    if (req.kind === 'buyIn' || req.kind === 'entry') {
      const sp = req.seat !== null ? this.seats[req.seat] : null;
      if (sp && sp.userId === req.userId && sp.status === 'pending') this.seats[req.seat!] = null;
    }
  }

  protected applyApproved(req: BuyInRequest) {
    if (req.kind === 'buyIn') {
      const sp = this.seats[req.seat!];
      if (!sp || sp.userId !== req.userId) return;
      sp.stack = req.amount;
      sp.pendingAmount = undefined;
      sp.status = this.prev && this.status !== 'OPEN' ? req.entry : 'active';
      this.addLedger(req.userId, 'BUY_IN', req.amount);
      this.persist((p) => p.markMember(this.id, req.userId, true));
      this.system(`${req.username} sits down with ${req.amount.toLocaleString()}`);
    } else if (req.kind === 'rebuy' || req.kind === 'topUp') {
      const sp = this.seatOf(req.userId);
      if (!sp) return;
      if (this.isInLiveHand(sp.seat)) sp.pendingChips += req.amount;
      else {
        sp.stack += req.amount;
        if (sp.status === 'busted') sp.status = 'active';
      }
      this.addLedger(req.userId, req.kind === 'rebuy' ? 'REBUY' : 'TOP_UP', req.amount);
      this.system(`${req.username} adds ${req.amount.toLocaleString()} chips`);
    }
  }

  /** Tournaments override this. */
  requestAddOn(_userId: string) {
    throw new RoomError('Add-ons are only available in tournaments');
  }

  /** A player's contribution to the provably fair shuffle. */
  submitSeed(userId: string, handNo: number, seed: string) {
    this.deps.dealer.submitSeed?.(userId, handNo, seed);
  }

  sitOut(userId: string) {
    const sp = this.requireSeat(userId);
    if (this.isInLiveHand(sp.seat)) sp.sitOutNext = true;
    else sp.status = 'sittingOut';
    this.queueBroadcast();
  }

  sitIn(userId: string, entry: 'waitForBB' | 'postBB') {
    const sp = this.requireSeat(userId);
    sp.sitOutNext = false;
    sp.consecutiveTimeouts = 0;
    if (sp.status !== 'sittingOut' && sp.status !== 'busted') {
      this.queueBroadcast();
      return;
    }
    if (sp.stack <= 0) throw new RoomError('You need chips first: request a rebuy');
    sp.status = this.prev ? entry : 'active';
    this.queueBroadcast();
    this.maybeStartHand();
  }

  leaveSeat(userId: string) {
    const sp = this.seatOf(userId);
    if (!sp) throw new RoomError('You are not seated');
    if (sp.status === 'pending') {
      const req = this.requests.find((r) => r.userId === userId && r.kind === 'buyIn');
      if (req) this.dropRequest(req);
      this.queueBroadcast();
      return;
    }
    if (this.isDealtInLiveHand(sp.seat)) {
      sp.leaving = true;
      this.system(`${sp.username} will leave after this hand`);
      this.afterChange();
      return;
    }
    this.removeFromSeat(sp);
    this.queueBroadcast();
  }

  /** Cash-out and free the seat (between hands, or when not dealt in). */
  protected removeFromSeat(sp: SeatPlayer) {
    const chips = sp.stack + sp.pendingChips;
    if (this.config.gameMode === 'CASH') this.addLedger(sp.userId, 'CASH_OUT', chips);
    this.requests = this.requests.filter((r) => r.userId !== sp.userId);
    this.seats[sp.seat] = null;
    this.system(`${sp.username} leaves the table with ${chips.toLocaleString()}`);
    if (!this.isConnected(sp.userId)) this.members.delete(sp.userId);
  }

  // -------------------------------------------------------------------------
  // Host controls
  // -------------------------------------------------------------------------

  start(byUserId: string) {
    this.assertHost(byUserId);
    if (this.status !== 'OPEN') throw new RoomError('Already started');
    this.status = 'RUNNING';
    this.onStart();
    this.system('The game has started');
    this.saveSnapshot();
    this.queueBroadcast();
    this.maybeStartHand();
  }

  protected onStart() {}

  pause(byUserId: string) {
    this.assertHost(byUserId);
    if (this.status !== 'RUNNING') throw new RoomError('The game is not running');
    this.status = 'PAUSED';
    this.onPause();
    this.system(this.hand && this.hand.phase !== 'complete' ? 'Game will pause after this hand' : 'Game paused');
    this.saveSnapshot();
    this.queueBroadcast();
  }

  protected onPause() {}

  resume(byUserId: string) {
    this.assertHost(byUserId);
    if (this.status !== 'PAUSED') throw new RoomError('The game is not paused');
    this.status = 'RUNNING';
    this.onResume();
    this.system('Game resumed');
    this.saveSnapshot();
    this.queueBroadcast();
    this.maybeStartHand();
  }

  protected onResume() {}

  kick(byUserId: string, userId: string) {
    this.assertHost(byUserId);
    if (userId === this.hostId) throw new RoomError('You cannot kick yourself');
    this.banned.add(userId);
    const sp = this.seatOf(userId);
    const name = this.usernames.get(userId) ?? 'Player';
    this.requests = this.requests.filter((r) => r.userId !== userId);
    if (sp) {
      if (sp.status === 'pending') this.seats[sp.seat] = null;
      else if (this.isDealtInLiveHand(sp.seat)) sp.leaving = true;
      else this.removeFromSeat(sp);
    }
    this.members.delete(userId);
    this.deps.transport.toUser(userId, 'room:kicked', { reason: 'The host removed you from the room' });
    this.deps.transport.evict(userId);
    this.system(`${name} was removed by the host`);
    this.afterChange();
  }

  setBlinds(byUserId: string, smallBlind: number, bigBlind: number) {
    this.assertHost(byUserId);
    if (this.config.gameMode !== 'CASH') throw new RoomError('Blinds follow the tournament schedule');
    if (smallBlind > bigBlind) throw new RoomError('Small blind must not exceed the big blind');
    this.pendingBlinds = { smallBlind, bigBlind };
    if (!this.hand || this.hand.phase === 'complete') this.applyPendingBlinds();
    else this.system(`Blinds will change to ${smallBlind}/${bigBlind} from the next hand`);
    this.queueBroadcast();
  }

  setAutoApprove(byUserId: string, autoApprove: boolean) {
    this.assertHost(byUserId);
    this.config = { ...this.config, autoApprove };
    this.queueBroadcast();
  }

  protected applyPendingBlinds() {
    if (!this.pendingBlinds) return;
    this.cashBlinds = this.pendingBlinds;
    this.pendingBlinds = null;
    this.system(`Blinds are now ${this.cashBlinds.smallBlind}/${this.cashBlinds.bigBlind}`);
  }

  end(byUserId: string) {
    this.assertHost(byUserId);
    if (this.status === 'ENDED') return;
    if (this.hand && this.hand.phase !== 'complete') {
      this.endAfterHand = true;
      this.system('The session will end after this hand');
      this.queueBroadcast();
      return;
    }
    this.finishSession();
  }

  protected finishSession() {
    this.clearNextHand();
    this.clearTimer();
    for (const sp of this.seats) {
      if (!sp) continue;
      if (sp.status === 'pending') {
        this.seats[sp.seat] = null;
        continue;
      }
      this.removeFromSeat(sp);
    }
    this.requests = [];
    this.status = 'ENDED';
    this.onEnded();
    const results = this.results();
    this.persist((p) => p.endRoom(this.id, results));
    this.system('The session has ended');
    this.queueBroadcast();
  }

  protected onEnded() {}

  /** Final results stored with the room (extended by ledger/tournament modes). */
  protected results(): unknown {
    return { stats: this.statsView(), ledger: this.ledgerSummary() };
  }

  /** Ledger mode: each player's net, the minimum transfers to settle, and any discrepancy. */
  protected ledgerSummary() {
    const l = this.config.ledger;
    if (this.config.moneyMode !== 'LEDGER' || !l) return null;
    const { balances, rounded } = computeBalances(this.ledger, this.config.gameMode, l.ratio);
    const discrepancies = findDiscrepancies(balances, this.config.gameMode);
    const named = balances.map((b) => ({ ...b, username: this.usernames.get(b.userId) ?? '?' }));
    return {
      currency: l.currency,
      ratio: l.ratio,
      balances: named,
      transfers: discrepancies.length ? [] : settle(balances),
      discrepancies,
      rounded,
    };
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  sendChat(userId: string, text: string) {
    const clean = sanitizeChat(text);
    if (!clean) return;
    const msg: ChatMessage = { id: randomUUID(), userId, username: this.usernames.get(userId) ?? '?', text: clean, ts: this.deps.clock.now() };
    this.pushChat(msg);
  }

  react(userId: string, emoji: string) {
    this.deps.transport.toAll('chat:reaction', {
      userId,
      username: this.usernames.get(userId) ?? '?',
      seat: this.seatOf(userId)?.seat ?? null,
      emoji,
    });
  }

  protected system(text: string) {
    this.pushChat({ id: randomUUID(), userId: 'system', username: 'Dealer', text, ts: this.deps.clock.now(), system: true });
  }

  private pushChat(msg: ChatMessage) {
    this.chat.push(msg);
    if (this.chat.length > 100) this.chat.shift();
    this.deps.transport.toAll('chat:message', msg);
  }

  // -------------------------------------------------------------------------
  // Hand lifecycle
  // -------------------------------------------------------------------------

  /** Blinds for the next hand. */
  protected blinds(): { smallBlind: number; bigBlind: number; ante: number } {
    return { ...this.cashBlinds!, ante: 0 };
  }

  /** Seated players eligible to be dealt in, with their entry status. */
  protected candidates() {
    return this.seats
      .filter((sp): sp is SeatPlayer => !!sp && sp.stack > 0 && (sp.status === 'active' || sp.status === 'waitForBB' || sp.status === 'postBB') && !sp.leaving)
      .map((sp) => ({ seat: sp.seat, id: sp.userId, entry: sp.status as 'active' | 'waitForBB' | 'postBB' }));
  }

  protected canStartHands() {
    return this.status === 'RUNNING';
  }

  maybeStartHand() {
    if (!this.canStartHands() || this.starting || this.nextHandTimer) return;
    if (this.hand && this.hand.phase !== 'complete') return;
    const pos = nextPositions(this.candidates(), this.prev, (n) => randomInt(n));
    if (!pos) {
      this.notice = 'Waiting for at least two players';
      this.queueBroadcast();
      return;
    }
    this.notice = null;
    this.starting = true;
    const participants = pos.dealtSeats.map((seat) => ({
      seat,
      userId: this.seats[seat]!.userId,
      connected: this.isConnected(this.seats[seat]!.userId),
    }));
    const handNo = this.handNo + 1;
    this.deps.dealer
      .prepare(handNo, participants)
      .then(({ deck, fair }) => {
        this.starting = false;
        if (!this.canStartHands()) return;
        // Everyone dealt must still be seated with chips (leaving players are dealt and auto-folded).
        const stillThere = participants.every(({ seat, userId }) => this.seats[seat]?.userId === userId && this.seats[seat]!.stack > 0);
        if (!stillThere) {
          this.maybeStartHand();
          return;
        }
        this.dealHand(handNo, pos, deck, fair);
      })
      .catch((err) => {
        this.starting = false;
        console.error(`[room ${this.code}] failed to prepare deck`, err);
      });
  }

  protected dealHand(handNo: number, pos: NonNullable<ReturnType<typeof nextPositions>>, deck: number[], fair: FairRecord) {
    const { smallBlind, bigBlind, ante } = this.blinds();
    this.hand = startHand({
      handNo,
      players: pos.dealtSeats.map((seat) => ({ seat, id: this.seats[seat]!.userId, stack: this.seats[seat]!.stack })),
      buttonSeat: pos.buttonSeat,
      sbSeat: pos.sbSeat,
      bbSeat: pos.bbSeat,
      postBBSeats: pos.postBBSeats,
      smallBlind,
      bigBlind,
      bigBlindAnte: ante,
      deck,
      runItTwiceAllowed: this.config.gameMode === 'CASH' && !!this.config.cash?.runItTwice,
    });
    this.handNo = handNo;
    this.handFair = fair;
    this.handStartedAt = new Date(this.deps.clock.now());
    this.prev = toPrev(pos);
    this.handSeats = new Map(pos.dealtSeats.map((seat) => [seat, this.seats[seat]!.userId]));
    this.handClosed = false;
    this.lastActions.clear();
    for (const seat of pos.dealtSeats) {
      const sp = this.seats[seat]!;
      sp.status = 'active';
      sp.handsTowardRefill++;
      const t = this.config.timing;
      if (sp.handsTowardRefill >= t.timeBankRefillHands) {
        sp.handsTowardRefill = 0;
        sp.timeBankChips = Math.min(t.timeBankMaxChips, sp.timeBankChips + 1);
      }
    }
    this.deps.transport.toAll('table:event', { kind: 'newHand', amount: handNo });
    this.afterChange();
  }

  /** Called with a validated action from a player. */
  act(userId: string, handNo: number, action: PlayerAction) {
    const hand = this.hand;
    if (!hand || hand.phase === 'complete' || hand.config.handNo !== handNo) throw new RoomError('That hand is over');
    const seat = this.currentHandSeat(userId);
    if (seat === null) throw new RoomError('You are not in this hand');
    this.applyToHand(seat, action);
    const sp = this.seats[seat];
    if (sp) sp.consecutiveTimeouts = 0;
  }

  protected currentHandSeat(userId: string): number | null {
    for (const [seat, uid] of this.handSeats) if (uid === userId) return seat;
    return null;
  }

  protected applyToHand(seat: number, action: PlayerAction) {
    const before = this.hand!;
    let next: HandState;
    try {
      next = applyAction(before, seat, action);
    } catch (e) {
      if (e instanceof ActionError) throw new RoomError(e.message);
      throw e;
    }
    this.hand = next;
    this.emitNewEvents(before.events.length);
    this.afterChange();
  }

  private emitNewEvents(from: number) {
    const hand = this.hand!;
    for (const e of hand.events.slice(from)) {
      switch (e.type) {
        case 'action': {
          const label =
            e.action === 'fold'
              ? 'Fold'
              : e.action === 'check'
                ? 'Check'
                : e.action === 'call'
                  ? `Call ${e.amount.toLocaleString()}`
                  : `${e.action === 'bet' ? 'Bet' : 'Raise to'} ${e.to.toLocaleString()}`;
          this.lastActions.set(e.seat, e.allIn ? 'All-in' : label);
          this.deps.transport.toAll('table:event', { kind: e.action, seat: e.seat, amount: e.amount });
          break;
        }
        case 'street':
          for (const k of this.lastActions.keys()) if (this.lastActions.get(k) !== 'Fold' && this.lastActions.get(k) !== 'All-in') this.lastActions.delete(k);
          this.deps.transport.toAll('table:event', { kind: 'street', text: e.street });
          break;
        case 'pot':
          for (const w of e.winners) this.deps.transport.toAll('table:event', { kind: 'win', seat: w.seat, amount: w.amount });
          break;
        case 'muck':
          this.lastActions.set(e.seat, 'Muck');
          break;
      }
    }
  }

  /** Common follow-up after any change to the hand. */
  protected afterChange() {
    if (this.hand && this.hand.phase === 'complete' && !this.handClosed) {
      this.onHandComplete();
    } else if (this.hand && this.hand.phase !== 'complete') {
      this.armTimer();
    }
    this.queueBroadcast();
  }

  protected handClosed = false;

  protected onHandComplete() {
    const hand = this.hand!;
    this.handClosed = true;
    this.clearTimer();
    const total = hand.events.reduce((t, e) => t + (e.type === 'pot' ? e.amount : 0), 0);
    this.stats.handsPlayed++;
    this.stats.biggestPot = Math.max(this.stats.biggestPot, total);
    for (const p of hand.players) {
      this.stats.handsByUser[p.id] = (this.stats.handsByUser[p.id] ?? 0) + 1;
      const sp = this.seats[p.seat];
      if (sp && sp.userId === p.id) sp.stack = p.stack;
    }
    this.saveHand(hand, total);
    this.afterHandSettled(hand);

    // Apply queued changes now that nobody's chips are in play.
    for (const sp of this.seats) {
      if (!sp || sp.status === 'pending') continue;
      if (sp.pendingChips > 0) {
        sp.stack += sp.pendingChips;
        sp.pendingChips = 0;
      }
      if (sp.leaving) {
        this.removeFromSeat(sp);
        continue;
      }
      if (sp.sitOutNext) {
        sp.sitOutNext = false;
        sp.status = 'sittingOut';
      }
      this.handleZeroStack(sp);
    }
    this.applyPendingBlinds();
    this.saveSnapshot();

    if (this.endAfterHand) {
      this.endAfterHand = false;
      this.finishSession();
      return;
    }
    const showdown = hand.events.some((e) => e.type === 'show' || e.type === 'reveal');
    this.nextHandTimer = this.deps.clock.setTimeout(
      () => {
        this.nextHandTimer = null;
        this.maybeStartHand();
        this.queueBroadcast();
      },
      showdown ? this.delays.afterShowdown : this.delays.afterHand,
    );
  }

  /** Hook for tournaments (eliminations, level changes). */
  protected afterHandSettled(_hand: HandState) {}

  /** Cash: a busted player stays seated, sitting out until they rebuy or leave. */
  protected handleZeroStack(sp: SeatPlayer) {
    if (sp.stack === 0 && sp.status !== 'busted') {
      sp.status = 'busted';
      this.system(`${sp.username} is out of chips`);
    }
  }

  protected saveHand(hand: HandState, potTotalAmount: number) {
    const fair = this.handFair ?? { serverSeedHash: '', serverSeed: '', handId: '', clientSeeds: [] };
    const labels = positionLabels(
      hand.players.map((p) => p.seat),
      hand.config.buttonSeat,
      hand.config.sbSeat,
      hand.config.bbSeat,
    );
    const stats = new Map(handStats(hand).map((s) => [s.seat, s]));
    const record = {
      handNo: hand.config.handNo,
      startedAt: this.handStartedAt,
      serverSeedHash: fair.serverSeedHash,
      serverSeed: fair.serverSeed,
      clientSeeds: { handId: fair.handId, seeds: fair.clientSeeds },
      smallBlind: hand.config.smallBlind,
      bigBlind: hand.config.bigBlind,
      ante: hand.config.bigBlindAnte ?? 0,
      board: { board: hand.board, board2: hand.board2 },
      potTotal: potTotalAmount,
      history: { config: hand.config, events: hand.events },
      players: hand.players.map((p) => {
        const st = stats.get(p.seat)!;
        return {
          userId: p.id,
          seat: p.seat,
          position: labels.get(p.seat) ?? '',
          holeCards: p.holeCards,
          shown: p.shown,
          startStack: p.startStack,
          endStack: p.stack,
          net: p.stack - p.startStack,
          vpip: st.vpip,
          pfr: st.pfr,
          threeBet: st.threeBet,
          sawFlop: st.sawFlop,
          sawShowdown: st.sawShowdown,
          wonShowdown: st.wonShowdown,
          wonHand: st.wonHand,
        };
      }),
    };
    this.persist((p) => p.saveHand(this.id, record));
  }

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------

  protected armTimer() {
    const hand = this.hand;
    if (!hand || hand.phase === 'complete') return this.clearTimer();
    const pending = pendingSeats(hand);
    if (pending.length === 0) return this.clearTimer();
    const key = `${hand.config.handNo}:${hand.seq}:${hand.phase}:${pending.join(',')}`;
    if (this.timer?.key === key) return;
    this.clearTimer();

    // Players who left, or who are away in a tournament, act instantly.
    const instant = pending.filter((seat) => this.shouldActInstantly(seat));
    if (instant.length > 0) {
      const seat = instant[0];
      const handle = this.deps.clock.setTimeout(() => this.onTimeout(seat, true), 0);
      this.timer = { handle, key, deadline: this.deps.clock.now(), usingBank: false };
      return;
    }
    const t = this.config.timing;
    const ms = hand.phase === 'betting' ? (hand.street === 'preflop' ? t.preflopSeconds : t.postflopSeconds) * 1000 : this.delays.decisionMs;
    const deadline = this.deps.clock.now() + ms;
    const handle = this.deps.clock.setTimeout(() => this.onTimeout(pending[0], false), ms);
    this.timer = { handle, key, deadline, usingBank: false };
  }

  protected shouldActInstantly(seat: number): boolean {
    const sp = this.seats[seat];
    const uid = this.handSeats.get(seat);
    if (!sp || sp.userId !== uid) return true;
    return sp.leaving;
  }

  private rearmTimerForConnectivity(userId: string) {
    const hand = this.hand;
    if (!hand || hand.phase === 'complete') return;
    const seat = this.currentHandSeat(userId);
    if (seat !== null && pendingSeats(hand).includes(seat) && this.shouldActInstantly(seat)) {
      this.clearTimer();
      this.armTimer();
    }
  }

  protected onTimeout(seat: number, instant: boolean) {
    const hand = this.hand;
    if (!hand || hand.phase === 'complete' || !this.timer) return;
    const sp = this.seats[seat];
    // Use a time-bank chip if the player has one and is still connected.
    if (!instant && hand.phase === 'betting' && sp && sp.timeBankChips > 0 && this.isConnected(sp.userId)) {
      sp.timeBankChips--;
      const ms = this.config.timing.timeBankChipSeconds * 1000;
      const deadline = this.deps.clock.now() + ms;
      const handle = this.deps.clock.setTimeout(() => this.onTimeout(seat, false), ms);
      this.timer = { ...this.timer, handle, deadline, usingBank: true };
      this.deps.transport.toAll('table:event', { kind: 'timeBank', seat });
      this.queueBroadcast();
      return;
    }
    this.timer = null;
    const pending = pendingSeats(hand);
    const targets = hand.phase === 'runItTwice' ? pending : [seat];
    for (const s of targets) {
      const current = this.hand!;
      if (current.phase === 'complete' || !pendingSeats(current).includes(s)) continue;
      const action = timeoutAction(current, s);
      if (!action) continue;
      if (!instant && current.phase === 'betting') {
        const p = this.seats[s];
        if (p) {
          p.consecutiveTimeouts++;
          if (p.consecutiveTimeouts >= 2) this.onRepeatedTimeouts(p);
        }
      }
      this.applyToHand(s, action);
    }
  }

  /** Cash: two timeouts in a row sits the player out from the next hand. */
  protected onRepeatedTimeouts(sp: SeatPlayer) {
    if (!sp.sitOutNext) {
      sp.sitOutNext = true;
      this.system(`${sp.username} timed out and will sit out`);
    }
  }

  protected clearTimer() {
    if (this.timer) this.deps.clock.clearTimeout(this.timer.handle);
    this.timer = null;
  }

  protected clearNextHand() {
    if (this.nextHandTimer) this.deps.clock.clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  queueBroadcast() {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    queueMicrotask(() => {
      this.broadcastQueued = false;
      this.broadcastNow();
    });
  }

  broadcastNow() {
    for (const userId of this.members.keys()) {
      if (this.isConnected(userId)) this.deps.transport.toUser(userId, 'table:state', this.viewFor(userId));
    }
  }

  /** Builds what one user is allowed to see. Hole cards of others are only included once shown. */
  viewFor(userId: string): TableView {
    const hand = this.hand;
    const mySeat = this.seatOf(userId);
    const handPlayer = (seat: number) => {
      if (!hand || this.handSeats.get(seat) !== this.seats[seat]?.userId) return null;
      return hand.players.find((p) => p.seat === seat) ?? null;
    };
    const wonBySeat = new Map<number, number>();
    if (hand?.phase === 'complete') {
      for (const e of hand.events) if (e.type === 'pot') for (const w of e.winners) wonBySeat.set(w.seat, (wonBySeat.get(w.seat) ?? 0) + w.amount);
    }
    const boardComplete = !!hand && hand.board.length === 5;

    const seats: (SeatView | null)[] = this.seats.map((sp) => {
      if (!sp) return null;
      const hp = handPlayer(sp.seat);
      let cards: SeatView['cards'] = null;
      let desc: string | null = null;
      if (hp && !hp.mucked) {
        const visible = hp.id === userId || hp.shown;
        if (visible) cards = [...hp.holeCards];
        else if (!hp.folded) cards = 'hidden';
        if (hp.shown && !hp.folded && boardComplete) desc = showdownDescriptions(hand!, hp.seat).join(' / ');
        else if (hp.id === userId && !hp.folded && hand!.board.length >= 3) desc = describeScore(scoreHand([...hp.holeCards, ...hand!.board]));
      }
      return {
        seat: sp.seat,
        userId: sp.userId,
        username: sp.username,
        stack: hp && hand!.phase !== 'complete' ? hp.stack : sp.stack,
        status: sp.status,
        connected: this.isConnected(sp.userId),
        timeBankChips: sp.timeBankChips,
        inHand: !!hp && !hp.folded && hand!.phase !== 'complete',
        streetBet: hp && hand!.phase !== 'complete' ? hp.streetBet : 0,
        folded: !!hp?.folded,
        allIn: !!hp?.allIn && hand!.phase !== 'complete',
        cards,
        handDescription: desc,
        lastAction: hp ? (this.lastActions.get(sp.seat) ?? null) : null,
        won: wonBySeat.get(sp.seat) ?? 0,
        leaving: sp.leaving,
        pendingAmount: sp.pendingAmount,
      };
    });

    let handView: HandView | null = null;
    if (hand) {
      const pots = computePots(
        hand.players.map((p) => ({ seat: p.seat, committed: p.committed - (hand.phase === 'complete' ? 0 : p.streetBet), folded: p.folded || p.mucked })),
        hand.deadMoney,
      );
      const myHandSeat = this.currentHandSeat(userId);
      const results: HandView['results'] = [];
      if (hand.phase === 'complete') {
        for (const e of hand.events) {
          if (e.type === 'pot') for (const w of e.winners) results.push({ seat: w.seat, amount: w.amount, description: e.description, pot: e.index, run: e.run });
        }
      }
      handView = {
        handNo: hand.config.handNo,
        phase: hand.phase,
        street: hand.street,
        board: [...hand.board],
        board2: hand.board2 ? [...hand.board2] : null,
        buttonSeat: hand.config.buttonSeat,
        sbSeat: hand.config.sbSeat,
        bbSeat: hand.config.bbSeat,
        pots: hand.phase === 'complete' ? [] : pots,
        totalPot: hand.phase === 'complete' ? 0 : potTotal(hand),
        currentBet: hand.currentBet,
        toAct: hand.toAct,
        deadline: this.timer?.deadline ?? null,
        usingTimeBank: this.timer?.usingBank ?? false,
        legal: myHandSeat !== null ? legalActions(hand, myHandSeat) : null,
        ritPending: hand.phase === 'runItTwice' ? pendingSeats(hand) : [],
        showdownAwaiting: hand.phase === 'showdown' ? (hand.showdown?.awaiting ?? null) : null,
        results,
        fair: this.handFair?.serverSeedHash
          ? { serverSeedHash: this.handFair.serverSeedHash, serverSeed: hand.phase === 'complete' ? this.handFair.serverSeed : null }
          : null,
      };
    }

    const isHost = userId === this.hostId;
    const blinds = this.blinds();
    return {
      room: {
        id: this.id,
        code: this.code,
        name: this.config.name,
        hostId: this.hostId,
        gameMode: this.config.gameMode,
        moneyMode: this.config.moneyMode,
        status: this.status,
        config: this.config,
        smallBlind: blinds.smallBlind,
        bigBlind: blinds.bigBlind,
        ante: blinds.ante,
        pendingBlinds: this.pendingBlinds,
      },
      me: {
        userId,
        username: this.usernames.get(userId) ?? '',
        isHost,
        seat: mySeat && mySeat.status !== 'pending' ? mySeat.seat : null,
        pendingRequest: this.requests.find((r) => r.userId === userId) ?? null,
      },
      seats,
      hand: handView,
      requests: isHost ? this.requests.map(({ entry: _e, ...r }) => r) : [],
      spectators: [...this.members.values()]
        .filter((m) => !this.seatOf(m.userId) && m.sockets > 0)
        .map((m) => ({ userId: m.userId, username: m.username })),
      tournament: this.tournamentView(userId),
      stats: this.statsView(),
      notice: this.notice,
      serverNow: this.deps.clock.now(),
    };
  }

  protected tournamentView(_userId: string): TableView['tournament'] {
    return null;
  }

  protected statsView(): TableView['stats'] {
    const users = new Set<string>([...this.ledger.map((l) => l.userId), ...this.seats.filter((s) => s && s.status !== 'pending').map((s) => s!.userId)]);
    return {
      handsPlayed: this.stats.handsPlayed,
      biggestPot: this.stats.biggestPot,
      players: [...users].map((uid) => {
        const lines = this.ledger.filter((l) => l.userId === uid);
        const buyIn = lines.filter((l) => l.type === 'BUY_IN' || l.type === 'REBUY' || l.type === 'TOP_UP').reduce((t, l) => t + l.chips, 0);
        const cashOut = lines.filter((l) => l.type === 'CASH_OUT').reduce((t, l) => t + l.chips, 0);
        const sp = this.seatOf(uid);
        const stack = sp && sp.status !== 'pending' ? sp.stack + sp.pendingChips : 0;
        const net = cashOut + stack - buyIn;
        return {
          userId: uid,
          username: this.usernames.get(uid) ?? '?',
          buyIn,
          cashOut,
          stack,
          net,
          netMoney: this.chipsToMinor(net),
          handsPlayed: this.stats.handsByUser[uid] ?? 0,
        };
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Ledger (money value is only meaningful in ledger mode)
  // -------------------------------------------------------------------------

  protected chipsToMinor(chips: number): number | null {
    const l = this.config.ledger;
    if (!l || this.config.moneyMode !== 'LEDGER') return null;
    return (chips * l.ratio.minor) / l.ratio.chips;
  }

  protected addLedger(userId: string, type: LedgerType, chips: number, amountMinor?: number) {
    const minor = amountMinor ?? Math.round(this.chipsToMinor(chips) ?? 0);
    const line = { userId, type, chips, amountMinor: minor };
    this.ledger.push(line);
    this.persist((p) => p.addLedger(this.id, line));
    // Keep the recovery snapshot in step with the ledger so a crash can't lose chips.
    if (this.status !== 'ENDED') this.saveSnapshot();
  }

  /** True when nobody is connected and no hand is running (safe to unload from memory). */
  isIdle(): boolean {
    const anyone = [...this.members.values()].some((m) => m.sockets > 0);
    return !anyone && (!this.hand || this.hand.phase === 'complete') && !this.starting;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Serialises writes so they reach the database in order; failures are logged, never thrown. */
  protected persist(fn: (p: Persistence) => Promise<void>) {
    this.writeChain = this.writeChain
      .then(() => fn(this.deps.persistence))
      .catch((err) => console.error(`[room ${this.code}] persistence error`, err));
  }

  /** Resolves once all queued writes have been attempted (used by tests and shutdown). */
  flush(): Promise<void> {
    return this.writeChain;
  }

  protected saveSnapshot() {
    const snap = this.snapshot();
    const status = this.status;
    this.persist((p) => p.saveSnapshot(this.id, status, snap));
  }

  saveSnapshotNow() {
    if (this.status !== 'ENDED') this.saveSnapshot();
  }

  snapshot(): RoomSnapshot {
    return {
      version: 1,
      handNo: this.handNo,
      prev: this.prev,
      seats: this.seats
        .filter((s): s is SeatPlayer => !!s && s.status !== 'pending')
        .map(({ pendingAmount: _p, ...s }) => ({ ...s })),
      pendingBlinds: this.pendingBlinds,
      cashBlinds: this.cashBlinds,
      stats: structuredClone(this.stats),
      ledger: [...this.ledger],
      usernames: Object.fromEntries(this.usernames),
      autoApprove: this.config.autoApprove,
      extra: this.snapshotExtra(),
    };
  }

  protected snapshotExtra(): unknown {
    return undefined;
  }

  protected restoreExtra(_extra: unknown) {}

  protected restore(s: RoomSnapshot) {
    this.handNo = s.handNo;
    this.prev = s.prev;
    for (const sp of s.seats) {
      if (sp.seat < this.seats.length) this.seats[sp.seat] = { ...sp, leaving: false, consecutiveTimeouts: 0 };
    }
    this.pendingBlinds = s.pendingBlinds;
    this.cashBlinds = s.cashBlinds ?? this.cashBlinds;
    this.stats = s.stats;
    this.ledger = s.ledger;
    this.usernames = new Map(Object.entries(s.usernames));
    this.config = { ...this.config, autoApprove: s.autoApprove };
    this.restoreExtra(s.extra);
    // A running game resumes paused so the host can restart it when everyone is back.
    if (this.status === 'RUNNING') this.status = 'PAUSED';
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  protected newSeatPlayer(userId: string, username: string, seat: number, status: SeatStatus): SeatPlayer {
    return {
      userId,
      username,
      seat,
      stack: 0,
      status,
      timeBankChips: this.config.timing.timeBankChips,
      handsTowardRefill: 0,
      consecutiveTimeouts: 0,
      sitOutNext: false,
      leaving: false,
      pendingChips: 0,
    };
  }

  seatOf(userId: string): SeatPlayer | null {
    return this.seats.find((s) => s?.userId === userId) ?? null;
  }

  protected requireSeat(userId: string): SeatPlayer {
    const sp = this.seatOf(userId);
    if (!sp || sp.status === 'pending') throw new RoomError('You are not seated');
    return sp;
  }

  /** Dealt into a hand that is still being played. */
  protected isDealtInLiveHand(seat: number): boolean {
    return !!this.hand && this.hand.phase !== 'complete' && this.handSeats.get(seat) === this.seats[seat]?.userId;
  }

  /** Has chips at risk in the live hand (dealt in and not folded). */
  protected isInLiveHand(seat: number): boolean {
    if (!this.isDealtInLiveHand(seat)) return false;
    return !this.hand!.players.find((p) => p.seat === seat)!.folded;
  }

  protected assertHost(userId: string) {
    if (userId !== this.hostId) throw new RoomError('Only the host can do that');
  }

  protected assertOpen() {
    if (this.status === 'ENDED') throw new RoomError('This session has ended');
  }

  /** Stops timers (used on shutdown and in tests). */
  dispose() {
    this.clearTimer();
    this.clearNextHand();
  }
}
