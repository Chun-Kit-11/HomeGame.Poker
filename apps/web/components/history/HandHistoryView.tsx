'use client';
import { useMemo } from 'react';
import { PlayingCard, Chip } from '@/components/table/Card';
import { Avatar } from '@/components/table/Seat';
import { formatBB } from '@/lib/display';
import { chips } from '@/lib/format';
import { type ColumnItem, buildColumns, winnings } from '@/lib/handColumns';
import type { HandDetail } from '@/lib/handTypes';

export interface HistoryDisplay {
  bb: boolean;
  anonymous: boolean;
}

const STREET_LABEL = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River' } as const;

/** Final table + street-by-street columns (actions, win %, results), phone-first. */
export function HandHistoryView({ hand, display }: { hand: HandDetail; display: HistoryDisplay }) {
  const bySeat = useMemo(() => new Map(hand.players.map((p) => [p.seat, p])), [hand]);
  const columns = useMemo(() => buildColumns(hand), [hand]);
  const won = useMemo(() => winnings(hand), [hand]);
  const fmt = (n: number) => (display.bb ? formatBB(n, hand.bigBlind) : chips(n));
  const nameOf = (seat: number) => {
    const p = bySeat.get(seat);
    if (!p) return `Seat ${seat + 1}`;
    if (display.anonymous && seat !== hand.mySeat) return `Player ${p.position}`;
    return p.username;
  };

  return (
    <div className="space-y-0">
      <MiniTable hand={hand} won={won} fmt={fmt} nameOf={nameOf} />
      <div className="flex justify-center gap-6 bg-white/[0.05] py-2.5 text-sm text-white/70">
        {hand.ante > 0 && <span>Ante: {fmt(hand.ante)}</span>}
        <span>SB: {fmt(hand.smallBlind)}</span>
        <span>BB: {fmt(hand.bigBlind)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 px-1.5 pb-4 pt-3">
        {columns.map((c) => (
          <div key={c.street} className="flex min-w-0 flex-col gap-1.5">
            <div className="text-center text-[13px] font-semibold text-white/70">{STREET_LABEL[c.street]}</div>
            <div className="flex h-8 items-center justify-center">
              {c.pot !== null && <span className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[13px] font-bold tabular text-white/90">{fmt(c.pot)}</span>}
            </div>
            {c.items.map((it, i) => (
              <Item key={i} item={it} hand={hand} fmt={fmt} nameOf={nameOf} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ position }: { position: string }) {
  return (
    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[8px] font-extrabold leading-[11px] text-black shadow">{position}</span>
  );
}

function Item({ item, hand, fmt, nameOf }: { item: ColumnItem; hand: HandDetail; fmt: (n: number) => string; nameOf: (s: number) => string }) {
  const player = (seat: number) => hand.players.find((p) => p.seat === seat);
  const box = 'rounded-lg bg-white/[0.045] p-1.5 ring-1 ring-inset ring-white/[0.06]';
  if (item.kind === 'blinds') {
    return (
      <div className={`${box} text-center`}>
        <div className="text-[11px] text-white/60">Blinds + Ante</div>
        <div className="text-[13px] font-bold tabular">{fmt(item.amount)}</div>
      </div>
    );
  }
  if (item.kind === 'action') {
    const p = player(item.seat);
    return (
      <div className={box}>
        <div className="truncate text-[10.5px] text-white/65">{nameOf(item.seat)}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="relative shrink-0">
            <Avatar name={p?.username ?? '?'} size={24} ring="ring-1 ring-black/60" />
            {p && <Badge position={p.position} />}
          </div>
          <div className={`min-w-0 leading-tight ${item.label === 'Fold' ? 'text-white/50' : ''}`}>
            <div className="text-[12px] font-semibold">{item.label}</div>
            {item.amount !== null && <div className="truncate text-[11px] tabular text-white/85">{fmt(item.amount)}</div>}
          </div>
        </div>
        {item.allIn && <div className="mt-1 rounded bg-red-600/90 py-0.5 text-center text-[10px] font-bold">All-in</div>}
      </div>
    );
  }
  if (item.kind === 'hands') {
    const best = Math.max(...item.entries.map((e) => e.equity));
    return (
      <>
        {item.entries.map((e) => (
          <div key={e.seat} className={box}>
            <div className="truncate text-[10.5px] text-white/65">{nameOf(e.seat)}</div>
            <div className="mt-1 flex items-center gap-1">
              <div className="relative shrink-0">
                <Avatar name={player(e.seat)?.username ?? '?'} size={22} ring="ring-1 ring-black/60" />
                {player(e.seat) && <Badge position={player(e.seat)!.position} />}
              </div>
              {e.cards.map((c, i) => (
                <PlayingCard key={i} card={c} px={19} />
              ))}
            </div>
            <div className={`mt-1 rounded py-0.5 text-center text-[12px] font-bold tabular ${e.equity === best ? 'bg-emerald-500/20 text-emerald-300' : 'bg-black/30 text-white/80'}`}>
              {Math.round(e.equity * 100)}%
            </div>
          </div>
        ))}
      </>
    );
  }
  // result
  const p = player(item.seat);
  return (
    <div className={box}>
      <div className="truncate text-[10.5px] text-white/65">{nameOf(item.seat)}</div>
      <div className="mt-1 flex items-center gap-1">
        <div className="relative shrink-0">
          <Avatar name={p?.username ?? '?'} size={22} ring="ring-1 ring-black/60" />
          {p && <Badge position={p.position} />}
        </div>
        {item.cards ? item.cards.map((c, i) => <PlayingCard key={i} card={c} px={19} />) : [0, 1].map((i) => <CardBack key={i} />)}
      </div>
      <div className={`mt-1 text-center text-[12px] font-bold tabular ${item.net > 0 ? 'text-gold' : item.net < 0 ? 'text-red-400' : 'text-white/60'}`}>
        {item.net > 0 ? '+' : ''}
        {fmt(item.net)}
      </div>
    </div>
  );
}

function CardBack() {
  return <div className="h-[27px] w-[19px] rounded-[3px] bg-white/10 ring-1 ring-inset ring-white/15 [background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.08)_0_2px,transparent_2px_5px)]" />;
}

/** The table at the end of the hand: stacks, shown cards, board, pot and winners. */
function MiniTable({ hand, won, fmt, nameOf }: { hand: HandDetail; won: Map<number, number>; fmt: (n: number) => string; nameOf: (s: number) => string }) {
  const seats = hand.players.map((p) => p.seat);
  const anchor = hand.mySeat ?? seats[0];
  const n = Math.max(seats.length, 2);
  const order = [...seats].sort((a, b) => ((a - anchor + 100) % 100) - ((b - anchor + 100) % 100));
  const total = hand.potTotal;
  return (
    <div className="relative mx-auto aspect-[1.3] w-full max-w-xl bg-[radial-gradient(ellipse_at_50%_40%,rgba(227,193,115,0.08),transparent_70%)]">
      <div className="absolute inset-x-[7%] inset-y-[18%] rounded-[50%] p-[1.6%] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]" style={{ background: 'linear-gradient(180deg,#f6e3a8,#b8913f 45%,#4a360e)' }}>
        <div className="h-full w-full rounded-[50%] shadow-[inset_0_0_40px_rgba(0,0,0,0.7)]" style={{ background: 'radial-gradient(ellipse at 50% 40%, #2b2a27, #0e0d0c 80%)' }}>
          <div className="absolute inset-[9%] rounded-[50%] border border-[#e3c173]/30" />
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
        <div className="text-[12px] text-gold">
          Total pot: <b className="tabular">{fmt(total)}</b>
        </div>
        <div className="flex gap-1">
          {hand.board.board.map((c, i) => (
            <PlayingCard key={i} card={c} px={40} />
          ))}
        </div>
        {hand.board.board2 && (
          <div className="flex gap-1">
            {hand.board.board2.map((c, i) => (
              <PlayingCard key={i} card={c} px={26} />
            ))}
          </div>
        )}
      </div>
      {order.map((seat, k) => {
        const p = hand.players.find((x) => x.seat === seat)!;
        const angle = Math.PI / 2 + (2 * Math.PI * k) / n;
        const x = 50 + 42 * Math.cos(angle);
        const y = 52 + 33 * Math.sin(angle);
        const w = won.get(seat) ?? 0;
        return (
          <div key={seat} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className="relative">
              <Avatar name={p.username} size={34} ring={w > 0 ? 'ring-2 ring-gold' : 'ring-2 ring-black/70'} />
              {p.holeCards && (p.shown || seat === hand.mySeat) && (
                <div className="absolute -top-2 left-1/2 flex -translate-x-1/2">
                  {p.holeCards.map((c, i) => (
                    <PlayingCard key={i} card={c} px={21} className={i ? '-ml-1 rotate-6' : '-rotate-6'} />
                  ))}
                </div>
              )}
              {hand.config.buttonSeat === seat && (
                <span className="absolute -right-3 top-0 grid h-4 w-4 place-items-center rounded-full bg-white text-[8px] font-black text-black">D</span>
              )}
            </div>
            <div className="-mt-1.5 min-w-[72px] rounded-md bg-black/85 px-1.5 py-0.5 text-center ring-1 ring-white/10">
              <div className="max-w-[80px] truncate text-[10px] text-white/85">{nameOf(seat)}</div>
              <div className="text-[11px] font-bold tabular text-[#e8c77a]">{fmt(p.endStack)}</div>
            </div>
            {w > 0 && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-gold">
                <Chip className="h-3 w-3" color="#b8913f" /> Winner
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
