'use client';
import { useState } from 'react';
import type { TableView } from '@poker/shared';
import { chips, money } from '@/lib/format';
import { Close } from '../ui/Icons';
import type { Emit } from '@/lib/useTable';

export function Modal({ onClose, children, title }: { onClose: () => void; children: React.ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/65 backdrop-blur-sm sm:place-items-center" onClick={onClose}>
      <div
        className="slide-up w-full max-w-sm rounded-t-3xl bg-[#0f1514] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="icon-btn h-8 w-8" onClick={onClose} aria-label="Close">
            <Close className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Buy-in (cash) or registration (tournament) for an empty seat. */
export function SeatDialog({ view, seat, emit, onClose, onError }: { view: TableView; seat: number; emit: Emit; onClose: () => void; onError: (e: string) => void }) {
  const cash = view.room.config.cash;
  const [amount, setAmount] = useState(cash?.maxBuyIn ?? 0);
  const [entry, setEntry] = useState<'waitForBB' | 'postBB'>('waitForBB');
  const [busy, setBusy] = useState(false);
  const started = view.room.status !== 'OPEN' && view.stats.handsPlayed > 0;
  const ledger = view.room.config.ledger;
  const inLedger = view.room.moneyMode === 'LEDGER' && ledger;

  async function submit() {
    setBusy(true);
    const r = await emit('seat:request', { seat, amount: cash ? amount : undefined, entry });
    setBusy(false);
    if (!r.ok) onError(r.error);
    else onClose();
  }

  return (
    <Modal title={cash ? `Sit in seat ${seat + 1}` : `Register in seat ${seat + 1}`} onClose={onClose}>
      {cash ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-black/30 py-4 text-center ring-1 ring-inset ring-white/[0.06]">
            <div className="eyebrow">Buy-in</div>
            <div className="mt-1 font-display text-4xl font-extrabold tabular text-gold">{chips(amount)}</div>
            {inLedger && <div className="mt-1 text-sm text-white/55">≈ {money((amount * ledger.ratio.minor) / ledger.ratio.chips, ledger.currency)}</div>}
          </div>
          <input type="range" className="w-full accent-emerald-400" min={cash.minBuyIn} max={cash.maxBuyIn} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <div className="flex justify-between text-xs text-white/50">
            <span>Min {chips(cash.minBuyIn)}</span>
            <span>Max {chips(cash.maxBuyIn)}</span>
          </div>
          {started && <EntryChoice entry={entry} setEntry={setEntry} />}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-black/30 p-3 ring-1 ring-inset ring-white/[0.06]">
            <div className="eyebrow">Starting stack</div>
            <div className="mt-1 font-display text-xl font-bold tabular text-gold">{chips(view.room.config.tournament!.startingStack)}</div>
          </div>
          <div className="rounded-xl bg-black/30 p-3 ring-1 ring-inset ring-white/[0.06]">
            <div className="eyebrow">Entry</div>
            <div className="mt-1 font-display text-xl font-bold">{inLedger ? money(ledger.entryPrice, ledger.currency) : 'Free'}</div>
          </div>
        </div>
      )}
      {!view.room.config.autoApprove && !view.me.isHost && <p className="mt-3 text-xs text-white/50">The host will be asked to approve.</p>}
      <button className="btn-primary mt-5 h-12 w-full text-base" disabled={busy} onClick={submit}>
        {cash ? 'Buy in' : 'Register'}
      </button>
    </Modal>
  );
}

export function EntryChoice({ entry, setEntry }: { entry: 'waitForBB' | 'postBB'; setEntry: (e: 'waitForBB' | 'postBB') => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {(
        [
          ['waitForBB', 'Wait for BB', 'Free, join when the big blind reaches you'],
          ['postBB', 'Post BB now', 'Pay a big blind, play the next hand'],
        ] as const
      ).map(([v, title, sub]) => (
        <button
          key={v}
          type="button"
          onClick={() => setEntry(v)}
          className={`rounded-xl p-3 text-left ring-1 ring-inset transition ${entry === v ? 'bg-gold/10 ring-gold/60' : 'bg-black/25 ring-white/10'}`}
        >
          <span className={`block font-semibold ${entry === v ? 'text-gold' : ''}`}>{title}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{sub}</span>
        </button>
      ))}
    </div>
  );
}
