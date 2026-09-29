'use client';
import type { SeatView } from '@poker/shared';
import { useAmount } from '@/lib/display';
import { avatarColor } from '@/lib/format';
import { Plus } from '../ui/Icons';
import { PlayingCard } from './Card';
import { TimerRing, timerColor, useTimer } from './TimerRing';

function statusOf(seat: SeatView, fmt: (n: number) => string) {
  if (seat.won > 0) return { text: `+${fmt(seat.won)}`, cls: 'text-gold font-bold' };
  if (seat.handDescription && seat.cards !== 'hidden') return { text: seat.handDescription, cls: 'text-white/85' };
  if (seat.lastAction) return { text: seat.lastAction, cls: seat.lastAction === 'Fold' || seat.lastAction === 'Muck' ? 'text-white/40' : 'text-emerald-300' };
  if (seat.status === 'sittingOut') return { text: 'Away', cls: 'text-white/40' };
  if (seat.status === 'busted') return { text: 'Busted', cls: 'text-white/40' };
  if (seat.status === 'waitForBB') return { text: 'Waiting for BB', cls: 'text-white/40' };
  if (!seat.connected) return { text: 'Offline', cls: 'text-red-300/80' };
  if (seat.leaving) return { text: 'Leaving', cls: 'text-white/40' };
  return null;
}

export function Avatar({ name, size, ring }: { name: string; size: number; ring: string }) {
  return (
    <div
      className={`relative grid place-items-center rounded-full font-display font-bold text-white shadow-[0_8px_22px_rgba(0,0,0,0.6)] ${ring}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.3), transparent 55%), ${avatarColor(name)}`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** A player around the rail. `side` is where the table centre is, so cards fan that way. */
export function Seat({
  seat,
  isMe,
  isTurn,
  deadline,
  skew,
  usingBank,
  reaction,
  side,
  labelColor,
  onClick,
}: {
  seat: SeatView;
  isMe: boolean;
  isTurn: boolean;
  deadline: number | null;
  skew: number;
  usingBank: boolean;
  reaction: string | null;
  side: 'left' | 'right' | 'center';
  labelColor?: string | null;
  onClick?: () => void;
}) {
  const fmt = useAmount();
  const away = seat.status === 'sittingOut' || seat.status === 'busted' || !seat.connected;
  const cards = seat.cards;
  const winner = seat.won > 0;
  const status = statusOf(seat, fmt);
  const faceUp = Array.isArray(cards);
  const timer = useTimer(isTurn ? deadline : null, skew);

  return (
    <button type="button" onClick={onClick} className={`group relative flex w-[108px] flex-col items-center ${away && !seat.inHand ? 'opacity-55' : ''}`}>
      <div className="relative">
        <div className="relative">
          <Avatar name={seat.username} size={58} ring={isTurn ? 'ring-[3px] ring-emerald-300' : winner ? 'ring-[3px] ring-gold winner-glow' : isMe ? 'ring-[3px] ring-gold/70' : 'ring-[3px] ring-black/80'} />
          {isTurn && deadline && <TimerRing deadline={deadline} skew={skew} bank={usingBank} />}
          {isTurn && timer.secs !== null && (
            <div className="absolute inset-0 grid place-items-center rounded-full bg-black/75 font-display text-xl font-extrabold tabular" style={{ color: timerColor(timer.frac, usingBank) }}>
              {timer.secs}
            </div>
          )}
        </div>
        {seat.equity !== null && <EquityPill value={seat.equity} className={`absolute top-1 z-20 ${side === 'left' ? '-left-14' : '-right-14'}`} />}
        {cards === 'hidden' && (
          <div className={`absolute top-1 flex ${side === 'left' ? '-left-6' : '-right-6'} ${seat.folded ? 'opacity-0' : ''}`}>
            <PlayingCard card={null} px={26} className="-rotate-[8deg]" />
            <PlayingCard card={null} px={26} className="-ml-4 rotate-[6deg]" />
          </div>
        )}
        {faceUp && (
          <div className={`absolute -top-3 left-1/2 flex -translate-x-1/2 ${seat.folded ? 'opacity-30' : ''}`}>
            {(cards as number[]).map((c, i) => (
              <PlayingCard key={i} card={c} px={34} className={i === 0 ? '-rotate-[6deg]' : '-ml-2 rotate-[6deg]'} highlight={winner} />
            ))}
          </div>
        )}
        {reaction && <div className="reaction-pop absolute -top-9 left-1/2 text-3xl drop-shadow-lg">{reaction}</div>}
        {labelColor && <span className="absolute -left-1 top-0 z-20 h-4 w-4 rounded-full ring-2 ring-black" style={{ background: labelColor }} title="Your label" />}
      </div>
      <div
        className={`relative z-10 -mt-3 w-full rounded-xl px-2 pb-1.5 pt-1 text-center shadow-[0_10px_24px_-8px_rgba(0,0,0,0.9)] ring-1 ring-inset backdrop-blur-md ${
          isTurn ? 'bg-emerald-950/90 ring-emerald-300/60' : 'bg-[var(--plate)] ring-white/10'
        }`}
      >
        <div className="truncate text-[12px] font-medium leading-tight text-white/90">{seat.username}</div>
        <div className="text-[15px] font-bold leading-tight tabular text-[var(--stack)]">
          {seat.status === 'pending' ? <span className="text-[11px] font-medium text-white/50">Pending…</span> : seat.allIn ? <span className="text-gold">ALL-IN</span> : fmt(seat.stack)}
        </div>
        {isTurn && <TimeBar frac={timer.frac} bank={usingBank} />}
      </div>
      <div className={`mt-0.5 h-4 w-[118px] truncate text-center text-[11px] leading-4 ${status?.cls ?? ''}`}>{status?.text}</div>
    </button>
  );
}

/** Your own seat in portrait: big cards bottom-left with your stack and countdown. */
export function HeroSeat({
  seat,
  isTurn,
  deadline,
  skew,
  usingBank,
  isButton,
  reaction,
  onClick,
}: {
  seat: SeatView;
  isTurn: boolean;
  deadline: number | null;
  skew: number;
  usingBank: boolean;
  isButton: boolean;
  reaction: string | null;
  onClick: () => void;
}) {
  const fmt = useAmount();
  const timer = useTimer(isTurn ? deadline : null, skew);
  const secs = timer.secs;
  const cards = Array.isArray(seat.cards) ? seat.cards : null;
  const status = statusOf(seat, fmt);
  return (
    <button type="button" onClick={onClick} className="relative flex flex-col items-start" aria-label="Your seat options">
      <div className={`relative ml-1 flex ${seat.folded ? 'opacity-35 grayscale' : ''}`}>
        {cards ? (
          cards.map((c, i) => <PlayingCard key={i} card={c} px={62} highlight={seat.won > 0} className={i === 0 ? '-rotate-[4deg]' : '-ml-4 mt-1 rotate-[4deg]'} />)
        ) : (
          <div className="h-[87px]" />
        )}
        {seat.equity !== null && <EquityPill value={seat.equity} className="absolute -right-12 top-6 z-20" large />}
        {isButton && <div className="absolute -right-4 top-1 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-b from-white to-[#d9d6cc] font-display text-[11px] font-black text-black/80 shadow-md">D</div>}
        {reaction && <div className="reaction-pop absolute -top-8 left-1/2 text-3xl drop-shadow-lg">{reaction}</div>}
      </div>
      <div className="relative -mt-3 flex items-center">
        <div
          className={`z-10 w-[150px] rounded-xl px-3 pb-1.5 pt-1 text-center shadow-[0_12px_30px_-10px_rgba(0,0,0,0.9)] ring-1 ring-inset backdrop-blur-md ${
            isTurn ? 'bg-emerald-950/90 ring-emerald-300/60' : 'bg-[var(--plate)] ring-white/10'
          }`}
        >
          <div className={`h-4 truncate text-[11px] leading-4 ${status?.cls ?? 'text-white/50'}`}>{status?.text ?? seat.username}</div>
          <div className="font-display text-[22px] font-extrabold leading-tight tabular text-[var(--stack)]">{seat.allIn ? <span className="text-gold">ALL-IN</span> : fmt(seat.stack)}</div>
          {isTurn && <TimeBar frac={timer.frac} bank={usingBank} />}
        </div>
        {isTurn && secs !== null && (
          <div
            className={`z-20 -ml-3 grid h-12 w-12 place-items-center rounded-full font-display text-sm font-extrabold text-white shadow-lg ring-2 ${
              usingBank ? 'bg-amber-600 ring-amber-300' : secs <= 5 ? 'animate-pulse bg-red-600 ring-red-300' : 'bg-[#15130f] ring-gold/70'
            }`}
          >
            {secs}s
          </div>
        )}
      </div>
    </button>
  );
}

export function EmptySeat({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label="Take this seat"
      className="group grid h-12 w-12 place-items-center rounded-full bg-black/30 text-white/40 ring-1 ring-inset ring-white/15 transition enabled:hover:bg-gold/10 enabled:hover:text-gold enabled:hover:ring-gold/50 disabled:opacity-30"
    >
      {!disabled && <Plus className="h-4 w-4" />}
    </button>
  );
}

/** Draining countdown bar under a name plate: visible to everyone at the table. */
function TimeBar({ frac, bank }: { frac: number; bank: boolean }) {
  return (
    <div className="absolute inset-x-2 bottom-0.5 h-[4px] overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${frac * 100}%`, background: timerColor(frac, bank) }} />
    </div>
  );
}

/** Win percentage shown beside face-up cards during an all-in. */
export function EquityPill({ value, className = '', large = false }: { value: number; className?: string; large?: boolean }) {
  const pct = Math.round(value * 1000) / 10;
  const lead = value >= 0.5;
  return (
    <div
      className={`rounded-lg px-1.5 py-0.5 text-center font-display font-extrabold tabular shadow-lg ring-1 ${large ? 'text-base' : 'text-[12px]'} ${
        lead ? 'bg-emerald-500 text-black ring-emerald-200/60' : 'bg-black/85 text-white ring-white/20'
      } ${className}`}
    >
      {pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%
    </div>
  );
}
