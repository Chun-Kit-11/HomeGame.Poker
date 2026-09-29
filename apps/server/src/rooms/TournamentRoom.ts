import { randomUUID } from 'node:crypto';
import type { HandState } from '@poker/engine';
import { type Elimination, type Standing, type TableView, computeStandings, defaultPayouts } from '@poker/shared';
import { type BuyInRequest, Room, RoomError, type RoomDeps, type RoomInfo, type RoomSnapshot, type SeatPlayer } from './Room';

interface TournamentState {
  /** 0-based current level */
  level: number;
  /** Epoch ms when the current level ends (null while paused or not started) */
  levelEndsAt: number | null;
  /** Remaining ms of the level while paused */
  levelRemainingMs: number | null;
  /** Everyone who has ever entered */
  entrants: string[];
  eliminations: Elimination[];
  rebuys: Record<string, number>;
  addOns: string[];
  standings: Standing[] | null;
  prizePool: number;
}

/**
 * Sit & Go tournament: fixed starting stacks, a blind-level clock with big
 * blind antes, late registration, optional rebuys and add-on, eliminations,
 * and payouts from the prize pool.
 */
export class TournamentRoom extends Room {
  private t: TournamentState = {
    level: 0,
    levelEndsAt: null,
    levelRemainingMs: null,
    entrants: [],
    eliminations: [],
    rebuys: {},
    addOns: [],
    standings: null,
    prizePool: 0,
  };
  private levelTimer: unknown = null;

  constructor(info: RoomInfo, deps: RoomDeps, snapshot?: RoomSnapshot | null) {
    super(info, deps, snapshot);
    // Field initialisers run after super(), so apply the snapshot's tournament state here.
    if (snapshot?.extra) this.t = structuredClone(snapshot.extra as TournamentState);
    if (this.status === 'RUNNING' || this.status === 'PAUSED') {
      // restored: the clock resumes when the host resumes
      if (this.t.levelEndsAt !== null) {
        this.t.levelRemainingMs = Math.max(0, this.t.levelEndsAt - deps.clock.now());
        this.t.levelEndsAt = null;
      }
    }
  }

  private get cfg() {
    return this.config.tournament!;
  }

  private get levelNumber() {
    return this.t.level + 1;
  }

  // -------------------------------------------------------------------------
  // Registration, rebuys, add-on
  // -------------------------------------------------------------------------

  private lateRegOpen() {
    if (this.status === 'OPEN') return true;
    if (this.status === 'ENDED' || this.t.standings) return false;
    return this.levelNumber <= this.cfg.lateRegLevels;
  }

  private rebuyOpen() {
    return this.cfg.rebuy.enabled && this.status !== 'OPEN' && this.status !== 'ENDED' && this.levelNumber <= this.cfg.rebuy.untilLevel;
  }

  private addOnOpen() {
    return this.cfg.addOn.enabled && this.status !== 'OPEN' && this.status !== 'ENDED' && this.levelNumber === this.cfg.rebuy.untilLevel + 1;
  }

  protected override validateBuyIn(userId: string): number {
    if (!this.lateRegOpen()) throw new RoomError('Registration is closed');
    if (this.t.entrants.includes(userId) && this.status !== 'OPEN') throw new RoomError('You have already entered this tournament');
    return this.cfg.startingStack;
  }

  protected override buyInKind() {
    return 'entry' as const;
  }

  protected override applyApproved(req: BuyInRequest) {
    const sp = this.seatOf(req.userId);
    if (req.kind === 'entry') {
      if (!sp || req.seat === null || sp.seat !== req.seat) return;
      sp.stack = req.amount;
      sp.pendingAmount = undefined;
      sp.status = 'active';
      if (!this.t.entrants.includes(req.userId)) this.t.entrants.push(req.userId);
      if (this.status !== 'OPEN') this.recordEntry(req.userId);
      this.persist((p) => p.markMember(this.id, req.userId, true));
      this.system(this.status === 'OPEN' ? `${req.username} registered` : `${req.username} late-registers with ${req.amount.toLocaleString()}`);
    } else if (req.kind === 'rebuy' || req.kind === 'addOn') {
      if (!sp) return;
      if (this.isInLiveHand(sp.seat)) sp.pendingChips += req.amount;
      else sp.stack += req.amount;
      if (sp.status === 'busted') sp.status = 'active';
      const price = req.kind === 'rebuy' ? this.config.ledger?.rebuyPrice : this.config.ledger?.addOnPrice;
      this.addLedger(req.userId, req.kind === 'rebuy' ? 'REBUY' : 'ADDON', req.amount, this.isLedger() ? (price ?? 0) : 0);
      this.t.prizePool += this.isLedger() ? (price ?? 0) : 0;
      if (req.kind === 'rebuy') this.t.rebuys[req.userId] = (this.t.rebuys[req.userId] ?? 0) + 1;
      else this.t.addOns.push(req.userId);
      this.system(`${req.username} ${req.kind === 'rebuy' ? 'rebuys' : 'takes the add-on'} (+${req.amount.toLocaleString()})`);
    }
  }

  private isLedger() {
    return this.config.moneyMode === 'LEDGER' && !!this.config.ledger;
  }

  private recordEntry(userId: string) {
    const price = this.isLedger() ? this.config.ledger!.entryPrice : 0;
    this.addLedger(userId, 'ENTRY', this.cfg.startingStack, price);
    this.t.prizePool += price;
  }

  override requestRebuy(userId: string) {
    const sp = this.seatOf(userId);
    if (!sp || sp.status === 'pending') throw new RoomError('You are not in the tournament');
    if (!this.rebuyOpen()) throw new RoomError('The rebuy period is over');
    if (sp.stack + sp.pendingChips > this.cfg.startingStack) throw new RoomError('You can rebuy when you have the starting stack or less');
    this.queueRequest(userId, 'rebuy', this.cfg.rebuy.chips);
  }

  override requestAddOn(userId: string) {
    const sp = this.seatOf(userId);
    if (!sp || sp.status === 'pending' || sp.status === 'busted') throw new RoomError('You are not in the tournament');
    if (!this.addOnOpen()) throw new RoomError('The add-on is not available now');
    if (this.t.addOns.includes(userId)) throw new RoomError('You already took the add-on');
    this.queueRequest(userId, 'addOn', this.cfg.addOn.chips);
  }

  private queueRequest(userId: string, kind: 'rebuy' | 'addOn', amount: number) {
    if (this.requests.some((r) => r.userId === userId)) throw new RoomError('You already have a pending request');
    const sp = this.seatOf(userId)!;
    const req = { id: randomUUID(), userId, username: sp.username, kind, amount, seat: sp.seat, entry: 'waitForBB' as const };
    this.requests.push(req);
    if (this.config.autoApprove || userId === this.hostId) this.approve(this.hostId, req.id);
    else this.system(`${sp.username} requests ${kind === 'rebuy' ? 'a rebuy' : 'the add-on'}`);
    this.queueBroadcast();
  }

  // -------------------------------------------------------------------------
  // Seat behaviour
  // -------------------------------------------------------------------------

  override leaveSeat(userId: string) {
    const sp = this.seatOf(userId);
    if (!sp) throw new RoomError('You are not registered');
    if (sp.status === 'pending' || this.status === 'OPEN') {
      // Unregister before the start: nothing was recorded in the ledger yet.
      this.requests = this.requests.filter((r) => r.userId !== userId);
      this.seats[sp.seat] = null;
      this.t.entrants = this.t.entrants.filter((u) => u !== userId);
      if (sp.status !== 'pending') this.system(`${sp.username} unregistered`);
      this.queueBroadcast();
      return;
    }
    // After the start you stay in the tournament but are folded every hand.
    sp.status = 'sittingOut';
    this.system(`${sp.username} is away and will be blinded`);
    this.afterChange();
  }

  override sitIn(userId: string) {
    const sp = this.requireSeat(userId);
    sp.sitOutNext = false;
    sp.consecutiveTimeouts = 0;
    if (sp.status === 'sittingOut') sp.status = 'active';
    this.queueBroadcast();
  }

  override sitOut(userId: string) {
    const sp = this.requireSeat(userId);
    if (sp.status !== 'busted') sp.status = 'sittingOut';
    this.afterChange();
  }

  /** Away players are still dealt in (and pay blinds) but fold instantly. */
  protected override candidates() {
    return this.seats
      .filter((sp): sp is NonNullable<typeof sp> => !!sp && sp.stack > 0 && sp.status !== 'pending' && sp.status !== 'busted')
      .map((sp) => ({ seat: sp.seat, id: sp.userId, entry: 'active' as const }));
  }

  protected override shouldActInstantly(seat: number): boolean {
    return super.shouldActInstantly(seat) || this.seats[seat]?.status === 'sittingOut';
  }

  protected override onRepeatedTimeouts(sp: SeatPlayer) {
    if (sp.status !== 'sittingOut') {
      sp.status = 'sittingOut';
      this.system(`${sp.username} timed out and is now away`);
    }
  }

  /** Kicked players are eliminated. */
  protected override removeFromSeat(sp: SeatPlayer) {
    this.seats[sp.seat] = null;
    this.requests = this.requests.filter((r) => r.userId !== sp.userId);
    if (!this.t.standings && this.status !== 'OPEN' && !this.t.eliminations.some((e) => e.userId === sp.userId) && this.t.entrants.includes(sp.userId)) {
      this.t.eliminations.push({ userId: sp.userId, handNo: this.handNo, startStack: sp.stack });
      this.system(`${sp.username} is out of the tournament`);
    }
    if (!this.isConnected(sp.userId)) this.members.delete(sp.userId);
  }

  // -------------------------------------------------------------------------
  // Blinds and the level clock
  // -------------------------------------------------------------------------

  protected override blinds() {
    const lv = this.cfg.levels[Math.min(this.t.level, this.cfg.levels.length - 1)];
    return { smallBlind: lv.sb, bigBlind: lv.bb, ante: lv.ante };
  }

  override setBlinds(): never {
    throw new RoomError('Blinds follow the tournament schedule');
  }

  protected override canStartHands() {
    return super.canStartHands() && !this.t.standings;
  }

  override start(byUserId: string) {
    this.assertHost(byUserId);
    const registered = this.seats.filter((s) => s && s.status !== 'pending');
    if (registered.length < 2) throw new RoomError('At least two players must register');
    super.start(byUserId);
  }

  protected override onStart() {
    for (const sp of this.seats) {
      if (!sp) continue;
      if (sp.status === 'pending') {
        this.requests = this.requests.filter((r) => r.userId !== sp.userId);
        this.seats[sp.seat] = null;
        continue;
      }
      this.recordEntry(sp.userId);
    }
    this.t.level = 0;
    this.startLevelClock(this.cfg.levelMinutes * 60_000);
    this.announceLevel();
  }

  protected override onPause() {
    if (this.t.levelEndsAt !== null) {
      this.t.levelRemainingMs = Math.max(0, this.t.levelEndsAt - this.deps.clock.now());
      this.t.levelEndsAt = null;
    }
    this.clearLevelTimer();
  }

  protected override onResume() {
    this.startLevelClock(this.t.levelRemainingMs ?? this.cfg.levelMinutes * 60_000);
  }

  private startLevelClock(ms: number) {
    this.clearLevelTimer();
    this.t.levelRemainingMs = null;
    this.t.levelEndsAt = this.deps.clock.now() + ms;
    this.levelTimer = this.deps.clock.setTimeout(() => this.nextLevel(), ms);
  }

  private clearLevelTimer() {
    if (this.levelTimer) this.deps.clock.clearTimeout(this.levelTimer);
    this.levelTimer = null;
  }

  private nextLevel() {
    this.levelTimer = null;
    if (this.t.level < this.cfg.levels.length - 1) this.t.level++;
    this.startLevelClock(this.cfg.levelMinutes * 60_000);
    this.announceLevel();
    if (this.levelNumber === this.cfg.lateRegLevels + 1) this.system('Late registration is closed');
    if (this.cfg.rebuy.enabled && this.levelNumber === this.cfg.rebuy.untilLevel + 1) {
      this.system(this.cfg.addOn.enabled ? 'Rebuys are closed. Add-on available this level' : 'Rebuys are closed');
      // Busted players who did not rebuy are now out.
      for (const sp of this.seats) {
        if (sp && sp.status === 'busted' && sp.stack === 0) this.removeFromSeat(sp);
      }
      if (this.isFinished()) {
        if (this.hand && this.hand.phase !== 'complete') this.endAfterHand = true;
        else {
          this.finishSession();
          return;
        }
      }
    }
    this.saveSnapshot();
    this.queueBroadcast();
  }

  private announceLevel() {
    const b = this.blinds();
    this.system(`Level ${this.levelNumber}: blinds ${b.smallBlind}/${b.bigBlind}${b.ante ? `, BB ante ${b.ante}` : ''} (from the next hand)`);
  }

  // -------------------------------------------------------------------------
  // Eliminations and the end of the tournament
  // -------------------------------------------------------------------------

  protected override afterHandSettled(hand: HandState) {
    const busted = hand.players.filter((p) => p.stack === 0);
    for (const p of busted) {
      const sp = this.seats[p.seat];
      if (!sp || sp.userId !== p.id) continue;
      if (sp.pendingChips > 0) continue; // an approved rebuy is waiting
      if (this.rebuyOpen()) {
        sp.status = 'busted';
        this.system(`${sp.username} is out of chips and may rebuy`);
      } else {
        this.t.eliminations.push({ userId: sp.userId, handNo: hand.config.handNo, startStack: p.startStack });
        this.seats[sp.seat] = null;
        this.system(`${sp.username} is eliminated`);
      }
    }
    // Inside onHandComplete: the base class ends the session once the hand is settled.
    if (this.isFinished()) this.endAfterHand = true;
  }

  /** Busted players in a tournament are handled in afterHandSettled. */
  protected override handleZeroStack() {}

  /** One player (or nobody) left who can still play. */
  private isFinished(): boolean {
    if (this.t.standings || this.status === 'OPEN') return false;
    const alive = this.seats.filter((s) => s && s.status !== 'pending' && (s.stack > 0 || s.pendingChips > 0 || s.status === 'busted'));
    return alive.length <= 1;
  }

  protected override finishSession() {
    if (!this.t.standings) {
      const remaining = this.seats
        .filter((s): s is NonNullable<typeof s> => !!s && s.status !== 'pending' && this.t.entrants.includes(s.userId))
        .map((s) => ({ userId: s.userId, stack: s.stack + s.pendingChips }));
      const standings = computeStandings(remaining, this.t.eliminations, this.t.prizePool, this.cfg.payouts);
      this.t.standings = standings;
      for (const s of standings) {
        if (s.prize > 0) this.addLedger(s.userId, 'PAYOUT', 0, s.prize);
      }
      const winner = standings.find((s) => s.place === 1);
      if (winner) this.system(`${this.usernames.get(winner.userId) ?? 'Winner'} wins the tournament!`);
    }
    this.clearLevelTimer();
    this.t.levelEndsAt = null;
    super.finishSession();
  }

  protected override results() {
    return {
      stats: this.statsView(),
      tournament: {
        entrants: this.t.entrants.length,
        prizePool: this.t.prizePool,
        standings: (this.t.standings ?? []).map((s) => ({ ...s, username: this.usernames.get(s.userId) ?? '?' })),
        rebuys: this.t.rebuys,
        addOns: this.t.addOns,
      },
    };
  }

  protected override tournamentView(userId: string): TableView['tournament'] {
    const payouts = this.cfg.payouts ?? defaultPayouts(this.t.entrants.length);
    return {
      level: this.levelNumber,
      levels: this.cfg.levels,
      levelEndsAt: this.t.levelEndsAt,
      levelRemainingMs: this.t.levelRemainingMs,
      lateRegOpen: this.lateRegOpen(),
      rebuyOpen: this.rebuyOpen(),
      addOnOpen: this.addOnOpen(),
      entrants: this.t.entrants.length,
      remaining: this.seats.filter((s) => s && s.status !== 'pending').length,
      prizePool: this.t.prizePool,
      payouts,
      standings: (this.t.standings ?? []).map((s) => ({ ...s, username: this.usernames.get(s.userId) ?? '?' })),
      finished: !!this.t.standings,
      myRebuys: this.t.rebuys[userId] ?? 0,
      myAddOn: this.t.addOns.includes(userId),
    };
  }

  protected override statsView() {
    const base = super.statsView();
    // In a tournament, "net" is the money result: prize minus what was paid in.
    const paid = new Map<string, number>();
    for (const l of this.ledger) {
      const sign = l.type === 'PAYOUT' ? 1 : -1;
      paid.set(l.userId, (paid.get(l.userId) ?? 0) + sign * l.amountMinor);
    }
    return {
      ...base,
      players: base.players.map((p) => ({ ...p, netMoney: this.isLedger() ? (paid.get(p.userId) ?? 0) : null })),
    };
  }

  protected override snapshotExtra() {
    return this.t;
  }

  override dispose() {
    super.dispose();
    this.clearLevelTimer();
  }
}
