'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';

export default function LobbyPage() {
  const me = useMe();
  const router = useRouter();
  if (!me) return <main className="grid min-h-dvh place-items-center text-white/50">Loading…</main>;
  return (
    <main className="mx-auto max-w-xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hi, {me.username}</h1>
        <button
          className="btn-secondary"
          onClick={async () => {
            await api('/auth/logout', { method: 'POST' });
            router.replace('/login');
          }}
        >
          Log out
        </button>
      </header>
      <p className="mt-6 text-white/60">Rooms arrive in Phase 3.</p>
    </main>
  );
}
