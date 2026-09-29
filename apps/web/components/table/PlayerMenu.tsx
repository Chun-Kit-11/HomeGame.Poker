'use client';
import { useState } from 'react';
import type { TableView } from '@poker/shared';
import { chips } from '@/lib/format';
import type { Emit } from '@/lib/useTable';
import { EntryChoice, Modal } from './SeatDialog';

/** Actions for my own seat: sit out/in, rebuy/top-up, add-on, leave. */
export function PlayerMenu({ view, emit, onClose, onError }: { view: TableView; emit: Emit; onClose: () => void; onError: (e: string) => void }) {
  const mine = view.seats[view.me.seat!]!;
  const cash = view.room.config.cash;
  const [entry, setEntry] = useState<'waitForBB' | 'postBB'>('waitForBB');
  const room = cash ? cash.maxBuyIn - mine.stack : 0;
  const [amount, setAmount] = useState(Math.max(1, room));
  const run = async (p: Promise<{ ok: boolean; error?: string }>, close = true) => {
    const r = await p;
    if (!r.ok) onError(r.error ?? 'Failed');
    else if (close) onClose();
  };
  const away = mine.status === 'sittingOut' || mine.status === 'busted';
  const t = view.tournament;

  return (
    <Modal title="Your seat" onClose={onClose}>
      <div className="space-y-4 text-sm">
        {cash && (
          <section className="space-y-2">
            {away ? (
              <>
                {mine.stack > 0 && <EntryChoice entry={entry} setEntry={setEntry} />}
                <button className="btn-primary w-full" disabled={mine.stack === 0} onClick={() => run(emit('player:sitIn', { entry }))}>
                  I&apos;m back
                </button>
              </>
            ) : (
              <button className="btn-secondary w-full" onClick={() => run(emit('player:sitOut', {}))}>
                Sit out next hand
              </button>
            )}
          </section>
        )}
        {cash && room > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">{mine.stack === 0 ? 'Rebuy' : 'Top up'}</h3>
            <input type="range" className="w-full accent-emerald-400" min={1} max={room} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <button className="btn-secondary w-full" onClick={() => run(emit('player:rebuy', { amount }))}>
              Add {chips(amount)} chips
            </button>
          </section>
        )}
        {t && t.rebuyOpen && (
          <button className="btn-secondary w-full" onClick={() => run(emit('player:rebuy', {}))}>
            Rebuy ({chips(view.room.config.tournament!.rebuy.chips)} chips)
          </button>
        )}
        {t && t.addOnOpen && !t.myAddOn && (
          <button className="btn-secondary w-full" onClick={() => run(emit('player:addOn', {}))}>
            Add-on ({chips(view.room.config.tournament!.addOn.chips)} chips)
          </button>
        )}
        <button
          className="btn-danger w-full"
          onClick={() => {
            const msg = cash ? `Leave the table and cash out ${chips(mine.stack)}?` : view.room.status === 'OPEN' ? 'Unregister from the tournament?' : 'Leave? You will be blinded out.';
            if (confirm(msg)) run(emit('player:leave', {}));
          }}
        >
          {cash ? 'Leave table' : view.room.status === 'OPEN' ? 'Unregister' : 'Leave'}
        </button>
      </div>
    </Modal>
  );
}
