'use client';
import { useState } from 'react';
import { type RoomConfig, defaultLevels, defaultPayouts } from '@poker/shared';
import { Field } from './CreateRoomForm';

export function TournamentFields({ config, setConfig }: { config: RoomConfig; setConfig: (c: RoomConfig) => void }) {
  const t = config.tournament!;
  const [showLevels, setShowLevels] = useState(false);
  const set = (patch: Partial<typeof t>) => setConfig({ ...config, tournament: { ...t, ...patch } });
  const num = (v: string) => (v === '' ? 0 : Math.floor(Number(v)));

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Starting stack">
        <input
          className="input"
          type="number"
          min={1}
          value={t.startingStack}
          onChange={(e) => {
            const s = Math.max(1, num(e.target.value));
            set({ startingStack: s, levels: defaultLevels(s), rebuy: { ...t.rebuy, chips: s }, addOn: { ...t.addOn, chips: s } });
          }}
        />
      </Field>
      <Field label="Minutes per level">
        <input className="input" type="number" min={1} value={t.levelMinutes} onChange={(e) => set({ levelMinutes: Math.max(1, Number(e.target.value)) })} />
      </Field>
      <Field label="Late registration until end of level">
        <input className="input" type="number" min={0} value={t.lateRegLevels} onChange={(e) => set({ lateRegLevels: num(e.target.value) })} />
      </Field>
      <Field label="Payouts (% for 1st, 2nd, …)">
        <input
          className="input"
          placeholder="Default"
          value={t.payouts ? t.payouts.join(', ') : ''}
          onChange={(e) => {
            const parts = e.target.value
              .split(/[,\s]+/)
              .filter(Boolean)
              .map(Number)
              .filter((n) => Number.isFinite(n) && n >= 0);
            set({ payouts: parts.length ? parts.slice(0, 9) : null });
          }}
        />
      </Field>
      <p className="col-span-2 -mt-2 text-[11px] text-white/40">
        Default payouts: 1 place for up to 4 players ({defaultPayouts(4).join('%')}%), 2 places for 5–6 ({defaultPayouts(5).join('/')}%), 3 places for 7–9 (
        {defaultPayouts(7).join('/')}%).
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={t.rebuy.enabled} onChange={(e) => set({ rebuy: { ...t.rebuy, enabled: e.target.checked } })} />
        Rebuys
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={t.addOn.enabled} onChange={(e) => set({ addOn: { ...t.addOn, enabled: e.target.checked } })} />
        Add-on
      </label>
      {t.rebuy.enabled && (
        <>
          <Field label="Rebuys until end of level">
            <input className="input" type="number" min={1} value={t.rebuy.untilLevel} onChange={(e) => set({ rebuy: { ...t.rebuy, untilLevel: Math.max(1, num(e.target.value)) } })} />
          </Field>
          <Field label="Rebuy chips">
            <input className="input" type="number" min={1} value={t.rebuy.chips} onChange={(e) => set({ rebuy: { ...t.rebuy, chips: Math.max(1, num(e.target.value)) } })} />
          </Field>
        </>
      )}
      {t.addOn.enabled && (
        <Field label="Add-on chips (level after rebuys end)">
          <input className="input" type="number" min={1} value={t.addOn.chips} onChange={(e) => set({ addOn: { ...t.addOn, chips: Math.max(1, num(e.target.value)) } })} />
        </Field>
      )}

      <div className="col-span-2">
        <button type="button" className="text-sm text-emerald-400 underline" onClick={() => setShowLevels(!showLevels)}>
          {showLevels ? 'Hide' : 'Edit'} blind schedule ({t.levels.length} levels, BB ante from level {t.levels.findIndex((l) => l.ante > 0) + 1 || '—'})
        </button>
        {showLevels && (
          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#16221d] text-white/50">
                <tr>
                  <th className="p-1">Lvl</th>
                  <th>SB</th>
                  <th>BB</th>
                  <th>BB ante</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.levels.map((l, i) => (
                  <tr key={i}>
                    <td className="p-1 text-center">{i + 1}</td>
                    {(['sb', 'bb', 'ante'] as const).map((k) => (
                      <td key={k} className="p-0.5">
                        <input
                          className="input px-1 py-0.5 text-xs"
                          type="number"
                          min={0}
                          value={l[k]}
                          onChange={(e) => set({ levels: t.levels.map((x, j) => (j === i ? { ...x, [k]: num(e.target.value) } : x)) })}
                        />
                      </td>
                    ))}
                    <td>
                      <button type="button" className="px-1 text-red-400" onClick={() => set({ levels: t.levels.filter((_, j) => j !== i) })}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 p-2">
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => {
                  const last = t.levels[t.levels.length - 1] ?? { sb: 25, bb: 50, ante: 0 };
                  set({ levels: [...t.levels, { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante ? last.bb * 2 : 0 }] });
                }}
              >
                Add level
              </button>
              <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => set({ levels: defaultLevels(t.startingStack) })}>
                Reset to default
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
