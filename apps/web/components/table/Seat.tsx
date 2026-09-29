'use client';
import type { SeatView } from '@poker/shared';
import { avatarColor, chips } from '@/lib/format';
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-[76px] flex-col items-center sm:w-[92px] ${away && !seat.inHand ? 'opacity-50' : ''}`}
    >
      {/* cards above avatar */}
      <div className={`relative z-10 -mb-3 flex h-11 gap-0.5 ${seat.folded ? 'opacity-30' : ''}`}>
        {cards === 'hidden' && (
          <>
            <PlayingCard card={null} size="sm" className="-rotate-6" />
            <PlayingCard card={null} size="sm" className="rotate-6" />
          </>
        )}
        {Array.isArray(cards) &&
          cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" className={i === 0 ? '-rotate-6' : 'rotate-6'} highlight={winner} />)}
      </div>
      <div className="relative">
        <div
          className={`relative grid h-12 w-12 place-items-center rounded-full border-2 text-lg font-bold text-white shadow-lg sm:h-14 sm:w-14 ${
            isTurn ? 'border-emerald-300' : winner ? 'border-amber-300 winner-glow' : isMe ? 'border-sky-300' : 'border-white/30'
          }`}
          style={{ background: avatarColor(seat.username) }}
        >
          {seat.username.slice(0, 1).toUpperCase()}
          {isTurn && deadline && <TimerRing deadline={deadline} skew={skew} bank={usingBank} />}
        </div>
        {isButton && (
          <div className="absolute -left-3 bottom-0 z-20 grid h-5 w-5 place-items-center rounded-full border border-black/20 bg-white text-[10px] font-black text-black shadow">D</div>
        )}
        {reaction && <div className="reaction-pop absolute -top-8 left-1/2 -translate-x-1/2 text-3xl">{reaction}</div>}
      </div>
      <div className={`z-10 -mt-1 w-full rounded-md px-1 py-0.5 text-center shadow ${isTurn ? 'bg-emerald-900/95' : 'bg-black/80'}`}>
        <div className="truncate text-[11px] font-semibold leading-tight">{seat.username}</div>
        <div className="text-xs font-bold leading-tight text-amber-300">
          {seat.status === 'pending' ? 'Pending…' : seat.allIn ? 'ALL-IN' : chips(seat.stack)}
        </div>
      </div>
      <div className="mt-0.5 h-4 text-[10px] leading-4">
        {winner ? (
          <span className="font-bold text-amber-300">+{chips(seat.won)}</span>
        ) : seat.handDescription && seat.cards !== 'hidden' ? (
          <span className="text-white/80">{seat.handDescription}</span>
        ) : seat.lastAction ? (
          <span className="text-white/70">{seat.lastAction}</span>
        ) : seat.status === 'sittingOut' ? (
          <span className="text-white/50">Sitting out</span>
        ) : seat.status === 'busted' ? (
          <span className="text-white/50">Busted</span>
        ) : seat.status === 'waitForBB' ? (
          <span className="text-white/50">Waiting for BB</span>
        ) : !seat.connected ? (
          <span className="text-red-300/80">Offline</span>
        ) : seat.leaving ? (
          <span className="text-white/50">Leaving</span>
        ) : null}
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
      className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-white/25 text-[10px] text-white/50 enabled:hover:border-emerald-400 enabled:hover:text-emerald-300 sm:h-14 sm:w-14"
    >
      {disabled ? '' : 'Sit'}
    </button>
  );
}
