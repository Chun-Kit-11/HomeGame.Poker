import type { HandEvent, HandState } from './types';

export interface HandPlayerStats {
  seat: number;
  /** Voluntarily put chips in preflop (call/bet/raise, not just blinds) */
  vpip: boolean;
  /** Raised preflop */
  pfr: boolean;
  /** Re-raised preflop (raise when a raise already happened) */
  threeBet: boolean;
  sawFlop: boolean;
  sawShowdown: boolean;
  wonShowdown: boolean;
  wonHand: boolean;
  /** Chips won from pots */
  won: number;
}

/** Per-player statistics for a completed hand, derived from its event log. */
export function handStats(s: HandState): HandPlayerStats[] {
  const out = new Map<number, HandPlayerStats>(
    s.players.map((p) => [
      p.seat,
      { seat: p.seat, vpip: false, pfr: false, threeBet: false, sawFlop: false, sawShowdown: false, wonShowdown: false, wonHand: false, won: 0 },
    ]),
  );
  let preflopRaises = 0;
  const foldedBeforeFlop = new Set<number>();
  let flopDealt = false;
  for (const e of s.events) {
    if (e.type === 'street' && e.street === 'flop') flopDealt = true;
    if (e.type === 'action' && e.street === 'preflop') {
      const st = out.get(e.seat)!;
      if (e.action === 'call' || e.action === 'raise' || e.action === 'bet') st.vpip = true;
      if (e.action === 'raise') {
        st.pfr = true;
        if (preflopRaises >= 1) st.threeBet = true;
        preflopRaises++;
      }
      if (e.action === 'fold') foldedBeforeFlop.add(e.seat);
    }
    if (e.type === 'pot') for (const w of e.winners) out.get(w.seat)!.won += w.amount;
  }
  const live = s.players.filter((p) => !p.folded);
  const showdown = live.length > 1;
  for (const p of s.players) {
    const st = out.get(p.seat)!;
    st.sawFlop = flopDealt && !foldedBeforeFlop.has(p.seat);
    st.sawShowdown = showdown && !p.folded;
    st.wonHand = st.won > 0;
    st.wonShowdown = st.sawShowdown && st.won > 0;
  }
  return [...out.values()];
}

export interface PreflopFlags {
  vpip: boolean;
  pfr: boolean;
  /** Faced exactly one raise preflop with the chance to re-raise */
  threeBetOpp: boolean;
  threeBet: boolean;
  /** Folded to in the cutoff, button or small blind */
  stealOpp: boolean;
  steal: boolean;
}

/** Preflop tendencies of one seat in one hand, from its event log (used for player profiles). */
export function preflopFlags(events: readonly HandEvent[], seat: number, position: string): PreflopFlags {
  const f: PreflopFlags = { vpip: false, pfr: false, threeBetOpp: false, threeBet: false, stealOpp: false, steal: false };
  let raises = 0;
  let voluntary = 0; // calls or raises before this seat's first action
  let first = true;
  for (const e of events) {
    if (e.type !== 'action' || e.street !== 'preflop') continue;
    if (e.seat === seat) {
      if (first) {
        if (voluntary === 0 && ['CO', 'BTN', 'SB'].includes(position)) {
          f.stealOpp = true;
          f.steal = e.action === 'raise';
        }
        first = false;
      }
      if (raises === 1 && !f.threeBetOpp) {
        f.threeBetOpp = true;
        f.threeBet = e.action === 'raise';
      }
      if (e.action === 'call' || e.action === 'raise') f.vpip = true;
      if (e.action === 'raise') f.pfr = true;
    } else if (first && (e.action === 'call' || e.action === 'raise')) {
      voluntary++;
    }
    if (e.action === 'raise') raises++;
  }
  return f;
}
