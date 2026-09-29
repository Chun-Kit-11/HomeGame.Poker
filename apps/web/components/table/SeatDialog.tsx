'use client';
import { useState } from 'react';
import type { TableView } from '@poker/shared';
import { chips, money } from '@/lib/format';
import type { Emit } from '@/lib/useTable';

export function Modal({ onClose, children, title }: { onClose: () => void; children: React.ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-[#13201b] p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="text-2xl leading-none text-white/50" onClick={onClose}>
            ×
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
          <div className="text-center text-3xl font-bold text-amber-300">{chips(amount)}</div>
          {inLedger && <div className="text-center text-sm text-white/60">= {money((amount * ledger.ratio.minor) / ledger.ratio.chips, ledger.currency)}</div>}
          <input type="range" className="w-full accent-emerald-400" min={cash.minBuyIn} max={cash.maxBuyIn} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <div className="flex justify-between text-xs text-white/50">
            <span>Min {chips(cash.minBuyIn)}</span>
            <span>Max {chips(cash.maxBuyIn)}</span>
          </div>
          {started && <EntryChoice entry={entry} setEntry={setEntry} />}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p>Starting stack: {chips(view.room.config.tournament!.startingStack)} chips</p>
          {inLedger && <p>Entry fee: {money(ledger.entryPrice, ledger.currency)}</p>}
        </div>
      )}
      {!view.room.config.autoApprove && !view.me.isHost && <p className="mt-3 text-xs text-white/50">The host will be asked to approve.</p>}
      <button className="btn-primary mt-4 w-full" disabled={busy} onClick={submit}>
        {cash ? 'Buy in' : 'Register'}
      </button>
    </Modal>
  );
}

export function EntryChoice({ entry, setEntry }: { entry: 'waitForBB' | 'postBB'; setEntry: (e: 'waitForBB' | 'postBB') => void }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="flex items-center gap-2">
        <input type="radio" checked={entry === 'waitForBB'} onChange={() => setEntry('waitForBB')} />
        Wait for the big blind
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={entry === 'postBB'} onChange={() => setEntry('postBB')} />
        Post a big blind and play now
      </label>
    </div>
  );
}
