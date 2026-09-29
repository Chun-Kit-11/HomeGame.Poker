'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { cardToString } from '@poker/engine';
import { combineClientSeeds, dealFromDeck, verifyHand } from '@poker/shared';
import { PlayingCard } from '@/components/table/Card';
import { api } from '@/lib/api';
import type { HandDetail } from '@/lib/handTypes';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';

function VerifyInner() {
  const params = useSearchParams();
  const handParam = params.get('hand');
  const roomParam = params.get('room');
  const numberParam = params.get('n');
  const [serverSeed, setServerSeed] = useState('');
  const [hash, setHash] = useState('');
  const [clientSeeds, setClientSeeds] = useState('');
  const [handId, setHandId] = useState('');
  const [hand, setHand] = useState<HandDetail | null>(null);
  const [result, setResult] = useState<ReturnType<typeof verifyHand> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = handParam ? `/hands/${handParam}` : roomParam && numberParam ? `/hands/by-number/${roomParam}/${numberParam}` : null;
    if (!path) return;
    api<HandDetail>(path)
      .then((h) => {
        setHand(h);
        setServerSeed(h.fair.serverSeed);
        setHash(h.fair.serverSeedHash);
        setHandId(h.fair.handId);
        setClientSeeds(combineClientSeeds(h.fair.clientSeeds));
      })
      .catch((e) => setError(e.message));
  }, [handParam, roomParam, numberParam]);

  const run = () => {
    setError(null);
    try {
      setResult(verifyHand({ serverSeed: serverSeed.trim(), serverSeedHash: hash.trim(), clientSeeds, handId: handId.trim() }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (hand) run();
  }, [hand]); // eslint-disable-line react-hooks/exhaustive-deps

  const dealt =
    result && hand
      ? dealFromDeck(result.deck, {
          seats: hand.players.map((p) => p.seat),
          buttonSeat: hand.config.buttonSeat,
          boardLength: hand.board.board.length,
          board2Common: hand.board.board2 ? hand.board.board2.findIndex((c, i) => c !== hand.board.board[i]) : null,
        })
      : null;
  const same = (a: number[] | null | undefined, b: number[] | null | undefined) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-5">
      <PageHeader back={hand ? `/history/${hand.id}` : '/lobby'} title="Verify a hand" subtitle="Check the shuffle yourself: nothing to trust" />

      <section className="card-panel space-y-2 text-sm text-white/70">
        <p>
          Before every hand the server publishes <b>SHA-256(server seed)</b>. Each player&apos;s device then sends its own random seed. The deck is shuffled with
          Fisher–Yates using random numbers from <code>HMAC-SHA256(server seed, &quot;clientSeeds:handId:counter&quot;)</code> with rejection sampling. After the
          hand the server seed is revealed, so you can check it matches the commitment and recompute the exact deck.
        </p>
        <p className="text-xs">
          Independent check of the commitment on any computer: <code>echo -n &lt;server seed&gt; | sha256sum</code>
        </p>
        <p className="text-xs text-amber-200/80">Note: recomputing the deck also reveals hands that were folded or mucked.</p>
      </section>

      <section className="card-panel grid gap-3 text-sm">
        <label className="grid gap-1">
          Server seed
          <input className="input font-mono text-xs" value={serverSeed} onChange={(e) => setServerSeed(e.target.value)} />
        </label>
        <label className="grid gap-1">
          Commitment (SHA-256 published before the hand)
          <input className="input font-mono text-xs" value={hash} onChange={(e) => setHash(e.target.value)} />
        </label>
        <label className="grid gap-1">
          Combined player seeds (seat:seed|seat:seed…)
          <textarea className="input font-mono text-xs" rows={2} value={clientSeeds} onChange={(e) => setClientSeeds(e.target.value)} />
        </label>
        <label className="grid gap-1">
          Hand ID
          <input className="input font-mono text-xs" value={handId} onChange={(e) => setHandId(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={run}>
          Verify
        </button>
        {error && <p className="text-red-400">{error}</p>}
      </section>

      {result && (
        <section className="card-panel space-y-3">
          <p className={`rounded-xl px-4 py-3 font-semibold ring-1 ring-inset ${result.hashOk ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25' : 'bg-red-500/10 text-red-300 ring-red-500/25'}`}>
            {result.hashOk ? '✓ The server seed matches the commitment' : '✗ The server seed does NOT match the commitment'}
          </p>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Deck order (top card first)</h3>
            <div className="flex flex-wrap gap-1">
              {result.deck.map((c, i) => (
                <PlayingCard key={i} card={c} size="xs" />
              ))}
            </div>
            <p className="mt-1 break-all font-mono text-[10px] text-white/40">{result.deck.map(cardToString).join(' ')}</p>
          </div>
          {hand && dealt && (
            <div className="space-y-1 text-sm">
              <h3 className="font-semibold">Compared with the hand as played</h3>
              <Check ok={same(dealt.board, hand.board.board)} label={`Board ${hand.board.board.map(cardToString).join(' ')}`} />
              {hand.board.board2 && <Check ok={same(dealt.board2, hand.board.board2)} label={`Second board ${hand.board.board2.map(cardToString).join(' ')}`} />}
              {hand.players.map((p) =>
                p.holeCards ? (
                  <Check key={p.seat} ok={same(dealt.holes.get(p.seat), p.holeCards)} label={`${p.username}: ${p.holeCards.map(cardToString).join(' ')}`} />
                ) : (
                  <div key={p.seat} className="text-white/50">
                    {p.username}: not shown (deck says {dealt.holes.get(p.seat)?.map(cardToString).join(' ')})
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={ok ? 'text-emerald-300' : 'text-red-400'}>
      {ok ? '✓' : '✗'} {label}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
