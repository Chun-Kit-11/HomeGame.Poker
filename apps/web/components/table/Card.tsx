import { RANK_CHARS } from '@poker/engine';

const SUITS = ['♣', '♦', '♥', '♠'];
// Four-colour deck: easier to read on small screens.
const SUIT_COLORS = ['text-emerald-700', 'text-blue-600', 'text-red-600', 'text-slate-900'];

const SIZES = {
  xs: 'w-6 h-8 text-[10px] rounded',
  sm: 'w-8 h-11 text-xs rounded-md',
  md: 'w-11 h-15 text-base rounded-md',
  lg: 'w-14 h-20 text-xl rounded-lg',
};

export function PlayingCard({
  card,
  size = 'md',
  dim = false,
  highlight = false,
  className = '',
}: {
  card: number | null;
  size?: keyof typeof SIZES;
  dim?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  if (card === null) {
    return (
      <div
        className={`${SIZES[size]} deal-in border border-white/30 bg-[repeating-linear-gradient(45deg,#7f1d1d_0_4px,#991b1b_4px_8px)] shadow-md ${className}`}
        aria-label="face-down card"
      />
    );
  }
  const rank = RANK_CHARS[card >> 2];
  const suit = card & 3;
  return (
    <div
      className={`${SIZES[size]} deal-in flex select-none flex-col items-center justify-center bg-white font-bold leading-none shadow-md ${SUIT_COLORS[suit]} ${dim ? 'opacity-40' : ''} ${highlight ? 'ring-2 ring-amber-300' : ''} ${className}`}
      aria-label={`${rank === 'T' ? '10' : rank}${SUITS[suit]}`}
    >
      <span>{rank === 'T' ? '10' : rank}</span>
      <span className="text-[1.1em]">{SUITS[suit]}</span>
    </div>
  );
}
