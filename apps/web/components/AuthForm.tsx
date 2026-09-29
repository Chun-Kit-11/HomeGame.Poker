'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNext(params.get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, { body: { username, password } });
      router.replace(nextPath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const other = mode === 'login' ? 'register' : 'login';
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-5xl">♠♥♣♦</div>
        <h1 className="mt-3 text-2xl font-bold">{mode === 'login' ? 'Log in' : 'Create account'}</h1>
      </div>
      <form onSubmit={submit} className="card-panel flex flex-col gap-3">
        <label className="text-sm text-white/70">
          Username
          <input
            className="input mt-1"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="text-sm text-white/70">
          Password
          <input
            className="input mt-1"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
          />
        </label>
        {mode === 'register' && (
          <p className="text-xs text-white/50">3–20 letters, numbers or _. Password at least 8 characters.</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary mt-2" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>
      <p className="text-center text-sm text-white/60">
        {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
        <Link className="text-emerald-400 underline" href={`/${other}?next=${encodeURIComponent(nextPath)}`}>
          {mode === 'login' ? 'Sign up' : 'Log in'}
        </Link>
      </p>
    </main>
  );
}

/** Only allow same-site relative redirects. */
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/lobby';
}
