'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Close, SkipBack, SkipForward } from '@/components/ui/Icons';
import { api } from '@/lib/api';
import type { HandDetail } from '@/lib/handTypes';
import { HandHistoryView, type HistoryDisplay } from './HandHistoryView';
import { HistoryToolbar } from './HistoryToolbar';

/** Bottom sheet at the table: flip through this session's hands. */
export function HandHistorySheet({ roomCode, defaultBB, onClose, onMessage }: { roomCode: string; defaultBB: boolean; onClose: () => void; onMessage: (m: string) => void }) {
  const [ids, setIds] = useState<{ id: string; handNo: number }[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [cache, setCache] = useState<Record<string, HandDetail>>({});
  const [display, setDisplay] = useState<HistoryDisplay>({ bb: defaultBB, anonymous: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ hands: { id: string; handNo: number }[] }>(`/rooms/${roomCode}/hands`)
      .then((r) => {
        const asc = [...r.hands].reverse();
        setIds(asc);
        setIdx(Math.max(0, asc.length - 1));
      })
      .catch((e) => setError(e.message));
  }, [roomCode]);

  const current = ids?.[idx];
  useEffect(() => {
    if (!current || cache[current.id]) return;
    api<HandDetail>(`/hands/${current.id}`)
      .then((h) => setCache((c) => ({ ...c, [current.id]: h })))
      .catch((e) => setError(e.message));
  }, [current, cache]);
  const hand = current ? cache[current.id] : undefined;
  const nav = 'grid h-10 w-10 place-items-center rounded-xl text-white/80 transition active:scale-95 disabled:opacity-25';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="slide-up mt-auto flex h-[94dvh] flex-col rounded-t-3xl bg-[#0c0c0b] ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20" />
        <header className="relative flex items-center justify-center px-4 py-3">
          <h2 className="text-xl font-bold">Hand History</h2>
          <button className="icon-btn absolute right-4 h-9 w-9" onClick={onClose} aria-label="Close">
            <Close className="h-4 w-4" />
          </button>
        </header>
        <div className="flex items-center justify-between border-y border-white/[0.06] px-3 py-1.5">
          <div className="flex gap-1">
            <button className={nav} disabled={!ids || idx === 0} onClick={() => setIdx(0)} aria-label="First hand">
              <SkipBack />
            </button>
            <button className={nav} disabled={!ids || idx === 0} onClick={() => setIdx(idx - 1)} aria-label="Previous hand">
              <ChevronLeft />
            </button>
          </div>
          <div className="text-center text-sm tabular">
            {ids && ids.length > 0 ? (
              <>
                <b>{idx + 1}</b>/{ids.length}
                {current && <span className="ml-2 text-white/40">#{current.handNo}</span>}
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="flex gap-1">
            <button className={nav} disabled={!ids || idx >= ids.length - 1} onClick={() => setIdx(idx + 1)} aria-label="Next hand">
              <ChevronRight />
            </button>
            <button className={nav} disabled={!ids || idx >= ids.length - 1} onClick={() => setIdx(ids!.length - 1)} aria-label="Latest hand">
              <SkipForward />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="p-6 text-center text-red-300">{error}</p>}
          {ids?.length === 0 && <p className="p-10 text-center text-white/50">No hands played at this table yet.</p>}
          {hand ? <HandHistoryView hand={hand} display={display} /> : ids && ids.length > 0 && <p className="p-10 text-center text-white/40">Loading…</p>}
        </div>
        {hand && (
          <div className="border-t border-white/[0.06] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <HistoryToolbar hand={hand} display={display} setDisplay={setDisplay} onMessage={onMessage} />
          </div>
        )}
      </div>
    </div>
  );
}
