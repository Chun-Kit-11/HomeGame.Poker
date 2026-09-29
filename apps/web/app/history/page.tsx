'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PlayingCard } from '@/components/table/Card';
import { api } from '@/lib/api';
import { chips, signed } from '@/lib/format';
import { useMe } from '@/lib/useMe';
import { Loading, PageHeader } from '@/components/ui/PageHeader';

interface Row {
  id: string;
  handNo: number;
  endedAt: string;
  room: { code: string; name: string };
  blinds: string;
  board: { board: number[]; board2: number[] | null };
  potTotal: number;
  position: string;
  holeCards: number[];
  net: number;
  sawShowdown: boolean;
}

export default function HistoryPage() {
  const me = useMe();
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ room: '', result: '', showdown: false });
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      const q = new URLSearchParams();
      if (!reset && cursor) q.set('cursor', cursor);
      if (filters.room) q.set('room', filters.room);
      if (filters.result) q.set('result', filters.result);
      if (filters.showdown) q.set('showdown', '1');
      try {
        const r = await api<{ hands: Row[]; nextCursor: string | null }>(`/hands?${q}`);
        setRows((old) => (reset ? r.hands : [...old, ...r.hands]));
        setCursor(r.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [cursor, filters],
  );

  const [ready, setReady] = useState(false);
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) setFilters((f) => ({ ...f, room: room.toUpperCase() }));
    setReady(true);
  }, []);

  useEffect(() => {
    if (me && ready) load(true);
  }, [me, filters, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <Loading />;
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-5">
      <PageHeader
        back="/"
        title="Hand history"
        subtitle="Every hand you played, ready to replay"
        actions={
          <Link href="/stats" className="btn-secondary">
            My stats
          </Link>
        }
      />
      <div className="card-panel flex flex-wrap items-center gap-2 p-3 text-sm">
        <input className="input h-10 w-36 font-mono uppercase" placeholder="Room code" value={filters.room} onChange={(e) => setFilters({ ...filters, room: e.target.value.trim() })} />
        <select className="input h-10 w-36" value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value })}>
          <option value="">All results</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <label className="flex items-center gap-2 px-2 text-white/75">
          <input type="checkbox" checked={filters.showdown} onChange={(e) => setFilters({ ...filters, showdown: e.target.checked })} />
          Showdowns only
        </label>
      </div>
      {rows.length === 0 && !loading && <p className="card-panel text-center text-white/50">No hands yet. Play a few and they&apos;ll appear here.</p>}
      <ul className="space-y-2">
        {rows.map((h) => (
          <li key={h.id}>
            <Link href={`/history/${h.id}`} className="card-panel flex items-center gap-3 p-3 transition hover:bg-white/[0.06]">
              <div className="flex gap-0.5">
                {h.holeCards.map((c, i) => (
                  <PlayingCard key={i} card={c} size="sm" />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {h.room.name} · #{h.handNo} · {h.position}
                </div>
                <div className="flex items-center gap-0.5 text-xs text-white/50">
                  {h.board.board.map((c, i) => (
                    <PlayingCard key={i} card={c} size="xs" />
                  ))}
                  <span className="ml-2">
                    {new Date(h.endedAt).toLocaleString()} · pot {chips(h.potTotal)}
                  </span>
                </div>
              </div>
              <div className={`text-right font-display text-lg font-bold tabular ${h.net > 0 ? 'text-emerald-400' : h.net < 0 ? 'text-red-400' : 'text-white/60'}`}>{signed(h.net)}</div>
            </Link>
          </li>
        ))}
      </ul>
      {cursor && (
        <button className="btn-secondary w-full" disabled={loading} onClick={() => load(false)}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </main>
  );
}
