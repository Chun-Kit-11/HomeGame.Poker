'use client';
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { HandAnalysis } from '@/components/history/HandAnalysis';
import { HandHistoryView, type HistoryDisplay } from '@/components/history/HandHistoryView';
import { HistoryToolbar } from '@/components/history/HistoryToolbar';
import { PlayingCard } from '@/components/table/Card';
import { api } from '@/lib/api';
import { chips, signed } from '@/lib/format';
import type { HandDetail } from '@/lib/handTypes';
import { replay } from '@/lib/replay';
import { useMe } from '@/lib/useMe';
import { Loading, PageHeader } from '@/components/ui/PageHeader';
import { Shield } from '@/components/ui/Icons';

export default function HandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const [hand, setHand] = useState<HandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [display, setDisplay] = useState<HistoryDisplay>({ bb: false, anonymous: false });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api<HandDetail>(`/hands/${id}`)
      .then((h) => {
        setHand(h);
        setStep(Number.MAX_SAFE_INTEGER);
      })
      .catch((e) => setError(e.message));
  }, [me, id]);

  const names = useMemo(() => Object.fromEntries((hand?.players ?? []).map((p) => [p.seat, p.username])), [hand]);
  const frames = useMemo(() => (hand ? replay(hand.events, names) : []), [hand, names]);

  if (error) return <main className="p-6 text-center text-red-400">{error}</main>;
  if (!hand || !me) return <Loading />;
  const i = Math.min(step, frames.length - 1);
  const f = frames[i];

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-5">
      <PageHeader
        back="/history"
        title={`Hand #${hand.handNo}`}
        subtitle={`${hand.room.name} · ${new Date(hand.endedAt).toLocaleString()} · ${hand.smallBlind}/${hand.bigBlind}${hand.ante > 0 ? ` · ante ${hand.ante}` : ''}`}
        actions={
          <Link href={`/verify?hand=${hand.id}`} className="btn-secondary">
            <Shield className="h-4 w-4" /> Verify
          </Link>
        }
      />

      <section className="-mx-4 overflow-hidden bg-[#0c0c0b] sm:mx-0 sm:rounded-2xl sm:ring-1 sm:ring-white/[0.08]">
        <HandHistoryView hand={hand} display={display} />
        <div className="border-t border-white/[0.06] py-3">
          <HistoryToolbar hand={hand} display={display} setDisplay={setDisplay} onMessage={setMessage} />
          {message && <p className="mt-2 text-center text-xs text-white/60">{message}</p>}
        </div>
      </section>

      {/* Step-by-step replayer */}
      <details className="card-panel">
        <summary className="cursor-pointer font-bold">Step-by-step replay</summary>
      <section className="mt-3 space-y-3">
        <div className="flex min-h-[64px] items-center justify-center gap-1.5">
          {f.board.length === 0 && <span className="text-sm text-white/40">No board yet</span>}
          {f.board.map((c, k) => (
            <PlayingCard key={k} card={c} size="md" />
          ))}
        </div>
        {f.board2 && (
          <div className="flex justify-center gap-1">
            {f.board2.map((c, k) => (
              <PlayingCard key={k} card={c} size="sm" />
            ))}
          </div>
        )}
        <div className="text-center text-sm font-semibold tabular text-gold">Pot {chips(f.pot + Object.values(f.bets).reduce((a, b) => a + b, 0))}</div>
        <ul className="divide-y divide-white/5 text-sm">
          {hand.players.map((p) => {
            const cards = f.shown[p.seat] ?? (p.seat === hand.mySeat ? p.holeCards : null);
            return (
              <li key={p.seat} className={`flex items-center gap-2 py-1.5 ${f.folded.has(p.seat) ? 'opacity-40' : ''} ${f.actor === p.seat ? 'bg-emerald-500/10' : ''}`}>
                <span className="w-12 text-xs text-white/50">{p.position}</span>
                <span className="w-24 truncate font-semibold">{p.username}</span>
                <span className="flex w-16 gap-0.5">
                  {cards ? cards.map((c, k) => <PlayingCard key={k} card={c} size="xs" />) : <span className="text-xs text-white/30">— —</span>}
                </span>
                <span className="flex-1 truncate text-xs text-white/60">{f.lastAction[p.seat] ?? ''}</span>
                {f.bets[p.seat] ? <span className="text-xs text-amber-300">{chips(f.bets[p.seat])}</span> : null}
                <span className="w-16 text-right font-mono text-xs">{chips(f.stacks[p.seat] ?? p.startStack)}</span>
              </li>
            );
          })}
        </ul>
        <p className="min-h-[2.5rem] rounded-xl bg-black/30 px-3 py-2 text-center text-sm">{f.label}</p>
        <div className="flex items-center justify-center gap-2">
          <button className="btn-secondary px-3" onClick={() => setStep(0)}>
            ⏮
          </button>
          <button className="btn-secondary px-3" onClick={() => setStep(Math.max(0, i - 1))}>
            ◀
          </button>
          <span className="w-16 text-center text-xs text-white/50">
            {i + 1}/{frames.length}
          </span>
          <button className="btn-secondary px-3" onClick={() => setStep(Math.min(frames.length - 1, i + 1))}>
            ▶
          </button>
          <button className="btn-secondary px-3" onClick={() => setStep(frames.length - 1)}>
            ⏭
          </button>
        </div>
      </section>
      </details>

      {/* Full log */}
      <details className="card-panel">
        <summary className="cursor-pointer font-bold">Action log</summary>
        <ol className="mt-2 space-y-0.5 text-sm">
          {frames.map((fr, k) => (
            <li key={k}>
              <button className={`text-left ${k === i ? 'text-emerald-300' : 'text-white/70'}`} onClick={() => setStep(k)}>
                {fr.label}
              </button>
            </li>
          ))}
        </ol>
      </details>

      <HandAnalysis hand={hand} />

      <section className="card-panel space-y-1 break-all text-xs text-white/60">
        <h2 className="text-sm font-bold text-white">Fairness</h2>
        <div>Commitment (published before the hand): {hand.fair.serverSeedHash || '—'}</div>
        <div>Server seed (revealed after): {hand.fair.serverSeed || '—'}</div>
        <div>Hand ID: {hand.fair.handId}</div>
        <div>Player seeds: {hand.fair.clientSeeds.map((s) => `${s.username || `seat ${s.seat + 1}`}: ${s.seed || '(none sent)'}`).join(', ')}</div>
      </section>
    </main>
  );
}
