'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';
import { api } from '@/lib/api';
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

export default function LobbyPage() {
  const me = useMe();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<RoomRow[]>([]);

  useEffect(() => {
    if (me) api<{ rooms: RoomRow[] }>('/rooms').then((r) => setRooms(r.rooms)).catch(() => undefined);
  }, [me]);

  if (!me) return <main className="grid min-h-dvh place-items-center text-white/50">Loading…</main>;
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 p-4 pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">♠ Hi, {me.username}</h1>
        <button
          className="btn-secondary text-sm"
          onClick={async () => {
            await api('/auth/logout', { method: 'POST' });
            router.replace('/login');
          }}
        >
          Log out
        </button>
      </header>

      <nav className="grid grid-cols-3 gap-2 text-center text-sm">
        <Link className="btn-secondary" href="/history">Hand history</Link>
        <Link className="btn-secondary" href="/sessions">Sessions</Link>
        <Link className="btn-secondary" href="/verify">Verify hand</Link>
      </nav>

      <form
        className="card-panel flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/room/${code.trim().toUpperCase()}`);
        }}
      >
        <input className="input uppercase" placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} />
        <button className="btn-primary">Join</button>
      </form>

      <CreateRoomForm />

      {rooms.length > 0 && (
        <section className="card-panel">
          <h2 className="mb-2 font-bold">Your rooms</h2>
          <ul className="divide-y divide-white/10">
            {rooms.map((r) => (
              <li key={r.code} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-white/50">
                    {r.code} · {r.gameMode === 'CASH' ? 'Cash' : 'Tournament'} · {r.moneyMode === 'LEDGER' ? 'Ledger' : 'Play chips'} · host {r.host}
                  </div>
                </div>
                {r.status === 'ENDED' ? (
                  <Link className="text-sm text-white/60 underline" href={`/sessions/${r.code}`}>
                    Results
                  </Link>
                ) : (
                  <Link className="btn-primary text-sm" href={`/room/${r.code}`}>
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
