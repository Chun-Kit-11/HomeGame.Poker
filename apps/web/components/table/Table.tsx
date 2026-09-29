'use client';
import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@poker/shared';
import { useAmount, useTheme } from '@/lib/display';
import type { Reaction } from '@/lib/useTable';
import { Chip, PlayingCard } from './Card';
import { EmptySeat, HeroSeat, Seat } from './Seat';
import { TableSurface } from './TableSurface';
import { useCountdown } from './TimerRing';

type Pt = { x: number; y: number };

/**
 * Portrait seat positions (percent of the table box) for the OTHER players,
 * clockwise from the viewer: up the left rail, across the top, down the right.
 * Hand-tuned so seats never cover the board, the viewer's cards or the controls.
 */
const PORTRAIT: Record<number, [number, number][]> = {
  1: [[50, 8]],
  2: [[13, 35], [87, 35]],
  3: [[13, 35], [50, 8], [87, 35]],
  4: [[13, 66], [14, 22], [86, 22], [87, 66]],
  5: [[13, 66], [13, 33], [50, 8], [87, 33], [87, 66]],
  6: [[13, 66], [13, 36], [28, 8], [72, 8], [87, 36], [87, 66]],
  7: [[13, 66], [13, 36], [15, 20], [50, 7], [85, 20], [87, 36], [87, 66]],
  8: [[13, 66], [13, 37], [14, 21], [31, 7], [69, 7], [86, 21], [87, 37], [87, 66]],
};

function seatPositions(n: number, anchor: number, portrait: boolean, heroSeated: boolean): (Pt | null)[] {
  const out: (Pt | null)[] = new Array(n).fill(null);
  for (let seat = 0; seat < n; seat++) {
    const k = (seat - anchor + n) % n;
    if (portrait) {
      if (k === 0) {
        out[seat] = heroSeated ? null : { x: 50, y: 84 };
        continue;
      }
      const slots = PORTRAIT[n - 1] ?? PORTRAIT[8];
      const [x, y] = slots[k - 1] ?? [50, 50];
      out[seat] = { x, y };
    } else {
      // Horizontal stadium: evenly around an ellipse, viewer at the bottom centre
      const angle = Math.PI / 2 + (2 * Math.PI * k) / n;
      out[seat] = { x: 50 + 44 * Math.cos(angle), y: 50 + 39 * Math.sin(angle) };
    }
  }
  return out;
}

/** Fits the table box into the available space. Portrait = tall stadium filling the height. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, portrait: true });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const portrait = W / Math.max(1, H) < 0.9;
      if (portrait) {
        const w = Math.min(W, H * 0.62, 560);
        setSize({ w, h: H, portrait });
      } else {
        const w = Math.min(W, H * 1.7, 1100);
        setSize({ w, h: w / 1.7, portrait });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : n.toLocaleString('en-US'));

export function Table({
  view,
  skew,
  reactions,
  onSeatClick,
  onPlayerClick,
  controls,
  onLayout,
  labels = {},
}: {
  view: TableView;
  skew: number;
  reactions: Reaction[];
  onSeatClick: (seat: number) => void;
  onPlayerClick: (userId: string) => void;
  /** Portrait: action controls drawn over the bottom of the table */
  controls?: React.ReactNode;
  /** Tells the page which layout is in use */
  onLayout?: (portrait: boolean) => void;
  /** My colour labels for players (userId -> colour) */
  labels?: Record<string, string | null>;
}) {
  const { ref, w, h, portrait } = useFit();
  useEffect(() => onLayout?.(portrait), [portrait, onLayout]);
  const theme = useTheme();
  const fmt = useAmount();
  const hand = view.hand;
  const heroSeat = view.me.seat;
  const heroSeated = heroSeat !== null;
  const positions = seatPositions(view.seats.length, heroSeat ?? 0, portrait, heroSeated);
  const canSit = view.me.seat === null && !view.me.pendingRequest && view.room.status !== 'ENDED' && (!view.tournament || view.tournament.lateRegOpen);
  const reactionFor = (uid: string) => [...reactions].reverse().find((r) => r.userId === uid)?.emoji ?? null;
  // Big, readable community cards: phones first
  const cardPx = Math.round(Math.min(portrait ? 80 : 88, w * (portrait ? 0.168 : 0.076), portrait ? h * 0.085 : h * 0.17));
  // Seats keep a fixed design size and are scaled to the table so small screens stay uncluttered
  const seatScale = portrait ? Math.min(0.95, w / 400) : Math.max(0.55, Math.min(1, h / 520));
  const boardY = portrait ? 50.5 : 50;
  const collected = hand && hand.phase !== 'complete' ? hand.pots.reduce((t, p) => t + p.amount, 0) : 0;
  const hero = heroSeated ? view.seats[heroSeat!] : null;

  return (
    <div ref={ref} className="relative grid h-full w-full place-items-center">
      <div className="relative" style={{ width: w, height: h }}>
        {/* Rail + felt: a stadium (pill) shape in the chosen design */}
        <TableSurface
          theme={theme}
          pad={Math.round(w * 0.022)}
          crestPx={Math.round(Math.min(w * (portrait ? 0.52 : 0.28), h * 0.4))}
          className={`absolute ${portrait ? 'inset-x-[5%] bottom-[3%] top-[2%]' : 'inset-x-[6%] inset-y-[9%]'}`}
        />

        {/* Printed on the felt */}
        <FeltInfo view={view} skew={skew} portrait={portrait} compact={!portrait && h < 440} scale={portrait ? 1 : Math.max(0.75, Math.min(1, h / 480))} />

        {/* Total pot above the board */}
        {hand && hand.totalPot > 0 && portrait && (
          <div className="absolute left-1/2 z-[5] -translate-x-1/2 -translate-y-full" style={{ top: `calc(${boardY}% - ${Math.round(cardPx * 0.7) + 8}px)` }}>
            <div className="flex flex-col items-center rounded-xl bg-black/35 px-3 py-0.5 ring-1 ring-inset ring-white/10 backdrop-blur">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">Total</span>
              <span className="-mt-0.5 text-sm font-bold tabular text-gold">{fmt(hand.totalPot)}</span>
            </div>
          </div>
        )}

        {/* The board, pinned to the centre */}
        <div className="absolute left-1/2 z-[5] flex -translate-x-1/2 -translate-y-1/2 gap-1.5" style={{ top: `${boardY}%`, minHeight: Math.round(cardPx * 1.4) }}>
          {(hand?.board ?? []).map((c, i) => (
            <PlayingCard key={`${hand!.handNo}-${i}`} card={c} px={cardPx} />
          ))}
          {!hand && view.notice && (
            <div className="self-center whitespace-nowrap rounded-full bg-black/40 px-4 py-1.5 text-sm text-white/70 ring-1 ring-inset ring-white/10">{view.notice}</div>
          )}
        </div>

        {/* Below the board: second run, pots, results */}
        <div className="absolute left-1/2 z-[5] flex -translate-x-1/2 flex-col items-center gap-1.5" style={{ top: `calc(${boardY}% + ${Math.round(cardPx * 0.7) + 8}px)` }}>
          {hand?.board2 && (
            <div className="flex gap-1.5">
              {hand.board2.map((c, i) => (
                <PlayingCard key={`b2-${i}`} card={c} px={Math.round(cardPx * 0.7)} dim={i < 3 && hand.board.length === 5 && hand.board2![i] === hand.board[i]} />
              ))}
            </div>
          )}
          {(collected > 0 || (!portrait && hand && hand.totalPot > 0)) && (
            <div className="flex items-center gap-2">
              {!portrait && hand && hand.totalPot > 0 && (
                <span className="rounded-lg bg-black/40 px-2.5 py-0.5 text-xs text-white/60 ring-1 ring-inset ring-white/10">
                  Total <b className="tabular text-gold">{fmt(hand.totalPot)}</b>
                </span>
              )}
              {collected > 0 && (
                <>
                  <span className="rounded-lg bg-black/40 px-2.5 py-0.5 text-sm font-semibold tabular text-white/90">{hand!.pots.map((p) => fmt(p.amount)).join(' · ')}</span>
                  <span className="flex -space-x-1.5">
                    <Chip className="h-5 w-5" color="#1d4ed8" />
                    <Chip className="h-5 w-5" color="#c8202e" />
                    <Chip className="h-5 w-5" color="#15803d" />
                  </span>
                </>
              )}
            </div>
          )}
          {hand?.phase === 'complete' && <Results view={view} />}
        </div>

        {/* Seats, bets and the dealer button */}
        {positions.map((pt, seat) => {
          const sv = view.seats[seat];
          const isHeroSlot = pt === null;
          // Where this seat "is" for bets/dealer button: the hero sits at the bottom centre in portrait
          const anchor = pt ?? { x: 50, y: 78 };
          const px = (anchor.x / 100) * w;
          const py = (anchor.y / 100) * h;
          const dx = w / 2 - px;
          const dy = (h * boardY) / 100 - py;
          const dist = Math.hypot(dx, dy) || 1;
          const along = (step: number, perp = 0) => ({
            left: `${((px + (dx / dist) * step - (dy / dist) * perp) / w) * 100}%`,
            top: `${((py + (dy / dist) * step + (dx / dist) * perp) / h) * 100}%`,
          });
          // Portrait: bets and the dealer button sit right beside the player, on the table side
          const pos = (p: Pt) => ({ left: `${p.x}%`, top: `${p.y}%` });
          const betAt = !portrait
            ? along(92)
            : isHeroSlot
              ? pos({ x: 62, y: 72 })
              : anchor.y < 15
                ? pos({ x: anchor.x, y: anchor.y + 12 })
                : anchor.x < 40
                  ? pos({ x: anchor.x + 24, y: anchor.y + 2 })
                  : anchor.x > 60
                    ? pos({ x: anchor.x - 24, y: anchor.y + 2 })
                    : pos({ x: 50, y: anchor.y - 12 });
          const dealerAt = !portrait
            ? along(64, 34)
            : anchor.y < 15
              ? pos({ x: anchor.x + (anchor.x < 50 ? 17 : -17), y: anchor.y + 2 })
              : anchor.x < 40
                ? pos({ x: anchor.x + 16, y: anchor.y - 6 })
                : anchor.x > 60
                  ? pos({ x: anchor.x - 16, y: anchor.y - 6 })
                  : pos({ x: anchor.x - 17, y: anchor.y - 4 });
          const bet = sv?.streetBet ?? 0;
          const isButton = hand?.buttonSeat === seat;
          const side = anchor.x < 40 ? 'right' : anchor.x > 60 ? 'left' : 'center';
          return (
            <div key={seat}>
              {!isHeroSlot && (
                <div
                  className="absolute z-10"
                  style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, transform: `translate(-50%, -50%) scale(${seatScale})` }}
                >
                  {sv ? (
                    <Seat
                      seat={sv}
                      isMe={sv.userId === view.me.userId}
                      isTurn={hand?.toAct === seat && hand.phase === 'betting'}
                      deadline={hand?.toAct === seat ? hand.deadline : null}
                      skew={skew}
                      usingBank={!!hand?.usingTimeBank}
                      reaction={reactionFor(sv.userId)}
                      side={side}
                      labelColor={labels[sv.userId] ?? null}
                      onClick={() => onPlayerClick(sv.userId)}
                    />
                  ) : (
                    <EmptySeat disabled={!canSit} onClick={() => onSeatClick(seat)} />
                  )}
                </div>
              )}
              {bet > 0 && (
                <div className="chip-in absolute z-20 -translate-x-1/2 -translate-y-1/2" style={betAt}>
                  <div className="flex items-center gap-1.5 rounded-full bg-black/55 py-0.5 pl-0.5 pr-2.5 text-[12px] font-bold tabular text-white ring-1 ring-inset ring-white/10">
                    <Chip className="h-[18px] w-[18px]" color={bet >= view.room.bigBlind * 10 ? '#1d4ed8' : bet >= view.room.bigBlind * 3 ? '#15803d' : '#c8202e'} />
                    {fmt(bet)}
                  </div>
                </div>
              )}
              {isButton && !isHeroSlot && (
                <div
                  className="absolute z-20 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-white to-[#d9d6cc] font-display text-[11px] font-black text-black/80 shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                  style={dealerAt}
                >
                  D
                </div>
              )}
            </div>
          );
        })}

        {/* Portrait: my cards bottom-left and the controls */}
        {portrait && hero && (
          <div className="absolute bottom-[68px] left-[3%] z-30">
            <HeroSeat
              seat={hero}
              isTurn={hand?.toAct === heroSeat && hand?.phase === 'betting'}
              deadline={hand?.toAct === heroSeat ? (hand?.deadline ?? null) : null}
              skew={skew}
              usingBank={!!hand?.usingTimeBank}
              isButton={hand?.buttonSeat === heroSeat}
              reaction={reactionFor(hero.userId)}
              onClick={() => onPlayerClick(hero.userId)}
            />
          </div>
        )}
        {portrait && controls}
      </div>
    </div>
  );
}

/** Table name, blinds, level clock and tournament details printed on the felt. */
function FeltInfo({ view, skew, portrait, scale, compact: oneLine }: { view: TableView; skew: number; portrait: boolean; scale: number; compact: boolean }) {
  const t = view.tournament;
  const secs = useCountdown(t?.levelEndsAt ?? null, skew);
  const levelMs = view.room.config.tournament ? view.room.config.tournament.levelMinutes * 60_000 : 0;
  const clock = (ms: number | null) => {
    if (ms === null) return '--:--';
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${hh ? `${String(hh).padStart(2, '0')}:` : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  const remaining = t ? (t.levelEndsAt !== null ? (secs ?? 0) * 1000 : t.levelRemainingMs) : null;
  const lateRegMs = t && t.lateRegOpen && view.room.status !== 'OPEN' && remaining !== null ? remaining + Math.max(0, (view.room.config.tournament!.lateRegLevels - t.level) * levelMs) : null;
  const myRank = (() => {
    if (!t || view.me.seat === null) return null;
    const stacks = view.seats.filter((s) => s && s.status !== 'pending').map((s) => s!.stack);
    const mine = view.seats[view.me.seat]?.stack ?? 0;
    return `${stacks.filter((x) => x > mine).length + 1}/${t.remaining}`;
  })();
  const b = view.room;
  const blinds = `${compact(b.smallBlind)}/${compact(b.bigBlind)}${b.ante ? ` (${compact(b.ante)})` : ''}`;

  if (oneLine) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-[29%] w-[56%] -translate-x-1/2 truncate text-center text-[11px] text-white/55">
        Blinds {blinds}
        {t && view.room.status !== 'OPEN' && !t.finished && ` [${clock(remaining)}]`}
        {t && lateRegMs !== null && ` · Late reg ${clock(lateRegMs)}`}
        {t && view.room.status !== 'OPEN' && ` · ${myRank ? `Rank ${myRank}` : `${t.remaining} left`}`}
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute left-1/2 flex w-[50%] flex-col items-center text-center leading-snug text-white/55"
      style={{ top: portrait ? '23%' : '24%', transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
    >
      <div className="max-w-full truncate text-[13px] font-semibold text-white/70">{view.room.name}</div>
      <div className="mt-1 text-[12px]">
        Blinds {blinds}
        {t && view.room.status !== 'OPEN' && !t.finished && <span className="tabular"> [{clock(remaining)}]</span>}
      </div>
      {t && lateRegMs !== null && <div className="text-[12px] tabular">Late reg {clock(lateRegMs)}</div>}
      {t && view.room.moneyMode === 'LEDGER' && t.prizePool > 0 && (
        <div className="text-[12px]">
          Prize pool {view.room.config.ledger?.currency} {(t.prizePool / 100).toFixed(2)}
        </div>
      )}
      {t && view.room.status !== 'OPEN' && (
        <div className="text-[12px]">
          {myRank ? `My rank ${myRank}` : `${t.remaining}/${t.entrants} left`} · Level {t.level}
        </div>
      )}
      {!t && view.room.config.cash?.runItTwice && <div className="text-[11px] text-white/35">Run it twice allowed</div>}
    </div>
  );
}

/** After a hand: a link to verify the shuffle. Winners light up on their own seats. */
function Results({ view }: { view: TableView }) {
  const hand = view.hand!;
  if (!hand.fair) return null;
  return (
    <a className="text-[10px] text-white/40 hover:text-gold" href={`/verify?room=${view.room.code}&n=${hand.handNo}`} target="_blank" rel="noreferrer">
      Hand #{hand.handNo} · verify shuffle ↗
    </a>
  );
}
