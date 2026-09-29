'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import type { RoomConfig } from '@poker/shared';
import { api } from '@/lib/api';
import { chips, money, signed } from '@/lib/format';
import { useMe } from '@/lib/useMe';
import { Loading, PageHeader } from '@/components/ui/PageHeader';
import { Download } from '@/components/ui/Icons';

interface Detail {
  room: { code: string; name: string; host: string; gameMode: 'CASH' | 'TOURNAMENT'; moneyMode: 'PLAY' | 'LEDGER'; status: string; createdAt: string; endedAt: string | null; config: RoomConfig };
  entries: { id: string; username: string; type: string; chips: number; amountMinor: number; createdAt: string }[];
  stats: { handsPlayed: number; biggestPot: number; players: { userId: string; username: string; buyIn: number; cashOut: number; net: number; handsPlayed: number }[] } | null;
  tournament: { entrants: number; prizePool: number; standings: { place: number; username: string; prize: number }[] } | null;
  ledger: {
    currency: string;
    balances: { userId: string; username: string; paidIn: number; paidOut: number; net: number }[];
    transfers: { from: string; to: string; amount: number }[];
    discrepancies: { message: string }[];
    rounded: boolean;
  } | null;
}

const TYPE_LABEL: Record<string, string> = {
  BUY_IN: 'Buy-in',
  REBUY: 'Rebuy',
  TOP_UP: 'Top-up',
  CASH_OUT: 'Cash-out',
  ENTRY: 'Entry',
  ADDON: 'Add-on',
  PAYOUT: 'Prize',
};

export default function SessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const me = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (me) api<Detail>(`/sessions/${code}`).then(setD).catch((e) => setError(e.message));
  }, [me, code]);

  if (error) return <main className="p-6 text-center text-red-400">{error}</main>;
  if (!d || !me) return <Loading />;
  const cur = d.ledger?.currency ?? '';
  const name = new Map(d.ledger?.balances.map((b) => [b.userId, b.username]) ?? []);
  const ended = d.room.status === 'ENDED';
  const sum = d.ledger?.balances.reduce((t, b) => t + b.net, 0) ?? 0;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16 pt-5">
      <PageHeader
        back="/sessions"
        title={d.room.name}
        subtitle={`${d.room.code} · ${d.room.gameMode === 'CASH' ? 'Cash game' : 'Tournament'} · host ${d.room.host} · ${new Date(d.room.createdAt).toLocaleDateString()}`}
        actions={
          <a className="btn-secondary" href={`/api/sessions/${d.room.code}/export.csv`}>
            <Download className="h-4 w-4" /> CSV
          </a>
        }
      />

      {!ended && (
        <div className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-inset ring-amber-400/20">
          This session is still in progress; figures are provisional until the host ends it.{' '}
          <Link className="underline" href={`/room/${d.room.code}`}>
            Back to the table
          </Link>
        </div>
      )}

      {d.ledger && (
        <section className="card-panel space-y-3">
          <h2 className="font-bold">Results ({cur})</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th className="text-left font-normal">Player</th>
                <th className="text-right font-normal">Paid in</th>
                <th className="text-right font-normal">Received</th>
                <th className="text-right font-normal">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...d.ledger.balances].sort((a, b) => b.net - a.net).map((b) => (
                <tr key={b.userId} className="border-t border-white/5">
                  <td className="py-1.5">{b.username}</td>
                  <td className="text-right">{money(b.paidIn)}</td>
                  <td className="text-right">{money(b.paidOut)}</td>
                  <td className={`text-right font-bold ${b.net > 0 ? 'text-emerald-400' : b.net < 0 ? 'text-red-400' : ''}`}>{signed(b.net, (n) => money(n))}</td>
                </tr>
              ))}
              <tr className="border-t border-white/20 text-xs text-white/60">
                <td className="py-1">Total</td>
                <td />
                <td />
                <td className={`text-right ${sum === 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sum === 0 ? '0.00 ✓ balanced' : money(sum)}</td>
              </tr>
            </tbody>
          </table>
          {d.ledger.rounded && <p className="text-xs text-white/40">Some results were rounded to the nearest {cur} 0.01; rounding is spread so the total stays exactly zero.</p>}
          {d.ledger.discrepancies.map((x, i) => (
            <p key={i} className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-inset ring-red-500/25">
              ⚠ {x.message}
            </p>
          ))}
        </section>
      )}

      {d.ledger && ended && (
        <section className="card-panel">
          <h2 className="mb-2 font-bold">Settle up</h2>
          {d.ledger.transfers.length === 0 ? (
            <p className="text-sm text-white/60">{d.ledger.discrepancies.length ? 'Fix the discrepancy before settling.' : 'Nobody owes anything.'}</p>
          ) : (
            <ul className="space-y-2">
              {d.ledger.transfers.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl bg-black/25 p-3.5 ring-1 ring-inset ring-white/[0.06]">
                  <b>{name.get(t.from)}</b>
                  <span className="text-white/50">pays</span>
                  <b>{name.get(t.to)}</b>
                  <span className="ml-auto font-display text-lg font-extrabold tabular text-gold">{money(t.amount, cur)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-white/40">
            The fewest possible transfers ({d.ledger.transfers.length}). The app never moves money: settle between yourselves.
          </p>
        </section>
      )}

      {d.tournament && (
        <section className="card-panel">
          <h2 className="mb-2 font-bold">Standings</h2>
          <ol className="space-y-1 text-sm">
            {d.tournament.standings.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {s.place}. {s.username}
                </span>
                {d.ledger && <span className="text-emerald-300">{s.prize ? money(s.prize, cur) : ''}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {d.stats && (
        <section className="card-panel text-sm">
          <h2 className="mb-2 font-bold">Stats</h2>
          <p className="text-white/60">
            {chips(d.stats.handsPlayed)} hands · biggest pot {chips(d.stats.biggestPot)}
          </p>
          {d.room.gameMode === 'CASH' && (
            <table className="mt-2 w-full">
              <tbody>
                {d.stats.players.map((p) => (
                  <tr key={p.userId} className="border-t border-white/5">
                    <td className="py-1">{p.username}</td>
                    <td className="text-right text-white/60">{p.handsPlayed} hands</td>
                    <td className="text-right">{signed(p.net)} chips</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <details className="card-panel text-sm">
        <summary className="cursor-pointer font-bold">All entries ({d.entries.length})</summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {d.entries.map((e) => (
              <tr key={e.id} className="border-t border-white/5">
                <td className="py-1 text-white/50">{new Date(e.createdAt).toLocaleTimeString()}</td>
                <td>{e.username}</td>
                <td>{TYPE_LABEL[e.type] ?? e.type}</td>
                <td className="text-right">{e.chips ? `${chips(e.chips)} chips` : ''}</td>
                <td className="text-right">{d.room.moneyMode === 'LEDGER' ? money(e.amountMinor, cur) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <Link className="block text-center text-sm font-semibold text-gold hover:underline" href={`/history?room=${d.room.code}`}>
        Hands from this session
      </Link>
    </main>
  );
}
