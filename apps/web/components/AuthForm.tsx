'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Brand } from './ui/Brand';
import { ArrowRight, Lock, Shield, Users } from './ui/Icons';
import { PlayingCard } from './table/Card';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNext(params.get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invited = nextPath.startsWith('/room/');

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
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 p-5 lg:grid-cols-2 lg:p-10">
      {/* Showcase */}
      <section className="hidden flex-col gap-8 lg:flex">
        <Brand size="lg" />
        <h1 className="text-5xl font-extrabold leading-[1.05]">
          Your private table.
          <br />
          <span className="bg-gradient-to-r from-[#f3dc9c] to-[#c9a24a] bg-clip-text text-transparent">Anywhere.</span>
        </h1>
        <p className="max-w-md text-lg text-white/60">No-Limit Hold&apos;em with your friends, each on your own device. Cash games or Sit &amp; Go tournaments, with a ledger to settle up after.</p>
        <div className="flex gap-3">
          <PlayingCard card={51} size="lg" className="-rotate-6" />
          <PlayingCard card={47} size="lg" className="rotate-3" />
        </div>
        <ul className="space-y-3 text-sm text-white/70">
          <Feature icon={<Shield className="h-4 w-4" />} text="Provably fair shuffle: verify every hand yourself" />
          <Feature icon={<Lock className="h-4 w-4" />} text="Your cards are only ever sent to your device" />
          <Feature icon={<Users className="h-4 w-4" />} text="Invite-only rooms for up to 9 players" />
        </ul>
      </section>

      {/* Form */}
      <section className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex justify-center lg:hidden">
          <Brand size="lg" />
        </div>
        <div className="card-panel p-6 sm:p-7">
          <h2 className="text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-white/50">
            {invited ? 'You have been invited to a table. ' : ''}
            {mode === 'login' ? 'Log in to take your seat.' : 'It takes ten seconds.'}
          </p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Username</span>
              <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Password</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : undefined}
              />
            </label>
            {mode === 'register' && <p className="-mt-1 text-xs text-white/40">3–20 letters, numbers or underscores · password of 8+ characters</p>}
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/20">{error}</p>}
            <button className="btn-primary mt-1 h-12 text-base" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-white/50">
          {mode === 'login' ? 'New here? ' : 'Already have an account? '}
          <Link className="font-semibold text-gold hover:underline" href={`/${other}?next=${encodeURIComponent(nextPath)}`}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </Link>
        </p>
      </section>
    </main>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/10 text-gold ring-1 ring-inset ring-gold/20">{icon}</span>
      {text}
    </li>
  );
}

/** Only allow same-site relative redirects. */
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/lobby';
}
