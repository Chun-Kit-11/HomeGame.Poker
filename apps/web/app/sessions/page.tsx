'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { chips, money, signed } from '@/lib/format';
import { useMe } from '@/lib/useMe';

interface SessionRow {
  code: string;
  name: string;
  gameMode: 'CASH' | 'TOURNAMENT';
  moneyMode: 'PLAY' | 'LEDGER';
  status: string;
  createdAt: string;
  currency: string | null;
  net: number | null;
  netChips: number | null;
}

export default function SessionsPage() {
  const me = useMe();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  useEffect(() => {
    if (me) api<{ sessions: SessionRow[] }>('/sessions').then((r) => setRows(r.sessions));
  }, [me]);

  const totals = new Map<string, number>();
  for (const r of rows ?? []) if (r.currency && r.net !== null && r.status === 'ENDED') totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.net);

  if (!me) return <main className="grid min-h-dvh place-items-center text-white/50">Loading…</main>;
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
      <header className="flex items-center gap-3">
        <Link href="/lobby" className="text-white/60">
          ←
        </Link>
        <h1 className="flex-1 text-xl font-bold">Sessions</h1>
        <a className="btn-secondary text-sm" href="/api/sessions/export.csv">
          Export CSV
        </a>
      </header>
      {totals.size > 0 && (
        <div className="card-panel flex flex-wrap gap-4">
          {[...totals].map(([cur, v]) => (
            <div key={cur}>
              <div className="text-xs text-white/50">All-time ({cur})</div>
              <div className={`text-2xl font-bold ${v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : ''}`}>{signed(v, (n) => money(n, cur))}</div>
            </div>
          ))}
        </div>
      )}
      {rows === null && <p className="text-white/50">Loading…</p>}
      {rows?.length === 0 && <p className="text-white/50">No sessions yet.</p>}
      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.code}>
            <Link href={`/sessions/${r.code}`} className="card-panel flex items-center gap-3 p-3 hover:bg-white/10">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.name}</div>
                <div className="text-xs text-white/50">
                  {new Date(r.createdAt).toLocaleDateString()} · {r.gameMode === 'CASH' ? 'Cash' : 'Tournament'} · {r.moneyMode === 'LEDGER' ? 'Ledger' : 'Play chips'}
                  {r.status !== 'ENDED' && ' · in progress'}
                </div>
              </div>
              <div className="text-right font-bold">
                {r.net !== null ? (
                  <span className={r.net > 0 ? 'text-emerald-400' : r.net < 0 ? 'text-red-400' : ''}>{signed(r.net, (n) => money(n, r.currency ?? ''))}</span>
                ) : r.netChips !== null ? (
                  <span className="text-white/70">{signed(r.netChips, chips)} chips</span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
