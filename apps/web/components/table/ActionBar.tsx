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
  const [pre, setPre] = useState<null | 'checkFold' | 'callAny'>(null);
  const streetKey = hand ? `${hand.handNo}-${hand.street}` : '';
  useEffect(() => setPre(null), [streetKey]);

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

  // Fire a pre-selected action as soon as it's our turn.
  useEffect(() => {
    if (!legal || !pre || !hand) return;
    const action = legal.canCheck ? { type: 'check' as const } : pre === 'callAny' ? { type: 'call' as const } : { type: 'fold' as const };
    setPre(null);
    void emit('player:action', { handNo: hand.handNo, action }).then((r) => {
      if (!r.ok) onError(r.error);
    });
  }, [legal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hand || mySeat === null) return null;
  const me = view.seats[mySeat];
  if (!legal && hand.phase === 'betting' && me?.inHand && !me.allIn) {
    return (
      <div className="mx-auto flex w-full max-w-xl gap-2">
        {(
          [
            ['checkFold', 'Check / Fold'],
            ['callAny', 'Call any'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPre(pre === k ? null : k)}
            className={`btn h-11 flex-1 ring-1 ring-inset ${pre === k ? 'bg-gold/15 text-gold ring-gold/50' : 'bg-white/[0.04] text-white/60 ring-white/10 hover:bg-white/[0.08]'}`}
          >
            <span className={`grid h-4 w-4 place-items-center rounded border ${pre === k ? 'border-gold bg-gold text-black' : 'border-white/30'}`}>{pre === k ? '✓' : ''}</span>
            {label}
          </button>
        ))}
      </div>
    );
  }

  // Run it twice vote
  if (hand.phase === 'runItTwice' && hand.ritPending.includes(mySeat)) {
    return (
      <Bar title="Everyone is all-in" hint="Deal the rest of the board twice and split the pot?" secs={secs}>
        <button className="btn-secondary h-14 flex-1" disabled={busy} onClick={() => send({ type: 'runItTwice', agree: false })}>
          Run once
        </button>
        <button className="btn-primary h-14 flex-1" disabled={busy} onClick={() => send({ type: 'runItTwice', agree: true })}>
          Run it twice
        </button>
      </Bar>
    );
  }

  // Show or muck a losing hand
  if (hand.phase === 'showdown' && hand.showdownAwaiting === mySeat) {
    return (
      <Bar title="Showdown" hint="Your hand can't win this pot." secs={secs}>
        <button className="btn-secondary h-14 flex-1" disabled={busy} onClick={() => send({ type: 'show' })}>
          Show cards
        </button>
        <button className="btn-primary h-14 flex-1" disabled={busy} onClick={() => send({ type: 'muck' })}>
          Muck
        </button>
      </Bar>
    );
  }

  if (!legal) return null;
  const aggressive = legal.canBet || legal.canRaise;
  const callIsAllIn = legal.canCall && legal.callAmount >= view.seats[mySeat]!.stack;
  const allIn = amount === legal.maxTo;

  return (
    <div className="mx-auto w-full max-w-xl">
      {raiseOpen && aggressive && (
        <div className="slide-up mb-2 space-y-3 rounded-2xl bg-[#0b0f0e]/92 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-white/10 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1.5">
            {quick.map(([label, to]) => (
              <button
                key={label}
                className={`h-9 rounded-lg text-xs font-semibold ring-1 ring-inset transition ${amount === to ? 'bg-gold/15 text-gold ring-gold/50' : 'bg-white/[0.05] text-white/80 ring-white/10 hover:bg-white/10'}`}
                onClick={() => setAmount(to)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button className="icon-btn h-9 w-9" onClick={() => setAmount((a) => Math.max(legal.minTo, a - (view.room.bigBlind || 1)))}>
              −
            </button>
            <input
              type="range"
              className="flex-1"
              min={legal.minTo}
              max={legal.maxTo}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <button className="icon-btn h-9 w-9" onClick={() => setAmount((a) => Math.min(legal.maxTo, a + (view.room.bigBlind || 1)))}>
              +
            </button>
            <input
              className="input h-9 w-24 text-center font-bold tabular"
              type="number"
              inputMode="numeric"
              min={legal.minTo}
              max={legal.maxTo}
              value={amount}
              onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
            />
          </div>
          <div className="flex justify-between text-[11px] text-white/40">
            <span>Min {chips(legal.minTo)}</span>
            <span>Max {chips(legal.maxTo)}</span>
          </div>
        </div>
      )}
      <Bar title="Your turn" secs={secs}>
        <button className="btn h-14 flex-1 bg-white/[0.04] text-red-300 ring-1 ring-inset ring-red-400/30 hover:bg-red-500/10" disabled={busy} onClick={() => send({ type: 'fold' })}>
          Fold
        </button>
        {legal.canCheck ? (
          <button className="btn h-14 flex-1 bg-white/[0.1] text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.15]" disabled={busy} onClick={() => send({ type: 'check' })}>
            Check
          </button>
        ) : (
          <button className="btn h-14 flex-1 flex-col gap-0 bg-white/[0.1] text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.15]" disabled={busy} onClick={() => send({ type: 'call' })}>
            <span>{callIsAllIn ? 'All-in' : 'Call'}</span>
            <span className="text-xs font-bold tabular text-gold">{chips(legal.callAmount)}</span>
          </button>
        )}
        {aggressive &&
          (raiseOpen ? (
            <button
              className="btn-primary h-14 flex-1 flex-col gap-0"
              disabled={busy || amount < legal.minTo || amount > legal.maxTo}
              onClick={() => send(allIn ? { type: 'allIn' } : { type: legal.canBet ? 'bet' : 'raise', to: amount })}
            >
              <span>{allIn ? 'All-in' : legal.canBet ? 'Bet' : 'Raise to'}</span>
              <span className="text-xs font-bold tabular">{chips(amount)}</span>
            </button>
          ) : (
            <button className="btn-primary h-14 flex-1" disabled={busy} onClick={() => setRaiseOpen(true)}>
              {legal.canBet ? 'Bet' : 'Raise'}
            </button>
          ))}
      </Bar>
    </div>
  );
}

function Bar({ children, title, hint, secs }: { children: React.ReactNode; title: string; hint?: string; secs: number | null }) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#0b0f0e]/92 p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(52,211,153,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between px-1.5 pb-2 pt-0.5 text-xs">
        <span className="flex items-center gap-2 font-semibold text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
          {title}
          {hint && <span className="font-normal text-white/50">{hint}</span>}
        </span>
        {secs !== null && <span className={`font-mono tabular ${secs <= 5 ? 'text-red-300' : 'text-white/50'}`}>{secs}s</span>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
