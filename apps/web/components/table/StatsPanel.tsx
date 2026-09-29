'use client';
import type { TableView } from '@poker/shared';
import { chips, money, signed } from '@/lib/format';

export function StatsPanel({ view }: { view: TableView }) {
  const ledger = view.room.moneyMode === 'LEDGER';
  const currency = view.room.config.ledger?.currency ?? '';
  const players = [...view.stats.players].sort((a, b) => b.net - a.net);
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Hands played" value={chips(view.stats.handsPlayed)} />
        <Stat label="Biggest pot" value={chips(view.stats.biggestPot)} />
      </div>
      {view.room.gameMode === 'CASH' && (
        <table className="w-full text-xs tabular">
          <thead className="text-white/50">
            <tr>
              <th className="text-left font-normal">Player</th>
              <th className="text-right font-normal">Hands</th>
              <th className="text-right font-normal">Bought in</th>
              <th className="text-right font-normal">Net</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.userId} className="border-t border-white/5">
                <td className="py-1">{p.username}</td>
                <td className="text-right">{p.handsPlayed}</td>
                <td className="text-right">{chips(p.buyIn)}</td>
                <td className={`text-right font-semibold ${p.net > 0 ? 'text-emerald-400' : p.net < 0 ? 'text-red-400' : ''}`}>
                  {ledger && p.netMoney !== null ? signed(p.netMoney, (n) => money(n, currency)) : signed(p.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ledger && view.room.gameMode === 'CASH' && (
        <p className="text-[11px] text-white/40">
          {view.room.config.ledger!.ratio.chips} chip(s) = {money(view.room.config.ledger!.ratio.minor, currency)}. The app records values only; settle up between yourselves.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 p-3 ring-1 ring-inset ring-white/[0.06]">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-display text-xl font-bold tabular">{value}</div>
    </div>
  );
}
