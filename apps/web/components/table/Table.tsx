'use client';
import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@poker/shared';
import { chips } from '@/lib/format';
import type { Reaction } from '@/lib/useTable';
import { PlayingCard } from './Card';
import { EmptySeat, Seat } from './Seat';

/** Seat positions around an ellipse, rotated so the viewer sits at the bottom. */
function layout(n: number, mySeat: number | null, landscape: boolean) {
  const rx = landscape ? 43 : 38;
  const ry = landscape ? 35 : 39;
  const anchor = mySeat ?? 0;
  return Array.from({ length: n }, (_, seat) => {
    const k = (seat - anchor + n) % n;
    const angle = Math.PI / 2 + (2 * Math.PI * k) / n; // bottom, then clockwise
    return { seat, x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
  });
}

/** Fits a table of the right aspect ratio into the available space. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, landscape: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const landscape = W / Math.max(1, H) > 1.1;
      const ratio = landscape ? 16 / 9 : 3 / 4;
      const w = Math.min(W, H * 0.94 * ratio, 1000);
      setSize({ w, h: w / ratio, landscape });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

export function Table({
  view,
  skew,
  reactions,
  onSeatClick,
  onPlayerClick,
}: {
  view: TableView;
  skew: number;
  reactions: Reaction[];
  onSeatClick: (seat: number) => void;
  onPlayerClick: (userId: string) => void;
}) {
  const { ref, w, h, landscape } = useFit();
  const hand = view.hand;
  const positions = layout(view.seats.length, view.me.seat, landscape);
  const canSit = view.me.seat === null && !view.me.pendingRequest && view.room.status !== 'ENDED' && (!view.tournament || view.tournament.lateRegOpen);

  return (
    <div ref={ref} className="grid h-full w-full place-items-center">
    <div className="relative" style={{ width: w, height: h }}>
      {/* felt */}
      <div className="absolute inset-[9%] rounded-[50%] border-[10px] border-[#3b2412] bg-[radial-gradient(ellipse_at_center,#15803d_0%,#0f5132_60%,#0a3a24_100%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.6),0_10px_30px_rgba(0,0,0,0.6)]" />

      {/* centre: pot + board */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {hand && hand.totalPot > 0 && (
          <div className="rounded-full bg-black/50 px-3 py-0.5 text-xs font-bold text-amber-200">
            Pot {chips(hand.totalPot)}
            {hand.pots.length > 1 && <span className="ml-1 font-normal text-white/60">({hand.pots.map((p) => chips(p.amount)).join(' + ')})</span>}
          </div>
        )}
        <div className="flex gap-1">
          {(hand?.board ?? []).map((c, i) => (
            <PlayingCard key={`${hand!.handNo}-${i}`} card={c} size={h > 420 ? 'lg' : 'md'} />
          ))}
        </div>
        {hand?.board2 && (
          <div className="flex gap-1">
            {hand.board2.map((c, i) => (
              <PlayingCard key={`b2-${i}`} card={c} size={h > 420 ? 'md' : 'sm'} dim={i < 3 && hand.board.length === 5 && hand.board2![i] === hand.board[i]} />
            ))}
          </div>
        )}
        {hand?.phase === 'complete' && hand.results.length > 0 && (
          <div className="max-w-[60vw] text-center text-xs text-amber-100">
            {hand.results
              .filter((r) => r.description)
              .slice(0, 3)
              .map((r, i) => (
                <div key={i}>
                  {view.seats[r.seat]?.username} wins {chips(r.amount)} — {r.description}
                  {hand.board2 ? ` (run ${r.run})` : ''}
                </div>
              ))}
          </div>
        )}
        {hand?.fair && (
          <div className="text-[10px] text-white/40">
            {hand.phase === 'complete' ? (
              <a className="underline" href={`/verify?room=${view.room.code}&n=${hand.handNo}`} target="_blank" rel="noreferrer">
                Hand #{hand.handNo} · verify shuffle
              </a>
            ) : (
              <span title={`SHA-256 of the server seed: ${hand.fair.serverSeedHash}`}>
                Hand #{hand.handNo} · 🔒 {hand.fair.serverSeedHash.slice(0, 10)}…
              </span>
            )}
          </div>
        )}
        {!hand && <div className="text-sm text-white/60">{view.notice ?? (view.room.status === 'OPEN' ? 'Waiting for the host to start' : '')}</div>}
        {hand?.phase === 'complete' && view.notice && <div className="text-xs text-white/50">{view.notice}</div>}
      </div>

      {/* seats */}
      {positions.map(({ seat, x, y }) => {
        const sv = view.seats[seat];
        const bet = sv?.streetBet ?? 0;
        // bet chips sit between the seat and the centre
        // Bet chips sit a fixed distance from the seat towards the centre (clear of the hole cards).
        const px = (x / 100) * w;
        const py = (y / 100) * h;
        const dx = w / 2 - px;
        const dy = h / 2 - py;
        const dist = Math.hypot(dx, dy) || 1;
        const step = Math.min(dist * 0.5, 90);
        const bx = ((px + (dx / dist) * step) / w) * 100;
        const by = ((py + (dy / dist) * step) / h) * 100;
        const reaction = sv ? ([...reactions].reverse().find((r) => r.userId === sv.userId)?.emoji ?? null) : null;
        return (
          <div key={seat}>
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
              {sv ? (
                <Seat
                  seat={sv}
                  isMe={sv.userId === view.me.userId}
                  isTurn={hand?.toAct === seat && hand.phase === 'betting'}
                  deadline={hand?.toAct === seat ? hand.deadline : null}
                  skew={skew}
                  usingBank={!!hand?.usingTimeBank}
                  isButton={hand?.buttonSeat === seat}
                  reaction={reaction}
                  onClick={() => onPlayerClick(sv.userId)}
                />
              ) : (
                <EmptySeat disabled={!canSit} onClick={() => onSeatClick(seat)} />
              )}
            </div>
            {bet > 0 && (
              <div className="chip-in absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${bx}%`, top: `${by}%` }}>
                <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-white bg-red-600" />
                  {chips(bet)}
                </div>
              </div>
            )}
            {hand?.buttonSeat === seat && !sv && (
              <div className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/70 text-[10px] font-black text-black" style={{ left: `${bx}%`, top: `${by}%` }}>
                D
              </div>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}
