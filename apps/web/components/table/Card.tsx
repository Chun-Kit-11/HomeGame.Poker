import { RANK_CHARS } from '@poker/engine';

const SUITS = ['♣', '♦', '♥', '♠'];
// Four-colour deck: easy to read on small screens.
const SUIT_COLORS = ['text-[#16794f]', 'text-[#1d5fd1]', 'text-[#c8202e]', 'text-[#15171a]'];

const SIZES = {
  xs: { box: 'w-[22px] h-[30px] rounded-[4px]', rank: 'text-[11px]', suit: 'text-[10px]', corner: false },
  sm: { box: 'w-8 h-11 rounded-md', rank: 'text-[13px]', suit: 'text-[13px]', corner: false },
  md: { box: 'w-10 h-14 rounded-lg', rank: 'text-base', suit: 'text-xl', corner: true },
  lg: { box: 'w-[58px] h-[82px] rounded-[10px]', rank: 'text-[22px]', suit: 'text-[30px]', corner: true },
};

export function PlayingCard({
  card,
  size = 'md',
  dim = false,
  highlight = false,
  className = '',
  px,
}: {
  card: number | null;
  size?: keyof typeof SIZES;
  dim?: boolean;
  highlight?: boolean;
  className?: string;
  /** Exact card width in pixels (overrides size; everything scales with it) */
  px?: number;
}) {
  const s = SIZES[size];
  const style = px ? { width: px, height: Math.round(px * 1.4), borderRadius: Math.max(4, px * 0.14), fontSize: px * 0.46 } : undefined;
  const scaled = px !== undefined;
  if (card === null) {
    return (
      <div
        style={style}
        className={`${scaled ? '' : s.box} deal-in relative overflow-hidden bg-[#5b1220] shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-black/40 ${className}`}
        aria-label="face-down card"
      >
        <div className="absolute inset-[3px] rounded-[inherit] bg-[repeating-linear-gradient(45deg,rgba(227,193,115,0.18)_0_2px,transparent_2px_6px),repeating-linear-gradient(-45deg,rgba(227,193,115,0.18)_0_2px,transparent_2px_6px)] ring-1 ring-[#e3c173]/40" />
      </div>
    );
  }
  const rank = RANK_CHARS[card >> 2];
  const label = rank === 'T' ? '10' : rank;
  const suit = card & 3;
  return (
    <div
      style={style}
      className={`${scaled ? '' : s.box} deal-in relative select-none overflow-hidden bg-gradient-to-b from-white to-[#eceae4] font-display font-extrabold leading-none shadow-[0_4px_14px_rgba(0,0,0,0.45)] ${SUIT_COLORS[suit]} ${dim ? 'opacity-40' : ''} ${highlight ? 'ring-2 ring-gold shadow-[0_0_18px_rgba(227,193,115,0.6)]' : 'ring-1 ring-black/10'} ${className}`}
      aria-label={`${label}${SUITS[suit]}`}
    >
      {scaled ? (
        <>
          <span className="absolute left-[11%] top-[6%] text-[1em] tracking-tighter">{label}</span>
          <span className="absolute left-[12%] top-[40%] text-[0.62em]">{SUITS[suit]}</span>
          <span className="absolute bottom-[4%] right-[8%] text-[1.25em]">{SUITS[suit]}</span>
        </>
      ) : s.corner ? (
        <>
          <span className={`absolute left-[12%] top-[8%] ${s.rank} tracking-tighter`}>{label}</span>
          <span className={`absolute bottom-[6%] right-[10%] ${s.suit}`}>{SUITS[suit]}</span>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-[1px]">
          <span className={`${s.rank} tracking-tighter`}>{label}</span>
          <span className={s.suit}>{SUITS[suit]}</span>
        </div>
      )}
    </div>
  );
}

/** A small casino chip. */
export function Chip({ className = 'h-3.5 w-3.5', color = '#c8202e' }: { className?: string; color?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.6)] ${className}`}
      style={{ background: `repeating-conic-gradient(${color} 0 30deg, #f5f1e6 30deg 45deg)`, boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.15)' }}
    >
      <span className="block h-full w-full scale-[0.55] rounded-full" style={{ background: color }} />
    </span>
  );
}
