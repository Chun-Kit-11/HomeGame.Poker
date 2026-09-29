'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loading, PageHeader, Stat } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { chips } from '@/lib/format';
import { useMe } from '@/lib/useMe';

interface Stats {
  hands: number;
  vpip: number | null;
  pfr: number | null;
  threeBet: number | null;
  wtsd: number | null;
  wsd: number | null;
  handsWon: number | null;
  cashHands: number;
  bbPer100: number | null;
  biggestPotWon: number;
  positions: { position: string; hands: number; vpip: number | null; bbPer100: number | null }[];
}

const p = (x: number | null) => (x === null ? '—' : `${x}%`);

export default function StatsPage() {
  const me = useMe();
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    if (me) api<Stats>('/stats').then(setS);
  }, [me]);
  if (!me || !s) return <Loading />;
  const maxAbs = Math.max(1, ...s.positions.map((x) => Math.abs(x.bbPer100 ?? 0)));

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-5">
      <PageHeader back="/" title="My stats" subtitle={`${chips(s.hands)} hand${s.hands === 1 ? '' : 's'} played`} actions={<Link href="/history" className="btn-secondary">History</Link>} />
      {s.hands === 0 ? (
        <p className="card-panel text-center text-white/50">Play some hands to see your stats.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="VPIP" value={p(s.vpip)} />
            <Stat label="PFR" value={p(s.pfr)} />
            <Stat label="3-bet" value={p(s.threeBet)} />
            <Stat label="Hands won" value={p(s.handsWon)} />
            <Stat label="Went to showdown" value={p(s.wtsd)} />
            <Stat label="Won at showdown" value={p(s.wsd)} />
            <Stat label="Cash win rate" value={s.bbPer100 === null ? '—' : `${s.bbPer100 > 0 ? '+' : ''}${s.bbPer100} bb/100`} tone={s.bbPer100 === null ? undefined : s.bbPer100 >= 0 ? 'up' : 'down'} />
            <Stat label="Biggest pot won" value={chips(s.biggestPotWon)} />
          </section>

          <section className="card-panel">
            <h2 className="mb-3 text-lg font-bold">By position</h2>
            <div className="space-y-2">
              {s.positions.map((x) => (
                <div key={x.position} className="grid grid-cols-[52px_1fr_80px] items-center gap-3 text-sm">
                  <span className="font-semibold">{x.position}</span>
                  <div className="relative h-6 rounded-md bg-white/[0.04]">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                    {x.bbPer100 !== null && (
                      <div
                        className={`absolute inset-y-1 rounded ${x.bbPer100 >= 0 ? 'left-1/2 bg-emerald-400/70' : 'right-1/2 bg-red-400/70'}`}
                        style={{ width: `${(Math.abs(x.bbPer100) / maxAbs) * 50}%` }}
                      />
                    )}
                  </div>
                  <span className="text-right text-xs tabular text-white/60">
                    {x.hands} hand{x.hands === 1 ? '' : 's'} · VPIP {p(x.vpip)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-white/40">Bars show big blinds won per 100 hands from each position. VPIP: how often you put money in voluntarily; PFR: how often you raised preflop.</p>
          </section>

          <section className="card-panel text-sm text-white/60">
            <h2 className="mb-2 text-base font-bold text-white">Typical ranges</h2>
            A solid full-ring game is roughly VPIP 18–25% with PFR close behind. A big gap between the two means you call more than you raise. Open any hand in{' '}
            <Link href="/history" className="font-semibold text-gold hover:underline">
              history
            </Link>{' '}
            and tap <b>Analyse</b> to review your decisions.
          </section>
        </>
      )}
    </main>
  );
}
