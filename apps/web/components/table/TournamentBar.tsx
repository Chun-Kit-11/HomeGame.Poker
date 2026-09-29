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
    <div className="mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-black/40 px-3 py-1.5 text-xs">
      <div>
        <span className="text-white/50">Level </span>
        <b>{t.level}</b>
        <span className="ml-2 font-bold text-amber-300">
          {chips(cur.sb)}/{chips(cur.bb)}
          {cur.ante > 0 && ` (${chips(cur.ante)})`}
        </span>
      </div>
      <div className="font-mono text-sm font-bold">
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
  return <span className="rounded bg-emerald-600/40 px-1.5 py-0.5 text-[10px]">{children}</span>;
}

/** Final standings shown when the tournament is over. */
export function Standings({ view, onClose }: { view: TableView; onClose: () => void }) {
  const t = view.tournament!;
  const ledger = view.room.moneyMode === 'LEDGER';
  const currency = view.room.config.ledger?.currency ?? '';
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-[#13201b] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-center text-2xl font-bold">🏆 Final standings</h2>
        <p className="mb-4 text-center text-xs text-white/50">
          {t.entrants} players{ledger && ` · prize pool ${money(t.prizePool, currency)}`}
        </p>
        <ol className="space-y-1">
          {t.standings.map((s) => (
            <li key={s.userId} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${s.place === 1 ? 'bg-amber-500/20' : 'bg-white/5'}`}>
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
