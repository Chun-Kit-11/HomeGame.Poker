'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ClientPayload, TableView } from '@poker/shared';
import { useAmount } from '@/lib/display';
import type { Emit } from '@/lib/useTable';
import { BetAmountInput } from './BetAmountInput';
import { useCountdown } from './TimerRing';

type Action = ClientPayload<'player:action'>['action'];

export interface Preset {
  label: string;
  tag: string;
  to: number;
  allIn: boolean;
}

/**
 * One-tap bet sizes. Preflop with no raise yet: multiples of the big blind.
 * Otherwise: fractions of the pot after calling (a "pot" raise = call + pot).
 */
export function presetsFor(view: TableView): Preset[] {
  const h = view.hand!;
  const legal = h.legal!;
  const me = view.seats[legal.seat]!;
  const bb = view.room.bigBlind;
  const out: Preset[] = [];
  const add = (to: number, tag: string) => {
    const t = Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(to)));
    if (t >= legal.maxTo || out.some((p) => p.to === t)) return;
    out.push({ label: legal.canBet ? 'Bet' : 'Raise to', tag, to: t, allIn: false });
  };
  const unopened = h.street === 'preflop' && h.currentBet <= bb;
  if (unopened) {
    for (const m of [2.5, 3, 4]) add(bb * m, `${m}x`);
  } else if (h.street === 'preflop') {
    for (const m of [2.5, 3]) add(h.currentBet * m, `${m}x`);
    const potTo = me.streetBet + legal.callAmount + (h.totalPot + legal.callAmount);
    add(potTo, 'Pot');
  } else {
    const potAfterCall = h.totalPot + legal.callAmount;
    for (const f of legal.canBet ? [0.33, 0.5, 0.75] : [0.5, 0.75, 1]) {
      add(me.streetBet + legal.callAmount + f * potAfterCall, f === 1 ? 'Pot' : `${Math.round(f * 100)}%`);
    }
  }
  out.push({ label: 'All-in', tag: '', to: legal.maxTo, allIn: true });
  return out.slice(-4);
}

export function MobileActions({ view, emit, skew, onError, onStart }: { view: TableView; emit: Emit; skew: number; onError: (e: string) => void; onStart: () => void }) {
  const fmt = useAmount();
  const hand = view.hand;
  const legal = hand?.legal ?? null;
  const mySeat = view.me.seat;
  const me = mySeat !== null ? view.seats[mySeat] : null;
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState(0);
  const [pre, setPre] = useState<null | 'checkFold' | 'callAny'>(null);
  const secs = useCountdown(hand?.deadline ?? null, skew);
  const streetKey = hand ? `${hand.handNo}-${hand.street}` : '';
  const turnKey = legal ? `${hand!.handNo}-${hand!.street}-${hand!.currentBet}-${legal.minTo}` : '';

  useEffect(() => setPre(null), [streetKey]);
  useEffect(() => {
    setCustom(false);
    if (legal) setAmount(legal.minTo);
  }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: Action) => {
    if (!hand) return;
    setBusy(true);
    const r = await emit('player:action', { handNo: hand.handNo, action });
    setBusy(false);
    setCustom(false);
    if (!r.ok) onError(r.error);
  };

  // Fire a pre-selected action as soon as it's our turn
  useEffect(() => {
    if (!legal || !pre || !hand) return;
    const a: Action = legal.canCheck ? { type: 'check' } : pre === 'callAny' ? { type: 'call' } : { type: 'fold' };
    setPre(null);
    void send(a);
  }, [legal]); // eslint-disable-line react-hooks/exhaustive-deps

  const presets = useMemo(() => (legal && (legal.canBet || legal.canRaise) ? presetsFor(view) : []), [legal, view]);
  const potPct = (to: number) => {
    if (!hand || !legal || !me) return '';
    const pot = hand.totalPot + legal.callAmount;
    const raiseBy = to - me.streetBet - legal.callAmount;
    return pot > 0 ? `${Math.round((raiseBy / pot) * 100)}%` : '';
  };

  // Not seated
  if (!me || mySeat === null) {
    return (
      <div className="absolute inset-x-[4%] bottom-3 z-30 flex flex-col items-center gap-2">
        {view.me.isHost && view.room.status === 'OPEN' && (
          <button className="btn-primary h-12 w-full max-w-xs text-base" onClick={onStart}>
            Start the game
          </button>
        )}
        {view.me.pendingRequest ? (
          <div className="rounded-full bg-black/60 px-4 py-2 text-sm text-white/75 ring-1 ring-inset ring-white/10 backdrop-blur">
            Waiting for the host to approve…{' '}
            {view.me.pendingRequest.kind === 'buyIn' && (
              <button className="ml-1 underline" onClick={() => emit('seat:cancel', {})}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          view.room.status !== 'ENDED' && (
            <div className="rounded-full bg-black/60 px-4 py-2 text-sm text-white/75 ring-1 ring-inset ring-white/10 backdrop-blur">
              You&apos;re watching · tap <span className="text-gold">+</span> to {view.tournament ? 'register' : 'sit'}
            </div>
          )
        )}
      </div>
    );
  }

  const bottomRow = 'absolute bottom-2 left-[3%] right-[45%] z-30 flex gap-2';
  const rightCol = 'absolute bottom-2 right-[2.5%] z-30 flex w-[40%] flex-col gap-1.5';

  if (view.me.isHost && view.room.status === 'OPEN') {
    return (
      <div className="absolute bottom-2 right-[2.5%] z-30 w-[40%]">
        <button className="btn-primary h-14 w-full text-base" onClick={onStart}>
          Start game
        </button>
      </div>
    );
  }

  // Run it twice vote / show or muck
  if (hand && ((hand.phase === 'runItTwice' && hand.ritPending.includes(mySeat)) || (hand.phase === 'showdown' && hand.showdownAwaiting === mySeat))) {
    const rit = hand.phase === 'runItTwice';
    return (
      <div className={rightCol}>
        <div className="rounded-xl bg-black/60 px-3 py-2 text-center text-xs text-white/75 ring-1 ring-inset ring-white/10 backdrop-blur">
          {rit ? 'Everyone is all-in. Run it twice?' : "Your hand can't win."} {secs !== null && <span className="tabular text-white/50">{secs}s</span>}
        </div>
        <button className="btn-secondary h-12" disabled={busy} onClick={() => send(rit ? { type: 'runItTwice', agree: false } : { type: 'show' })}>
          {rit ? 'Run once' : 'Show cards'}
        </button>
        <button className="btn-primary h-12" disabled={busy} onClick={() => send(rit ? { type: 'runItTwice', agree: true } : { type: 'muck' })}>
          {rit ? 'Run it twice' : 'Muck'}
        </button>
      </div>
    );
  }

  // Waiting for our turn: pre-actions
  if (!legal) {
    if (!hand || hand.phase !== 'betting' || !me.inHand || me.allIn) return null;
    return (
      <div className={rightCol}>
        {(
          [
            ['checkFold', 'Check / Fold'],
            ['callAny', 'Call any'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPre(pre === k ? null : k)}
            className={`btn h-11 justify-start ring-1 ring-inset backdrop-blur ${pre === k ? 'bg-gold/20 text-gold ring-gold/60' : 'bg-[var(--plate)] text-white/70 ring-white/10'}`}
          >
            <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${pre === k ? 'border-gold bg-gold text-black' : 'border-white/30'}`}>{pre === k ? '✓' : ''}</span>
            {label}
          </button>
        ))}
      </div>
    );
  }

  const callIsAllIn = legal.canCall && legal.callAmount >= me.stack;
  return (
    <>
      {custom && (legal.canBet || legal.canRaise) && (
        <div className="slide-up absolute inset-x-[3%] bottom-[76px] z-40 space-y-3 rounded-2xl bg-[var(--plate)] p-3 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{legal.canBet ? 'Bet' : 'Raise to'}</span>
            <span className="text-xs text-white/45 tabular">{potPct(amount)} pot</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="icon-btn h-10 w-10" onClick={() => setAmount((a) => Math.max(legal.minTo, a - view.room.bigBlind))}>
              −
            </button>
            <input type="range" className="flex-1" min={legal.minTo} max={legal.maxTo} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <button className="icon-btn h-10 w-10" onClick={() => setAmount((a) => Math.min(legal.maxTo, a + view.room.bigBlind))}>
              +
            </button>
          </div>
          <div className="flex items-start gap-2">
            <BetAmountInput className="flex-1" amount={amount} setAmount={setAmount} min={legal.minTo} max={legal.maxTo} bigBlind={view.room.bigBlind} />
            <button
              className="btn-primary h-12 flex-1 flex-col gap-0"
              disabled={busy || amount < legal.minTo || amount > legal.maxTo}
              onClick={() => send(amount === legal.maxTo ? { type: 'allIn' } : { type: legal.canBet ? 'bet' : 'raise', to: amount })}
            >
              <span className="text-sm">{amount === legal.maxTo ? 'All-in' : legal.canBet ? 'Bet' : 'Raise to'}</span>
              <span className="text-xs font-bold tabular">{fmt(amount)}</span>
            </button>
          </div>
        </div>
      )}

      {presets.length > 0 && !custom && (
        <div className={rightCol}>
          {presets.map((p) => (
            <button
              key={p.label + p.to}
              disabled={busy}
              onClick={() => send(p.allIn ? { type: 'allIn' } : { type: legal.canBet ? 'bet' : 'raise', to: p.to })}
              className={`relative flex h-[46px] flex-col justify-center rounded-xl px-3 text-left shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)] ring-1 ring-inset backdrop-blur-md transition active:scale-[0.97] ${
                p.allIn ? 'bg-gradient-to-b from-[#5b1220]/95 to-[#3a0b15]/95 ring-red-300/30' : 'bg-[var(--plate)] ring-white/10 hover:brightness-125'
              }`}
            >
              <span className="flex items-center justify-between text-[10px] text-white/55">
                {p.label}
                <span className="font-semibold text-gold">{p.allIn ? '' : p.tag || potPct(p.to)}</span>
              </span>
              <span className="text-center font-display text-[17px] font-extrabold leading-tight tabular text-white">{fmt(p.to)}</span>
            </button>
          ))}
        </div>
      )}

      <div className={presets.length ? bottomRow : 'absolute inset-x-[3%] bottom-2 z-30 flex gap-2'}>
        {!legal.canCheck && (
          <button className="btn h-14 flex-1 bg-[var(--plate)] text-base text-red-300 ring-1 ring-inset ring-red-400/35 backdrop-blur" disabled={busy} onClick={() => send({ type: 'fold' })}>
            Fold
          </button>
        )}
        {legal.canCheck ? (
          <button
            className="btn-primary h-14 flex-1 text-base"
            disabled={busy}
            onClick={() => send({ type: 'check' })}
          >
            Check
          </button>
        ) : (
          <button
            className="btn-primary h-14 flex-1 flex-col gap-0"
            disabled={busy}
            onClick={() => send({ type: 'call' })}
          >
            <span className="text-sm">{callIsAllIn ? 'All-in' : 'Call'}</span>
            <span className="text-xs font-bold tabular">{fmt(legal.callAmount)}</span>
          </button>
        )}
        {presets.length > 0 && (
          <button
            aria-label="Custom amount"
            className={`btn h-14 w-12 shrink-0 px-0 ring-1 ring-inset backdrop-blur ${custom ? 'bg-gold/25 text-gold ring-gold/60' : 'bg-[var(--plate)] text-gold ring-white/10'}`}
            onClick={() => setCustom(!custom)}
          >
            <svg viewBox="0 0 24 24" className={`h-6 w-6 transition ${custom ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}
