'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';
import { Brand } from '@/components/ui/Brand';
import { ArrowRight, Chart, History, Logout, Shield, Wallet } from '@/components/ui/Icons';
import { Loading } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { avatarColor } from '@/lib/format';
import { useMe } from '@/lib/useMe';

interface RoomRow {
  code: string;
  name: string;
  gameMode: string;
  moneyMode: string;
  status: string;
  host: string;
  createdAt: string;
}

const STATUS: Record<string, [string, string]> = {
  OPEN: ['Waiting', 'bg-sky-400/15 text-sky-300 ring-sky-400/25'],
  RUNNING: ['Live', 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/25'],
  PAUSED: ['Paused', 'bg-amber-400/15 text-amber-300 ring-amber-400/25'],
  ENDED: ['Ended', 'bg-white/5 text-white/50 ring-white/10'],
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function LobbyPage() {
  const me = useMe();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);

  useEffect(() => {
    if (me) api<{ rooms: RoomRow[] }>('/rooms').then((r) => setRooms(r.rooms)).catch(() => setRooms([]));
  }, [me]);

  if (!me) return <Loading />;
  const live = rooms?.filter((r) => r.status !== 'ENDED') ?? [];
  const past = rooms?.filter((r) => r.status === 'ENDED').slice(0, 8) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6">
      <header className="flex items-center justify-between py-2">
        <Brand />
        <div className="flex items-center gap-2">
          <div className="pill py-1 pl-1 pr-3">
            <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: avatarColor(me.username) }}>
              {me.username[0].toUpperCase()}
            </span>
            <span className="max-w-[110px] truncate font-semibold text-white">{me.username}</span>
          </div>
          <button
            className="icon-btn"
            title="Log out"
            onClick={async () => {
              await api('/auth/logout', { method: 'POST' });
              router.replace('/login');
            }}
          >
            <Logout className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <section className="mt-8 mb-6">
        <p className="eyebrow">{greeting()}</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Ready for a game, {me.username}?</h1>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Quick links + live tables first on phones */}
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
            {[
              ['/history', 'Hand history', <History key="h" className="h-4 w-4" />],
              ['/sessions', 'Sessions', <Wallet key="w" className="h-4 w-4" />],
              ['/stats', 'My stats', <Chart key="c" className="h-4 w-4" />],
              ['/verify', 'Verify', <Shield key="s" className="h-4 w-4" />],
            ].map(([href, label, icon]) => (
              <Link key={href as string} href={href as string} className="pill shrink-0 gap-2 px-3.5 py-2 text-sm font-semibold text-white">
                <span className="text-gold">{icon}</span>
                {label}
              </Link>
            ))}
          </nav>
          {live.length > 0 && (
            <section className="card-panel lg:hidden">
              <h2 className="mb-3 text-lg font-bold">Live tables</h2>
              <ul className="space-y-2">
                {live.map((r) => (
                  <RoomItem key={r.code} r={r} href={`/room/${r.code}`} />
                ))}
              </ul>
            </section>
          )}
          <form
            className="card-panel flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) router.push(`/room/${code.trim().toUpperCase()}`);
            }}
          >
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="eyebrow">Join with a room code</span>
              <input
                className="input h-12 font-mono text-lg uppercase tracking-[0.3em] placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal"
                placeholder="e.g. K7QX2M"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={10}
              />
            </label>
            <button className="btn-primary h-12 px-6" disabled={!code.trim()}>
              Join table <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <CreateRoomForm />
        </div>

        <aside className="space-y-6">
          <nav className="hidden grid-cols-2 gap-3 lg:grid">
            <Tile href="/history" icon={<History />} title="Hand history" sub="Replay & review" />
            <Tile href="/sessions" icon={<Wallet />} title="Sessions" sub="Results & settle-up" />
            <Tile href="/stats" icon={<Chart />} title="My stats" sub="VPIP, PFR & more" />
            <Tile href="/verify" icon={<Shield />} title="Verify" sub="Provably fair" />
          </nav>

          <section className="card-panel">
            <h2 className="mb-3 text-lg font-bold">Your tables</h2>
            {rooms === null && <p className="text-sm text-white/40">Loading…</p>}
            {rooms?.length === 0 && <p className="text-sm text-white/50">No rooms yet. Create one and share the code with your friends.</p>}
            <ul className="space-y-2">
              {live.map((r) => (
                <RoomItem key={r.code} r={r} href={`/room/${r.code}`} />
              ))}
            </ul>
            {past.length > 0 && (
              <>
                <p className="eyebrow mb-2 mt-5">Recent sessions</p>
                <ul className="space-y-2">
                  {past.map((r) => (
                    <RoomItem key={r.code} r={r} href={`/sessions/${r.code}`} />
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Tile({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="card-panel group flex flex-col gap-3 p-4 transition hover:bg-white/[0.06]">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10 text-gold ring-1 ring-inset ring-gold/20 transition group-hover:bg-gold/15">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-white/45">{sub}</span>
      </span>
    </Link>
  );
}

function RoomItem({ r, href }: { r: RoomRow; href: string }) {
  const [label, cls] = STATUS[r.status] ?? STATUS.OPEN;
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl bg-black/20 p-3 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.05]">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#1b6e4d] to-[#0c3b29] font-display text-sm font-bold text-emerald-100 ring-1 ring-inset ring-white/10">
          {r.gameMode === 'CASH' ? '$' : '🏆'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{r.name}</div>
          <div className="truncate text-xs text-white/45">
            <span className="font-mono">{r.code}</span> · {r.gameMode === 'CASH' ? 'Cash' : 'Tournament'} · {r.moneyMode === 'LEDGER' ? 'Ledger' : 'Play chips'}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>{label}</span>
      </Link>
    </li>
  );
}
