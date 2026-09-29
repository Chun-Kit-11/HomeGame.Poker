'use client';
import type { SeatView } from '@poker/shared';
import { avatarColor, chips } from '@/lib/format';
import { Plus } from '../ui/Icons';
import { PlayingCard } from './Card';
import { TimerRing } from './TimerRing';

export function Seat({
  seat,
  isMe,
  isTurn,
  deadline,
  skew,
  usingBank,
  isButton,
  reaction,
  onClick,
}: {
  seat: SeatView;
  isMe: boolean;
  isTurn: boolean;
  deadline: number | null;
  skew: number;
  usingBank: boolean;
  isButton: boolean;
  reaction: string | null;
  onClick?: () => void;
}) {
  const away = seat.status === 'sittingOut' || seat.status === 'busted' || !seat.connected;
  const cards = seat.cards;
  const winner = seat.won > 0;
  const status = winner
    ? { text: `+${chips(seat.won)}`, cls: 'text-gold font-bold' }
    : seat.handDescription && seat.cards !== 'hidden'
      ? { text: seat.handDescription, cls: 'text-white/85' }
      : seat.lastAction
        ? { text: seat.lastAction, cls: seat.lastAction === 'Fold' || seat.lastAction === 'Muck' ? 'text-white/40' : 'text-emerald-300' }
        : seat.status === 'sittingOut'
          ? { text: 'Away', cls: 'text-white/40' }
          : seat.status === 'busted'
            ? { text: 'Busted', cls: 'text-white/40' }
            : seat.status === 'waitForBB'
              ? { text: 'Waiting for BB', cls: 'text-white/40' }
              : !seat.connected
                ? { text: 'Offline', cls: 'text-red-300/80' }
                : seat.leaving
                  ? { text: 'Leaving', cls: 'text-white/40' }
                  : null;

  return (
    <button type="button" onClick={onClick} className={`group relative flex w-[84px] flex-col items-center sm:w-[100px] ${away && !seat.inHand ? 'opacity-55' : ''}`}>
      <div className={`relative z-10 -mb-4 flex h-11 ${seat.folded ? 'opacity-25 grayscale' : ''}`}>
        {cards === 'hidden' && (
          <>
            <PlayingCard card={null} size="sm" className="-rotate-[7deg]" />
            <PlayingCard card={null} size="sm" className="-ml-3 rotate-[7deg]" />
          </>
        )}
        {Array.isArray(cards) &&
          cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" className={i === 0 ? '-rotate-[7deg]' : '-ml-2 rotate-[7deg]'} highlight={winner} />)}
      </div>
      <div className="relative">
        <div
          className={`relative grid h-12 w-12 place-items-center rounded-full font-display text-lg font-bold text-white shadow-[0_6px_18px_rgba(0,0,0,0.55)] sm:h-14 sm:w-14 ${
            isTurn ? 'ring-[3px] ring-emerald-300/90' : winner ? 'ring-[3px] ring-gold winner-glow' : isMe ? 'ring-2 ring-gold/60' : 'ring-2 ring-white/15'
          }`}
          style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 60%), ${avatarColor(seat.username)}` }}
        >
          {seat.username.slice(0, 1).toUpperCase()}
          {isTurn && deadline && <TimerRing deadline={deadline} skew={skew} bank={usingBank} />}
        </div>
        {isButton && (
          <div className="absolute -left-2.5 bottom-0 z-20 grid h-[22px] w-[22px] place-items-center rounded-full bg-gradient-to-b from-white to-[#d9d6cc] font-display text-[10px] font-black text-black/80 shadow-[0_2px_6px_rgba(0,0,0,0.6)] ring-1 ring-black/10">
            D
          </div>
        )}
        {reaction && <div className="reaction-pop absolute -top-9 left-1/2 text-3xl drop-shadow-lg">{reaction}</div>}
      </div>
      <div
        className={`z-10 -mt-2 w-full rounded-xl px-1.5 pb-1 pt-1.5 text-center shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8)] ring-1 ring-inset backdrop-blur-md ${
          isTurn ? 'bg-emerald-950/90 ring-emerald-300/50' : 'bg-[#0b0f0e]/85 ring-white/10'
        }`}
      >
        <div className="truncate text-[11px] font-semibold leading-tight text-white/90">{seat.username}</div>
        <div className="text-[13px] font-bold leading-tight tabular text-gold">
          {seat.status === 'pending' ? <span className="text-[11px] font-medium text-white/50">Pending…</span> : seat.allIn ? 'ALL-IN' : chips(seat.stack)}
        </div>
      </div>
      <div className={`mt-1 h-4 w-[160px] truncate text-center text-[10.5px] leading-4 ${status?.cls ?? ''}`}>{status?.text}</div>
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
      className="group grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white/35 ring-1 ring-inset ring-white/10 transition enabled:hover:bg-gold/10 enabled:hover:text-gold enabled:hover:ring-gold/50 disabled:opacity-40 sm:h-12 sm:w-12"
    >
      {!disabled && <Plus className="h-4 w-4" />}
    </button>
  );
}
