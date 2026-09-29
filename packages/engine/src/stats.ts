import type { HandState } from './types';

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
