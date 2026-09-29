'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { playerNameSchema } from '@poker/shared';
import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';
import { PlayingCard } from '@/components/table/Card';
import { Brand } from '@/components/ui/Brand';
import { ArrowRight, Lock, Shield, Users } from '@/components/ui/Icons';
import { api, fetchMe, type Me } from '@/lib/api';

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

type Mode = 'join' | 'host';

/**
 * The only way in: type a name, then join a table with its code or host a new one.
 * No account is created; the name is remembered on this device by a cookie.
 */
function HomeInner() {
  const router = useRouter();
  const invite = (useSearchParams().get('join') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('join');
  const [code, setCode] = useState(invite);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMe()
      .then((u) => {
        setMe(u);
        if (u) setName(u.username);
      })
      .catch(() => setMe(null));
  }, []);

  /** Creates the guest identity, or renames it, so the table shows the name typed here. */
  async function saveName() {
    const parsed = playerNameSchema.safeParse(name);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Enter your name');
    if (me && me.username === parsed.data) return;
    const { user } = await api<{ user: Me }>('/auth/guest', { body: { name: parsed.data } });
    setMe(user);
    setName(user.username);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveName();
      router.push(`/room/${code.trim().toUpperCase()}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 p-5 lg:grid-cols-2 lg:p-10">
      <section className="hidden flex-col gap-8 lg:flex">
        <Brand size="lg" />
        <h1 className="text-5xl font-extrabold leading-[1.05]">
          Your private table.
          <br />
          <span className="bg-gradient-to-r from-[#f3dc9c] to-[#c9a24a] bg-clip-text text-transparent">Anywhere.</span>
        </h1>
        <p className="max-w-md text-lg text-white/60">No-Limit Hold&apos;em with your friends, each on your own device. No sign-up: pick a name, then host a table or join one with its code.</p>
        <div className="flex gap-3">
          <PlayingCard card={51} size="lg" className="-rotate-6" />
          <PlayingCard card={47} size="lg" className="rotate-3" />
        </div>
        <ul className="space-y-3 text-sm text-white/70">
          <Feature icon={<Shield className="h-4 w-4" />} text="Provably fair shuffle: verify every hand yourself" />
          <Feature icon={<Lock className="h-4 w-4" />} text="Your cards are only ever sent to your device" />
          <Feature icon={<Users className="h-4 w-4" />} text="Private rooms for up to 9 players, joined by code" />
        </ul>
      </section>

      <section className="mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Brand size="lg" />
        </div>
        <div className="card-panel flex flex-col gap-5 p-6 sm:p-7">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Your name</span>
            <input
              className="input h-12 text-lg"
              placeholder="What should the table call you?"
              autoComplete="nickname"
              maxLength={16}
              value={name}
              disabled={me === undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1 ring-1 ring-inset ring-white/[0.06]">
            {(
              [
                ['join', 'Join a table'],
                ['host', 'Create a room'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`h-10 rounded-lg text-sm font-semibold transition ${mode === m ? 'bg-gold text-black' : 'text-white/60 hover:text-white'}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'join' ? (
            <form className="flex flex-col gap-4" onSubmit={join}>
              <label className="flex flex-col gap-1.5">
                <span className="eyebrow">Room code</span>
                <input
                  className="input h-12 font-mono text-lg uppercase tracking-[0.3em] placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal"
                  placeholder="e.g. K7QX2M"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={10}
                />
              </label>
              {error && <ErrorBox message={error} />}
              <button className="btn-primary h-12 text-base" disabled={busy || !code.trim() || me === undefined}>
                {busy ? 'Joining…' : 'Join table'}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          ) : (
            <CreateRoomForm beforeCreate={saveName} />
          )}
        </div>
      </section>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/20">{message}</p>;
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/10 text-gold ring-1 ring-inset ring-gold/20">{icon}</span>
      {text}
    </li>
  );
}
