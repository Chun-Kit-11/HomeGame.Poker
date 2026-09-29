'use client';
import { useState } from 'react';
import { PlayingCard } from '@/components/table/Card';
import { api } from '@/lib/api';
import { chips, signed } from '@/lib/format';
import type { HandDetail } from '@/lib/handTypes';

interface Decision {
  index: number;
  street: string;
  board: number[];
  heroCards: number[];
  position: string;
  action: string;
  pot: number;
  toCall: number;
  effectiveStack: number;
  bigBlind: number;
  requiredEquity: number | null;
  mdf: number | null;
  equity: number | null;
  evCall: number | null;
  opponents: { seat: number; username: string; range: string; pct: number }[];
  recommendation: { action: string; text: string };
  tier: 'A' | 'B';
  source: string;
  matches: boolean;
  notes: string[];
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 1000) / 10}%`);

/** Post-hand review of the viewer's own decisions (only available once the hand is over). */
export function HandAnalysis({ hand }: { hand: HandDetail }) {
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (hand.mySeat === null) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ decisions: Decision[] }>(`/hands/${hand.id}/analysis`);
      setDecisions(r.decisions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-panel space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Review my decisions</h2>
          <p className="text-sm text-white/50">Pot odds, equity against likely ranges, and preflop charts, for each of your actions.</p>
        </div>
        {!decisions && (
          <button className="btn-primary shrink-0" disabled={busy} onClick={run}>
            {busy ? 'Analysing…' : 'Analyse'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {decisions?.length === 0 && <p className="text-sm text-white/50">You didn&apos;t make any decisions in this hand.</p>}
      {decisions?.map((d) => (
        <article key={d.index} className="space-y-3 rounded-2xl bg-black/25 p-4 ring-1 ring-inset ring-white/[0.06]">
          <header className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">{d.street}</span>
            <span className="text-xs text-white/50">{d.position}</span>
            <span className="flex gap-0.5">
              {d.heroCards.map((c, i) => (
                <PlayingCard key={i} card={c} size="xs" />
              ))}
            </span>
            {d.board.length > 0 && (
              <span className="flex gap-0.5 opacity-80">
                {d.board.map((c, i) => (
                  <PlayingCard key={i} card={c} size="xs" />
                ))}
              </span>
            )}
            <span className="ml-auto text-sm">
              You: <b>{d.action}</b>
            </span>
          </header>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Pot" value={chips(d.pot)} />
            <Metric label="To call" value={d.toCall ? chips(d.toCall) : '—'} />
            <Metric label="Equity needed" value={pct(d.requiredEquity)} />
            <Metric label="Your equity" value={pct(d.equity)} highlight={d.equity !== null && d.requiredEquity !== null ? (d.equity >= d.requiredEquity ? 'up' : 'down') : undefined} />
            {d.mdf !== null && <Metric label="Min. defense" value={pct(d.mdf)} />}
            {d.evCall !== null && <Metric label="EV of calling" value={signed(Math.round(d.evCall) || 0)} highlight={d.evCall >= 0 ? 'up' : 'down'} />}
            <Metric label="Effective stack" value={`${Math.round((d.effectiveStack / d.bigBlind) * 10) / 10} bb`} />
          </div>

          <div className={`rounded-xl p-3 text-sm ring-1 ring-inset ${d.matches ? 'bg-emerald-400/10 ring-emerald-400/25' : 'bg-amber-400/10 ring-amber-400/25'}`}>
            <div className="mb-0.5 flex items-center gap-2 text-xs">
              <span className={`font-bold ${d.matches ? 'text-emerald-300' : 'text-amber-300'}`}>{d.matches ? '✓ Matches the guidance' : '≠ Different from the guidance'}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">{d.tier === 'B' ? 'Chart / equilibrium' : 'Equity maths'}</span>
            </div>
            <div>{d.recommendation.text}</div>
            <div className="mt-1 text-[11px] text-white/45">{d.source}</div>
          </div>

          {d.opponents.length > 0 && (
            <div className="text-xs text-white/55">
              Assumed ranges:{' '}
              {d.opponents.map((o, i) => (
                <span key={o.seat}>
                  {i > 0 && '; '}
                  <b className="text-white/75">{o.username}</b> ~{o.pct}% ({o.range})
                </span>
              ))}
            </div>
          )}
          {d.notes.map((n, i) => (
            <p key={i} className="text-xs text-white/40">
              • {n}
            </p>
          ))}
        </article>
      ))}
      {decisions && (
        <p className="text-[11px] leading-relaxed text-white/35">
          How to read this: equity is simulated against ranges estimated from each opponent&apos;s actions, never their real cards. Preflop advice uses an
          approximate opening chart and, for short-stacked blind-vs-blind spots, a heads-up push/fold equilibrium we computed. Multiway spots have no exact GTO
          solution. Treat this as a study aid, not the final word.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: 'up' | 'down' }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`font-display font-bold tabular ${highlight === 'up' ? 'text-emerald-300' : highlight === 'down' ? 'text-red-300' : ''}`}>{value}</div>
    </div>
  );
}
