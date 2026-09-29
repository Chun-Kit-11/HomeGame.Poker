'use client';
import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@poker/shared';
import { chips } from '@/lib/format';
import type { Reaction } from '@/lib/useTable';
import { Chip, PlayingCard } from './Card';
import { EmptySeat, Seat } from './Seat';

/** Seat positions around an ellipse, rotated so the viewer sits at the bottom. */
function layout(n: number, mySeat: number | null, landscape: boolean) {
  const rx = landscape ? 43 : 40;
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
      {/* rail + felt */}
      <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-b from-[#3d2b1d] via-[#23170f] to-[#150e08] p-[1.6%] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-[#e3c173]/25">
        <div className="relative h-full w-full overflow-hidden rounded-[50%] bg-[radial-gradient(ellipse_at_50%_38%,#2a8a62_0%,#176649_38%,#0e4a34_70%,#093325_100%)] shadow-[inset_0_0_60px_rgba(0,0,0,0.65),inset_0_0_0_2px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-[7%] rounded-[50%] border border-[#e3c173]/15" />
          <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:3px_3px]" />
          <div className="absolute left-1/2 top-[24%] -translate-x-1/2 select-none font-display text-[clamp(10px,2.2vw,15px)] font-extrabold uppercase tracking-[0.45em] text-white/[0.07]">
            Home Game
          </div>
        </div>
      </div>

      {/* centre: pot + board */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {hand && hand.totalPot > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1.5 pr-3 text-xs ring-1 ring-inset ring-white/10 backdrop-blur">
            <Chip className="h-4 w-4" color="#b8913f" />
            <span className="text-white/60">Pot</span>
            <span className="font-bold tabular text-gold">{chips(hand.totalPot)}</span>
            {hand.pots.length > 1 && <span className="tabular text-white/45">({hand.pots.map((p) => chips(p.amount)).join(' + ')})</span>}
          </div>
        )}
        <div className="flex gap-1">
          {(hand?.board ?? []).map((c, i) => (
            <PlayingCard key={`${hand!.handNo}-${i}`} card={c} size={w >= 560 && h > 380 ? 'lg' : 'md'} />
          ))}
        </div>
        {hand?.board2 && (
          <div className="flex gap-1">
            {hand.board2.map((c, i) => (
              <PlayingCard key={`b2-${i}`} card={c} size={w >= 560 && h > 380 ? 'md' : 'sm'} dim={i < 3 && hand.board.length === 5 && hand.board2![i] === hand.board[i]} />
            ))}
          </div>
        )}
        {hand?.phase === 'complete' && hand.results.length > 0 && (
          <div className="max-w-[60vw] rounded-xl bg-black/45 px-3 py-1.5 text-center text-xs font-medium text-gold/95 ring-1 ring-inset ring-gold/20 backdrop-blur">
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
              <a className="hover:text-gold" href={`/verify?room=${view.room.code}&n=${hand.handNo}`} target="_blank" rel="noreferrer">
                Hand #{hand.handNo} · verify shuffle ↗
              </a>
            ) : (
              <span title={`SHA-256 of the server seed: ${hand.fair.serverSeedHash}`}>
                Hand #{hand.handNo} · 🔒 {hand.fair.serverSeedHash.slice(0, 10)}…
              </span>
            )}
          </div>
        )}
        {!hand && (
          <div className="rounded-full bg-black/40 px-4 py-1.5 text-sm text-white/65 ring-1 ring-inset ring-white/10">
            {view.notice ?? (view.room.status === 'OPEN' ? 'Waiting for the host to start' : '')}
          </div>
        )}
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
                <div className="flex items-center gap-1.5 rounded-full bg-black/60 py-0.5 pl-0.5 pr-2 text-[11px] font-bold tabular text-white ring-1 ring-inset ring-white/10">
                  <Chip className="h-4 w-4" color={bet >= view.room.bigBlind * 10 ? '#1d4ed8' : bet >= view.room.bigBlind * 3 ? '#15803d' : '#c8202e'} />
                  {chips(bet)}
                </div>
              </div>
            )}
            {hand?.buttonSeat === seat && !sv && (
              <div className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-white to-[#d9d6cc] text-[10px] font-black text-black/80 opacity-70 shadow" style={{ left: `${bx}%`, top: `${by}%` }}>
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
