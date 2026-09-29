'use client';
import { useState } from 'react';
import type { TableView } from '@poker/shared';
import { chips } from '@/lib/format';
import type { Emit } from '@/lib/useTable';

export function HostPanel({ view, emit, onError }: { view: TableView; emit: Emit; onError: (e: string) => void }) {
  const [sb, setSb] = useState(view.room.smallBlind);
  const [bb, setBb] = useState(view.room.bigBlind);
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (!r.ok) onError(r.error ?? 'Failed');
  };
  const status = view.room.status;
  const people = [
    ...view.seats.filter(Boolean).map((s) => ({ userId: s!.userId, username: s!.username, seated: true })),
    ...view.spectators.map((s) => ({ ...s, seated: false })),
  ].filter((p) => p.userId !== view.me.userId);

  return (
    <div className="space-y-4 p-3 text-sm">
      <section className="flex flex-wrap gap-2">
        {status === 'OPEN' && (
          <button className="btn-primary" onClick={() => run(emit('host:start', {}))}>
            Start game
          </button>
        )}
        {status === 'RUNNING' && (
          <button className="btn-secondary" onClick={() => run(emit('host:pause', {}))}>
            Pause
          </button>
        )}
        {status === 'PAUSED' && (
          <button className="btn-primary" onClick={() => run(emit('host:resume', {}))}>
            Resume
          </button>
        )}
        {status !== 'ENDED' && (
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('End the session for everyone? Players will be cashed out.')) run(emit('host:end', {}));
            }}
          >
            End session
          </button>
        )}
      </section>

      <section>
        <h3 className="mb-1 font-semibold">Requests</h3>
        {view.requests.length === 0 && <p className="text-xs text-white/50">No pending requests</p>}
        {view.requests.map((r) => (
          <div key={r.id} className="flex items-center gap-2 border-b border-white/5 py-1">
            <div className="flex-1">
              <b>{r.username}</b> · {r.kind === 'buyIn' ? 'buy-in' : r.kind} {chips(r.amount)}
            </div>
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => run(emit('host:deny', { requestId: r.id }))}>
              Deny
            </button>
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => run(emit('host:approve', { requestId: r.id }))}>
              Approve
            </button>
          </div>
        ))}
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={view.room.config.autoApprove} onChange={(e) => run(emit('host:setAutoApprove', { autoApprove: e.target.checked }))} />
          Auto-approve buy-ins and rebuys
        </label>
      </section>

      {view.room.gameMode === 'CASH' && status !== 'ENDED' && (
        <section>
          <h3 className="mb-1 font-semibold">Blinds (from next hand)</h3>
          <div className="flex items-center gap-2">
            <input className="input w-20 py-1" type="number" min={1} value={sb} onChange={(e) => setSb(Number(e.target.value))} />
            <span>/</span>
            <input className="input w-20 py-1" type="number" min={1} value={bb} onChange={(e) => setBb(Number(e.target.value))} />
            <button className="btn-secondary px-3 py-1" onClick={() => run(emit('host:setBlinds', { smallBlind: sb, bigBlind: bb }))}>
              Set
            </button>
          </div>
          {view.room.pendingBlinds && (
            <p className="mt-1 text-xs text-amber-300">
              Next hand: {view.room.pendingBlinds.smallBlind}/{view.room.pendingBlinds.bigBlind}
            </p>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-1 font-semibold">Players</h3>
        {people.length === 0 && <p className="text-xs text-white/50">Nobody else here yet</p>}
        {people.map((p) => (
          <div key={p.userId} className="flex items-center justify-between py-1">
            <span>
              {p.username} <span className="text-xs text-white/40">{p.seated ? 'seated' : 'watching'}</span>
            </span>
            <button
              className="text-xs text-red-400 underline"
              onClick={() => {
                if (confirm(`Remove ${p.username} from the room?`)) run(emit('host:kick', { userId: p.userId }));
              }}
            >
              Kick
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
