'use client';
import Link from 'next/link';
import type { TableView } from '@poker/shared';
import { chips, money } from '@/lib/format';
import { useCountdown } from './TimerRing';

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Level, blinds, countdown and next-level preview. */
export function TournamentBar({ view, skew }: { view: TableView; skew: number }) {
  const t = view.tournament!;
  const secs = useCountdown(t.levelEndsAt, skew);
  const cur = t.levels[Math.min(t.level - 1, t.levels.length - 1)];
  const next = t.levels[t.level] ?? null;
  const remaining = t.levelEndsAt !== null ? (secs ?? 0) * 1000 : t.levelRemainingMs;
  const ledger = view.room.moneyMode === 'LEDGER';
  const currency = view.room.config.ledger?.currency ?? '';
  return (
    <div className="mx-3 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-black/35 px-3 py-2 text-xs ring-1 ring-inset ring-white/[0.07] backdrop-blur">
      <div>
        <span className="eyebrow">Level</span> <b className="font-display text-sm">{t.level}</b>
        <span className="ml-2 font-bold tabular text-gold">
          {chips(cur.sb)}/{chips(cur.bb)}
          {cur.ante > 0 && ` (${chips(cur.ante)})`}
        </span>
      </div>
      <div className="rounded-lg bg-white/[0.06] px-2 py-0.5 font-mono text-sm font-bold tabular">
        {view.room.status === 'OPEN' ? '—' : remaining !== null ? fmt(remaining) : '—'}
        {t.levelEndsAt === null && view.room.status !== 'OPEN' && !t.finished && <span className="ml-1 text-white/50">paused</span>}
      </div>
      {next && (
        <div className="text-white/60">
          Next: {chips(next.sb)}/{chips(next.bb)}
          {next.ante > 0 && ` (${chips(next.ante)})`}
        </div>
      )}
      <div className="text-white/60">
        {t.remaining}/{t.entrants} left
      </div>
      {ledger && (
        <div className="text-white/60">
          Pool {money(t.prizePool, currency)}
        </div>
      )}
      <div className="flex gap-1">
        {t.lateRegOpen && view.room.status !== 'OPEN' && <Badge>Late reg</Badge>}
        {t.rebuyOpen && <Badge>Rebuys</Badge>}
        {t.addOnOpen && <Badge>Add-on</Badge>}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/25">{children}</span>;
}

/** Final standings shown when the tournament is over. */
export function Standings({ view, onClose }: { view: TableView; onClose: () => void }) {
  const t = view.tournament!;
  const ledger = view.room.moneyMode === 'LEDGER';
  const currency = view.room.config.ledger?.currency ?? '';
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="slide-up w-full max-w-sm rounded-3xl bg-[#0f1514] p-6 shadow-2xl ring-1 ring-gold/25" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-center text-2xl font-bold">🏆 Final standings</h2>
        <p className="mb-4 text-center text-xs text-white/50">
          {t.entrants} players{ledger && ` · prize pool ${money(t.prizePool, currency)}`}
        </p>
        <ol className="space-y-1">
          {t.standings.map((s) => (
            <li key={s.userId} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset ${s.place === 1 ? 'bg-gold/15 ring-gold/40' : 'bg-white/[0.04] ring-white/[0.06]'}`}>
              <span className="w-8 text-lg">{medal[s.place - 1] ?? `${s.place}.`}</span>
              <span className="flex-1 font-semibold">{s.username}</span>
              {ledger ? <span className="font-bold text-emerald-300">{s.prize > 0 ? money(s.prize, currency) : '—'}</span> : null}
            </li>
          ))}
        </ol>
        {!ledger && (
          <p className="mt-3 text-center text-xs text-white/40">Payout split: {t.payouts.map((p, i) => `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} ${p}%`).join(', ')}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>
            Close
          </button>
          <Link className="btn-primary flex-1" href={`/sessions/${view.room.code}`}>
            Session results
          </Link>
        </div>
      </div>
    </div>
  );
}
