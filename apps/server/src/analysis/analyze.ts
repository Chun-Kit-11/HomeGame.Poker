import { type Card, type HandEvent, type Street, HandCategory, categoryOf, positionLabels, scoreHand } from '@poker/engine';
import { CLASSES, CLASS_INDEX, COMBO_COUNT, classOf, combosOf } from './classes';
import data from './preflop-data.json';

/**
 * Post-hand decision analysis.
 *
 *  Tier A (every decision): pot odds, required equity, minimum defense
 *  frequency, Monte Carlo equity against estimated opponent ranges, and the
 *  immediate EV of calling. Exact maths given the assumed ranges.
 *  Tier B (preflop): an approximate open-raise chart when folded to you, and
 *  the heads-up push/fold Nash equilibrium for short-stacked blind-vs-blind spots.
 *
 * Opponent ranges are ESTIMATED from their actions; their actual hole cards are
 * never used (so analysis can't leak mucked hands). Only completed hands can be analysed.
 */

const RANKING: string[] = data.ranking.map((r) => r.hand);
const RANK_POS = new Map(RANKING.map((h, i) => [h, i]));
const PUSH_MAX = data.pushMax as Record<string, number>;
const CALL_MAX = data.callMax as Record<string, number>;

/** Approximate open-raise (raise first in) percentages at ~100bb. */
const RFI: Record<string, number> = { UTG: 13, 'UTG+1': 15, 'UTG+2': 17, MP: 19, LJ: 21, HJ: 26, CO: 32, BTN: 45, SB: 40 };

/** The top `pct`% of starting hands (by combos) in the ranking. */
export function topRange(pct: number, excludeTopPct = 0): Set<string> {
  const out = new Set<string>();
  let combos = 0;
  for (const h of RANKING) {
    const before = combos;
    combos += COMBO_COUNT(h);
    if ((before / 1326) * 100 < excludeTopPct) continue;
    if ((before / 1326) * 100 >= pct) break;
    out.add(h);
  }
  return out;
}

/** Percentile of a class in the ranking (0 = best). */
export function handPercentile(cls: string): number {
  let combos = 0;
  for (const h of RANKING) {
    if (h === cls) return (combos / 1326) * 100;
    combos += COMBO_COUNT(h);
  }
  return 100;
}

export interface OpponentRange {
  seat: number;
  label: string;
  pct: number;
  classes: Set<string>;
  /** Postflop aggression narrows the range to made hands and draws */
  aggressiveStreets: Street[];
}

export interface Decision {
  index: number;
  street: Street;
  board: Card[];
  heroCards: Card[];
  position: string;
  action: string;
  pot: number;
  toCall: number;
  heroStack: number;
  effectiveStack: number;
  bigBlind: number;
  /** Equity needed to call profitably (pot odds), 0-1 */
  requiredEquity: number | null;
  /** Minimum defense frequency against the bet faced, 0-1 */
  mdf: number | null;
  /** Hero's estimated equity, 0-1 */
  equity: number | null;
  /** Immediate EV of calling in chips (assumes no further betting) */
  evCall: number | null;
  opponents: { seat: number; username: string; range: string; pct: number }[];
  recommendation: { action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'shove'; text: string };
  tier: 'A' | 'B';
  source: string;
  matches: boolean;
  notes: string[];
}

export interface AnalysisInput {
  config: { buttonSeat: number; sbSeat: number | null; bbSeat: number; smallBlind: number; bigBlind: number; bigBlindAnte?: number };
  events: HandEvent[];
  heroSeat: number;
  heroCards: Card[];
  names: Record<number, string>;
  /** Monte Carlo samples per decision */
  samples?: number;
  /** Deterministic seed (tests) */
  seed?: number;
}

export class AnalysisError extends Error {}

export function analyzeHand(input: AnalysisInput): Decision[] {
  const { events, config, heroSeat, heroCards } = input;
  if (!events.some((e) => e.type === 'handEnd')) throw new AnalysisError('Only completed hands can be analysed');
  const start = events.find((e) => e.type === 'handStart');
  if (!start || start.type !== 'handStart') throw new AnalysisError('Malformed hand');
  if (!start.players.some((p) => p.seat === heroSeat)) throw new AnalysisError('You did not play this hand');

  let rngState = input.seed ?? 0x2545f491;
  const rnd = () => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return (rngState >>> 0) / 4294967296;
  };

  const seats = start.players.map((p) => p.seat);
  const labels = positionLabels(seats, config.buttonSeat, config.sbSeat, config.bbSeat);
  const bb = config.bigBlind;

  // Replay state
  const stacks = new Map(start.players.map((p) => [p.seat, p.stack]));
  const streetBet = new Map<number, number>(seats.map((s) => [s, 0]));
  const folded = new Set<number>();
  let pot = 0; // chips from completed streets + antes
  let street: Street = 'preflop';
  let board: Card[] = [];
  const preflop: { seat: number; action: string; raisesBefore: number; to: number }[] = [];
  let preflopRaises = 0;
  const aggression = new Map<number, Street[]>();

  const decisions: Decision[] = [];

  for (const e of events) {
    if (e.type === 'post') {
      stacks.set(e.seat, stacks.get(e.seat)! - e.amount);
      if (e.kind === 'ante') pot += e.amount;
      else streetBet.set(e.seat, streetBet.get(e.seat)! + e.amount);
    } else if (e.type === 'street' && e.run === 1) {
      for (const s of seats) pot += streetBet.get(s)!;
      for (const s of seats) streetBet.set(s, 0);
      street = e.street;
      board = e.board;
    } else if (e.type === 'uncalled') {
      stacks.set(e.seat, stacks.get(e.seat)! + e.amount);
      const b = streetBet.get(e.seat)!;
      const fromBet = Math.min(b, e.amount);
      streetBet.set(e.seat, b - fromBet);
      pot -= e.amount - fromBet;
    } else if (e.type === 'action') {
      if (e.seat === heroSeat) {
        decisions.push(
          buildDecision({
            index: decisions.length,
            e,
            street,
            board,
            heroCards,
            position: labels.get(heroSeat) ?? '',
            pot: pot + [...streetBet.values()].reduce((a, b) => a + b, 0),
            currentBet: Math.max(...streetBet.values()),
            heroBet: streetBet.get(heroSeat)!,
            heroStack: stacks.get(heroSeat)!,
            opponents: seats.filter((s) => s !== heroSeat && !folded.has(s)),
            stacks,
            bb,
            ranges: (s) => estimateRange(s, labels.get(s) ?? '', preflop, aggression.get(s) ?? []),
            preflopRaises,
            limpers: preflop.filter((x) => x.action === 'call' && x.raisesBefore === 0).length,
            names: input.names,
            rnd,
            samples: input.samples ?? 2500,
            labels,
          }),
        );
      }
      // Apply the action
      stacks.set(e.seat, stacks.get(e.seat)! - e.amount);
      if (e.action === 'fold') folded.add(e.seat);
      else streetBet.set(e.seat, e.to);
      if (e.street === 'preflop') {
        preflop.push({ seat: e.seat, action: e.action, raisesBefore: preflopRaises, to: e.to });
        if (e.action === 'raise' || e.action === 'bet') preflopRaises++;
      } else if (e.action === 'bet' || e.action === 'raise') {
        aggression.set(e.seat, [...(aggression.get(e.seat) ?? []), e.street]);
      }
    }
  }
  return decisions;
}

/** Guess an opponent's preflop range from what they did. */
function estimateRange(
  seat: number,
  position: string,
  preflop: { seat: number; action: string; raisesBefore: number; to: number }[],
  aggressiveStreets: Street[],
): OpponentRange {
  const mine = preflop.filter((a) => a.seat === seat);
  let pct = 100;
  let label = 'any two cards';
  let exclude = 0;
  const lastRaise = [...mine].reverse().find((a) => a.action === 'raise' || a.action === 'bet');
  if (lastRaise) {
    if (lastRaise.raisesBefore === 0) {
      pct = RFI[position] ?? 25;
      label = `open-raise from ${position || 'this seat'}`;
    } else if (lastRaise.raisesBefore === 1) {
      pct = 7;
      label = '3-bet range';
    } else {
      pct = 3;
      label = '4-bet+ range';
    }
  } else if (mine.some((a) => a.action === 'call')) {
    const call = mine.find((a) => a.action === 'call')!;
    if (call.raisesBefore === 0) {
      pct = 45;
      label = 'limping range';
    } else if (call.raisesBefore === 1) {
      pct = 25;
      exclude = 3;
      label = 'flat-call vs a raise';
    } else {
      pct = 10;
      exclude = 2;
      label = 'call vs a 3-bet';
    }
  } else if (mine.some((a) => a.action === 'check')) {
    pct = 100;
    label = 'big blind check (any hand)';
  }
  if (aggressiveStreets.length) label += `, then bet/raised on the ${aggressiveStreets.join(' & ')}`;
  return { seat, label, pct, classes: topRange(pct, exclude), aggressiveStreets };
}

interface BuildArgs {
  index: number;
  e: Extract<HandEvent, { type: 'action' }>;
  street: Street;
  board: Card[];
  heroCards: Card[];
  position: string;
  pot: number;
  currentBet: number;
  heroBet: number;
  heroStack: number;
  opponents: number[];
  stacks: Map<number, number>;
  bb: number;
  ranges: (seat: number) => OpponentRange;
  preflopRaises: number;
  /** Players who called the big blind without a raise before hero acted */
  limpers: number;
  names: Record<number, string>;
  rnd: () => number;
  samples: number;
  labels: Map<number, string>;
}

function buildDecision(a: BuildArgs): Decision {
  const toCall = Math.min(Math.max(0, a.currentBet - a.heroBet), a.heroStack);
  const effective = Math.min(a.heroStack + a.heroBet, Math.max(0, ...a.opponents.map((s) => a.stacks.get(s)!)));
  const requiredEquity = toCall > 0 ? toCall / (a.pot + toCall) : null;
  // Minimum defense frequency only makes sense against a real bet (not just the blinds)
  const facingRealBet = toCall > 0 && !(a.street === 'preflop' && a.preflopRaises === 0);
  const mdf = facingRealBet ? Math.max(0, (a.pot - toCall) / a.pot) : null;
  const ranges = a.opponents.map(a.ranges);
  const heroClass = classOf(a.heroCards[0], a.heroCards[1]);
  const pct = handPercentile(heroClass);
  const notes: string[] = [];
  const did = actionLabel(a.e);

  // Monte Carlo equity against the estimated ranges
  const equity = ranges.length ? monteCarlo(a.heroCards, a.board, ranges, a.samples, a.rnd) : 1;
  const evCall = toCall > 0 ? equity * (a.pot + toCall) - toCall : null;
  const n = ranges.length;

  let rec: Decision['recommendation'];
  let tier: 'A' | 'B' = 'A';
  let source = 'Equity vs estimated ranges and pot odds';

  const bbStack = effective / a.bb;
  const foldedToHero = a.street === 'preflop' && a.preflopRaises === 0 && a.limpers === 0;
  const headsUp = a.labels.size === 2;
  const isSB = (label: string | undefined) => label === 'SB' || (headsUp && label === 'BTN');
  const blindVsBlind = isSB(a.position) && n === 1 && a.labels.get(a.opponents[0]) === 'BB';
  const bbVsSbShove = a.position === 'BB' && n === 1 && isSB(a.labels.get(a.opponents[0])) && a.preflopRaises === 1 && a.stacks.get(a.opponents[0]) === 0;

  if (a.street === 'preflop' && blindVsBlind && foldedToHero && bbStack <= 25) {
    // Heads-up push/fold equilibrium
    tier = 'B';
    source = 'Heads-up push/fold Nash equilibrium (no ante)';
    const max = PUSH_MAX[heroClass] ?? 0;
    rec = max >= bbStack ? { action: 'shove', text: `Shove: ${heroClass} is in the equilibrium shoving range up to ${max}bb (you had ${round1(bbStack)}bb)` } : { action: 'fold', text: `Fold: ${heroClass} only shoves up to ${max}bb; you had ${round1(bbStack)}bb` };
  } else if (a.street === 'preflop' && bbVsSbShove && bbStack <= 25) {
    tier = 'B';
    source = 'Heads-up push/fold Nash equilibrium (no ante)';
    const max = CALL_MAX[heroClass] ?? 0;
    rec = max >= bbStack ? { action: 'call', text: `Call: ${heroClass} calls a shove up to ${max}bb (you had ${round1(bbStack)}bb)` } : { action: 'fold', text: `Fold: ${heroClass} only calls up to ${max}bb` };
  } else if (a.street === 'preflop' && foldedToHero && a.position !== 'BB') {
    tier = 'B';
    source = 'Approximate open-raising chart (~100bb)';
    const open = headsUp ? 80 : (RFI[a.position] ?? 25);
    if (bbStack <= 12) notes.push(`With ${round1(bbStack)}bb you are in shove-or-fold territory; the chart assumes deep stacks.`);
    rec = pct < open ? { action: 'raise', text: `Open-raise (about 2.2–2.5bb): ${heroClass} is in the top ${round1(pct)}% of hands and ${a.position} opens roughly ${open}%` } : { action: 'fold', text: `Fold: ${heroClass} (top ${round1(pct)}%) is outside the ~${open}% ${a.position} opening range` };
  } else if (toCall > 0) {
    const raiseLine = n === 1 ? 0.65 : 0.5;
    if (equity >= raiseLine && equity > requiredEquity! + 0.15) rec = { action: 'raise', text: `Raise for value: ${pct1(equity)} equity is well above the ${pct1(requiredEquity!)} needed` };
    else if (equity >= requiredEquity!) rec = { action: 'call', text: `Call: ${pct1(equity)} equity beats the ${pct1(requiredEquity!)} the price requires` };
    else rec = { action: 'fold', text: `Fold: you need ${pct1(requiredEquity!)} equity but have about ${pct1(equity)}` };
    if (a.street !== 'river' && rec.action === 'fold' && requiredEquity! - equity < 0.08) notes.push('Close: implied odds (future bets you can win) may justify a call with draws.');
  } else {
    const valueLine = n === 1 ? 0.62 : n === 2 ? 0.5 : 0.42;
    if (equity >= valueLine) rec = { action: 'bet', text: `Bet for value (about ½–⅔ pot): ${pct1(equity)} equity against ${n} opponent${n > 1 ? 's' : ''}` };
    else if (equity <= 0.3 && a.street !== 'river') rec = { action: 'check', text: `Check: ${pct1(equity)} equity. Bluff only with good draws or blockers` };
    else rec = { action: 'check', text: `Check / pot control: ${pct1(equity)} equity` };
  }

  if (n > 1) notes.push('Multiway pots have no true GTO solution: this is equity maths, not a solver.');
  if (a.street !== 'preflop' && ranges.some((r) => r.aggressiveStreets.length)) notes.push('Ranges of players who bet or raised after the flop were narrowed to pairs and draws (heuristic).');
  if (toCall > 0 && a.street !== 'river') notes.push('EV of calling assumes the hand is checked down; future betting changes it.');

  const matches = sameFamily(rec.action, a.e);
  return {
    index: a.index,
    street: a.street,
    board: [...a.board],
    heroCards: a.heroCards,
    position: a.position,
    action: did,
    pot: a.pot,
    toCall,
    heroStack: a.heroStack,
    effectiveStack: effective,
    bigBlind: a.bb,
    requiredEquity,
    mdf,
    equity: ranges.length ? equity : null,
    evCall,
    opponents: ranges.map((r) => ({ seat: r.seat, username: a.names[r.seat] ?? `Seat ${r.seat + 1}`, range: r.label, pct: r.pct })),
    recommendation: rec,
    tier,
    source,
    matches,
    notes,
  };
}

function actionLabel(e: Extract<HandEvent, { type: 'action' }>) {
  if (e.action === 'fold') return 'Fold';
  if (e.action === 'check') return 'Check';
  if (e.action === 'call') return `Call ${e.amount}`;
  return `${e.action === 'bet' ? 'Bet' : 'Raise to'} ${e.to}${e.allIn ? ' (all-in)' : ''}`;
}

function sameFamily(rec: Decision['recommendation']['action'], e: Extract<HandEvent, { type: 'action' }>) {
  const did = e.action === 'bet' || e.action === 'raise' ? 'aggressive' : e.action;
  const want = rec === 'bet' || rec === 'raise' || rec === 'shove' ? 'aggressive' : rec;
  if (rec === 'shove') return did === 'aggressive' && e.allIn;
  return did === want;
}

const pct1 = (x: number) => `${Math.round(x * 1000) / 10}%`;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Does this combo continue after betting on this board (pair or better using a hole card, or a strong draw)? */
function continues(combo: [Card, Card], board: Card[]): boolean {
  if (board.length < 3) return true;
  const boardRanks = new Set(board.map((c) => c >> 2));
  // A pocket pair, or a hole card pairing the board
  if (combo[0] >> 2 === combo[1] >> 2 || combo.some((c) => boardRanks.has(c >> 2))) return true;
  // Straights/flushes already made
  if (categoryOf(scoreHand([...combo, ...board])) >= HandCategory.Straight) return true;
  const all = [...combo, ...board];
  for (let s = 0; s < 4; s++) if (all.filter((c) => (c & 3) === s).length >= 4 && combo.some((c) => (c & 3) === s)) return true;
  const ranks = new Set(all.map((c) => c >> 2));
  for (let lo = 0; lo <= 9; lo++) {
    let run = 0;
    for (let r = lo; r < lo + 4; r++) if (ranks.has(r)) run++;
    if (run === 4 && combo.some((c) => (c >> 2) >= lo && (c >> 2) < lo + 4)) return true;
  }
  return false;
}

/** Hero's share of the pot at showdown against sampled opponent hands from their ranges. */
function monteCarlo(hero: Card[], board: Card[], ranges: OpponentRange[], samples: number, rnd: () => number): number {
  const dead = new Set([...hero, ...board]);
  const pools = ranges.map((r) => {
    let combos: [Card, Card][] = [];
    for (const cls of r.classes) for (const c of combosOf(cls)) if (!dead.has(c[0]) && !dead.has(c[1])) combos.push(c);
    if (r.aggressiveStreets.length && board.length >= 3) {
      const narrowed = combos.filter((c) => continues(c, board));
      if (narrowed.length >= 6) combos = narrowed;
    }
    if (combos.length === 0) {
      for (const cls of CLASSES) for (const c of combosOf(cls)) if (!dead.has(c[0]) && !dead.has(c[1])) combos.push(c);
    }
    return combos;
  });
  let share = 0;
  let done = 0;
  const used = new Uint8Array(52);
  for (let s = 0; s < samples * 3 && done < samples; s++) {
    used.fill(0);
    for (const c of dead) used[c] = 1;
    const opp: [Card, Card][] = [];
    let ok = true;
    for (const pool of pools) {
      let pick: [Card, Card] | null = null;
      for (let t = 0; t < 30; t++) {
        const c = pool[Math.floor(rnd() * pool.length)];
        if (!used[c[0]] && !used[c[1]]) {
          pick = c;
          break;
        }
      }
      if (!pick) {
        ok = false;
        break;
      }
      used[pick[0]] = used[pick[1]] = 1;
      opp.push(pick);
    }
    if (!ok) continue;
    const b = [...board];
    while (b.length < 5) {
      const c = Math.floor(rnd() * 52);
      if (!used[c]) {
        used[c] = 1;
        b.push(c);
      }
    }
    const mine = scoreHand([...hero, ...b]);
    let best = mine;
    let ties = 1;
    let beaten = false;
    for (const o of opp) {
      const sc = scoreHand([...o, ...b]);
      if (sc > best) {
        beaten = true;
        break;
      }
      if (sc === best) ties++;
    }
    share += beaten ? 0 : 1 / ties;
    done++;
  }
  return done ? share / done : 0;
}

export const _internals = { continues, monteCarlo, CLASS_INDEX, RANKING };
