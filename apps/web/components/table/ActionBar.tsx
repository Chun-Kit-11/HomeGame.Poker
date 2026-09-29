'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ClientPayload, TableView } from '@poker/shared';
import { chips } from '@/lib/format';
import type { Emit } from '@/lib/useTable';
import { useCountdown } from './TimerRing';

/**
 * Bet sizes as a fraction of the pot after calling:
 *   raise to = my current bet + call + fraction * (pot + call)
 */
export function potFractionTo(view: TableView, fraction: number): number {
  const h = view.hand!;
  const legal = h.legal!;
  const me = view.seats[legal.seat]!;
  const potAfterCall = h.totalPot + legal.callAmount;
  const to = me.streetBet + legal.callAmount + Math.floor(fraction * potAfterCall);
  return Math.min(legal.maxTo, Math.max(legal.minTo, to));
}

export function ActionBar({ view, emit, skew, onError }: { view: TableView; emit: Emit; skew: number; onError: (e: string) => void }) {
  const hand = view.hand;
  const legal = hand?.legal ?? null;
  const mySeat = view.me.seat;
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const secs = useCountdown(hand?.deadline ?? null, skew);

  const key = legal ? `${hand!.handNo}-${hand!.street}-${hand!.currentBet}-${legal.minTo}` : '';
  useEffect(() => {
    setRaiseOpen(false);
    if (legal) setAmount(legal.minTo);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: ClientPayload<'player:action'>['action']) => {
    if (!hand) return;
    setBusy(true);
    const r = await emit('player:action', { handNo: hand.handNo, action });
    setBusy(false);
    if (!r.ok) onError(r.error);
  };

  const quick = useMemo(() => {
    if (!legal || !(legal.canBet || legal.canRaise)) return [];
    return [
      ['½ pot', potFractionTo(view, 0.5)],
      ['¾ pot', potFractionTo(view, 0.75)],
      ['Pot', potFractionTo(view, 1)],
      ['All-in', legal.maxTo],
    ] as [string, number][];
  }, [legal, view]);

  if (!hand || mySeat === null) return null;

  // Run it twice vote
  if (hand.phase === 'runItTwice' && hand.ritPending.includes(mySeat)) {
    return (
      <Bar>
        <div className="flex-1 text-sm">Run it twice?{secs !== null && <span className="ml-2 text-white/50">{secs}s</span>}</div>
        <button className="btn-secondary" disabled={busy} onClick={() => send({ type: 'runItTwice', agree: false })}>
          Once
        </button>
        <button className="btn-primary" disabled={busy} onClick={() => send({ type: 'runItTwice', agree: true })}>
          Twice
        </button>
      </Bar>
    );
  }

  // Show or muck a losing hand
  if (hand.phase === 'showdown' && hand.showdownAwaiting === mySeat) {
    return (
      <Bar>
        <div className="flex-1 text-sm">Your hand can&apos;t win.{secs !== null && <span className="ml-2 text-white/50">{secs}s</span>}</div>
        <button className="btn-secondary" disabled={busy} onClick={() => send({ type: 'show' })}>
          Show
        </button>
        <button className="btn-primary" disabled={busy} onClick={() => send({ type: 'muck' })}>
          Muck
        </button>
      </Bar>
    );
  }

  if (!legal) return null;
  const aggressive = legal.canBet || legal.canRaise;
  const callIsAllIn = legal.canCall && legal.callAmount >= view.seats[mySeat]!.stack;

  return (
    <div className="w-full">
      {raiseOpen && aggressive && (
        <div className="mx-auto mb-2 flex max-w-xl flex-col gap-2 rounded-xl bg-black/70 p-3">
          <div className="grid grid-cols-4 gap-2">
            {quick.map(([label, to]) => (
              <button key={label} className="btn-secondary px-1 py-1.5 text-xs" onClick={() => setAmount(to)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary px-3 py-1" onClick={() => setAmount((a) => Math.max(legal.minTo, a - (view.room.bigBlind || 1)))}>
              −
            </button>
            <input
              type="range"
              className="flex-1 accent-emerald-400"
              min={legal.minTo}
              max={legal.maxTo}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <button className="btn-secondary px-3 py-1" onClick={() => setAmount((a) => Math.min(legal.maxTo, a + (view.room.bigBlind || 1)))}>
              +
            </button>
          </div>
          <input
            className="input text-center font-bold"
            type="number"
            inputMode="numeric"
            min={legal.minTo}
            max={legal.maxTo}
            value={amount}
            onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
          />
        </div>
      )}
      <Bar>
        <div className="hidden w-16 text-center text-xs text-white/60 sm:block">{secs !== null && `${secs}s`}</div>
        <button className="btn-danger flex-1" disabled={busy} onClick={() => send({ type: 'fold' })}>
          Fold
        </button>
        {legal.canCheck ? (
          <button className="btn-secondary flex-1" disabled={busy} onClick={() => send({ type: 'check' })}>
            Check
          </button>
        ) : (
          <button className="btn-secondary flex-1" disabled={busy} onClick={() => send({ type: 'call' })}>
            {callIsAllIn ? 'All-in' : 'Call'} {chips(legal.callAmount)}
          </button>
        )}
        {aggressive &&
          (raiseOpen ? (
            <button
              className="btn-primary flex-1"
              disabled={busy || amount < legal.minTo || amount > legal.maxTo}
              onClick={() => send(amount === legal.maxTo ? { type: 'allIn' } : { type: legal.canBet ? 'bet' : 'raise', to: amount })}
            >
              {amount === legal.maxTo ? 'All-in' : legal.canBet ? 'Bet' : 'Raise to'} {chips(amount)}
            </button>
          ) : (
            <button className="btn-primary flex-1" disabled={busy} onClick={() => setRaiseOpen(true)}>
              {legal.canBet ? 'Bet' : 'Raise'}
            </button>
          ))}
      </Bar>
    </div>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-xl bg-emerald-950/90 p-2 ring-2 ring-emerald-400/60">{children}</div>;
}
