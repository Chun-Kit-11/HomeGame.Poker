'use client';
import { useEffect, useState } from 'react';
import { type Unit, formatBB, useDisplay } from '@/lib/display';
import { chips } from '@/lib/format';

const toText = (amount: number, unit: Unit, bb: number) => (unit === 'bb' ? String(Math.round((amount / Math.max(1, bb)) * 100) / 100) : String(amount));

/**
 * Type a bet as big blinds or chips (tap the unit to switch). Works alongside the slider:
 * typing updates the amount, and moving the slider updates the text.
 */
export function BetAmountInput({
  amount,
  setAmount,
  min,
  max,
  bigBlind,
  className = '',
  size = 'lg',
}: {
  amount: number;
  setAmount: (n: number) => void;
  min: number;
  max: number;
  bigBlind: number;
  className?: string;
  size?: 'lg' | 'sm';
}) {
  const display = useDisplay();
  const [unit, setUnit] = useState<Unit>(display.unit);
  const [text, setText] = useState(() => toText(amount, unit, bigBlind));
  const [editing, setEditing] = useState(false);

  // Follow the slider / presets while not typing
  useEffect(() => {
    if (!editing) setText(toText(amount, unit, bigBlind));
  }, [amount, unit, bigBlind, editing]);

  const onType = (raw: string) => {
    const t = raw.replace(',', '.');
    if (!/^\d*\.?\d{0,2}$/.test(t)) return;
    setText(t);
    const v = Number(t);
    if (t === '' || !Number.isFinite(v)) return;
    setAmount(unit === 'bb' ? Math.round(v * bigBlind) : Math.floor(v));
  };
  const commit = () => {
    setEditing(false);
    setAmount(Math.min(max, Math.max(min, amount)));
  };
  const out = amount < min || amount > max;
  const h = size === 'lg' ? 'h-12 text-lg' : 'h-9 text-sm';

  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <div className={`flex items-stretch overflow-hidden rounded-xl bg-black/40 ring-1 ring-inset ${out ? 'ring-red-400/60' : 'ring-white/15 focus-within:ring-gold/60'}`}>
        <input
          aria-label={`Bet amount in ${unit === 'bb' ? 'big blinds' : 'chips'}`}
          className={`min-w-0 flex-1 bg-transparent px-2 text-center font-bold tabular outline-none ${h}`}
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onChange={(e) => onType(e.target.value)}
        />
        <button
          type="button"
          aria-label="Switch between big blinds and chips"
          className={`shrink-0 border-l border-white/10 px-2.5 text-[11px] font-extrabold uppercase tracking-wider transition ${unit === 'bb' ? 'bg-gold/15 text-gold' : 'bg-white/[0.06] text-white/70'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const next: Unit = unit === 'bb' ? 'chips' : 'bb';
            setUnit(next);
            setText(toText(amount, next, bigBlind));
          }}
        >
          {unit === 'bb' ? 'BB' : 'Chips'}
        </button>
      </div>
      <div className={`mt-0.5 truncate text-center text-[10px] tabular ${out ? 'text-red-300' : 'text-white/40'}`}>
        {out ? `${amount < min ? 'Min' : 'Max'} ${unit === 'bb' ? formatBB(amount < min ? min : max, bigBlind) : chips(amount < min ? min : max)}` : unit === 'bb' ? `= ${chips(amount)} chips` : `= ${formatBB(amount, bigBlind)}`}
      </div>
    </div>
  );
}
