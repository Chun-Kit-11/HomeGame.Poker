'use client';
import { Download, Incognito, Share } from '@/components/ui/Icons';
import { handToText } from '@/lib/handColumns';
import type { HandDetail } from '@/lib/handTypes';
import type { HistoryDisplay } from './HandHistoryView';

/** Download / share / BB / hide-names buttons for a hand. */
export function HistoryToolbar({
  hand,
  display,
  setDisplay,
  onMessage,
}: {
  hand: HandDetail;
  display: HistoryDisplay;
  setDisplay: (d: HistoryDisplay) => void;
  onMessage: (m: string) => void;
}) {
  const nameOf = (seat: number) => {
    const p = hand.players.find((x) => x.seat === seat);
    if (!p) return `Seat ${seat + 1}`;
    return display.anonymous && seat !== hand.mySeat ? `Player ${p.position}` : p.username;
  };
  const btn = 'grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10 transition active:scale-95';
  return (
    <div className="flex justify-center gap-4">
      <button
        className={btn}
        title="Download"
        onClick={() => {
          const blob = new Blob([handToText(hand, nameOf)], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `hand-${hand.room.code}-${hand.handNo}.txt`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        <Download className="h-6 w-6" />
      </button>
      <button
        className={btn}
        title="Share"
        onClick={async () => {
          const url = `${window.location.origin}/history/${hand.id}`;
          try {
            if (navigator.share) await navigator.share({ title: `Hand #${hand.handNo}`, text: `Hand #${hand.handNo} at ${hand.room.name}`, url });
            else {
              await navigator.clipboard.writeText(url);
              onMessage('Link copied: players from this room can open it');
            }
          } catch {
            /* share cancelled */
          }
        }}
      >
        <Share className="h-6 w-6" />
      </button>
      <button className={`${btn} font-display text-lg font-extrabold ${display.bb ? '!bg-gold/20 !text-gold !ring-gold/50' : ''}`} title="Show amounts in big blinds" onClick={() => setDisplay({ ...display, bb: !display.bb })}>
        BB
      </button>
      <button className={`${btn} ${display.anonymous ? '!bg-gold/20 !text-gold !ring-gold/50' : ''}`} title="Hide player names" onClick={() => setDisplay({ ...display, anonymous: !display.anonymous })}>
        <Incognito className="h-6 w-6" />
      </button>
    </div>
  );
}
