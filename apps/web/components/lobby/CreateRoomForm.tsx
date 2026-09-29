'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type RoomConfig, defaultRoomConfig } from '@poker/shared';
import { api } from '@/lib/api';
import { TournamentFields } from './TournamentFields';

type Mode = 'CASH' | 'TOURNAMENT';
type Money = 'PLAY' | 'LEDGER';

export function CreateRoomForm() {
  const router = useRouter();
  const [config, setConfig] = useState<RoomConfig>(defaultRoomConfig('CASH', 'PLAY'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const setModes = (gameMode: Mode, moneyMode: Money) => {
    const d = defaultRoomConfig(gameMode, moneyMode);
    setConfig((c) => ({ ...d, name: c.name === defaultRoomConfig(c.gameMode, c.moneyMode).name ? d.name : c.name, timing: c.timing, autoApprove: c.autoApprove }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { code } = await api<{ code: string }>('/rooms', { body: config });
      router.push(`/room/${code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const cash = config.cash;
  const ledger = config.ledger;
  const num = (v: string) => (v === '' ? 0 : Math.floor(Number(v)));
  const money = (v: string) => Math.round(Number(v || '0') * 100);

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-4">
      <h2 className="text-lg font-bold">Create a private room</h2>

      <Field label="Room name">
        <input className="input" value={config.name} maxLength={40} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Toggle
          label="Game"
          options={[
            ['CASH', 'Cash game'],
            ['TOURNAMENT', 'Tournament'],
          ]}
          value={config.gameMode}
          onChange={(v) => setModes(v as Mode, config.moneyMode)}
        />
        <Toggle
          label="Money"
          options={[
            ['PLAY', 'Play chips'],
            ['LEDGER', 'Ledger'],
          ]}
          value={config.moneyMode}
          onChange={(v) => setModes(config.gameMode, v as Money)}
        />
      </div>

      {cash && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Small blind">
            <input className="input" type="number" min={1} value={cash.smallBlind} onChange={(e) => setConfig({ ...config, cash: { ...cash, smallBlind: num(e.target.value) } })} />
          </Field>
          <Field label="Big blind">
            <input className="input" type="number" min={1} value={cash.bigBlind} onChange={(e) => setConfig({ ...config, cash: { ...cash, bigBlind: num(e.target.value) } })} />
          </Field>
          <Field label="Min buy-in (chips)">
            <input className="input" type="number" min={1} value={cash.minBuyIn} onChange={(e) => setConfig({ ...config, cash: { ...cash, minBuyIn: num(e.target.value) } })} />
          </Field>
          <Field label="Max buy-in (chips)">
            <input className="input" type="number" min={1} value={cash.maxBuyIn} onChange={(e) => setConfig({ ...config, cash: { ...cash, maxBuyIn: num(e.target.value) } })} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cash.runItTwice} onChange={(e) => setConfig({ ...config, cash: { ...cash, runItTwice: e.target.checked } })} />
            Allow run it twice (all players in the pot must agree)
          </label>
        </div>
      )}

      {config.tournament && <TournamentFields config={config} setConfig={setConfig} />}

      {ledger && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="col-span-2 text-xs text-amber-200/80">
            Ledger mode records real-money values so you can settle up afterwards. The app never takes or sends payments.
          </p>
          <Field label="Currency">
            <input className="input" value={ledger.currency} maxLength={8} onChange={(e) => setConfig({ ...config, ledger: { ...ledger, currency: e.target.value } })} />
          </Field>
          {config.gameMode === 'CASH' ? (
            <Field label={`Value of ${ledger.ratio.chips} chip(s) in ${ledger.currency}`}>
              <div className="flex gap-2">
                <input
                  className="input w-20"
                  type="number"
                  min={1}
                  value={ledger.ratio.chips}
                  onChange={(e) => setConfig({ ...config, ledger: { ...ledger, ratio: { ...ledger.ratio, chips: Math.max(1, num(e.target.value)) } } })}
                />
                <span className="self-center">=</span>
                <input
                  className="input"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={ledger.ratio.minor / 100}
                  onChange={(e) => setConfig({ ...config, ledger: { ...ledger, ratio: { ...ledger.ratio, minor: Math.max(1, money(e.target.value)) } } })}
                />
              </div>
            </Field>
          ) : (
            <>
              <Field label={`Entry fee (${ledger.currency})`}>
                <input className="input" type="number" min={0} step={0.01} value={ledger.entryPrice / 100} onChange={(e) => setConfig({ ...config, ledger: { ...ledger, entryPrice: money(e.target.value) } })} />
              </Field>
              {config.tournament?.rebuy.enabled && (
                <Field label={`Rebuy price (${ledger.currency})`}>
                  <input className="input" type="number" min={0} step={0.01} value={ledger.rebuyPrice / 100} onChange={(e) => setConfig({ ...config, ledger: { ...ledger, rebuyPrice: money(e.target.value) } })} />
                </Field>
              )}
              {config.tournament?.addOn.enabled && (
                <Field label={`Add-on price (${ledger.currency})`}>
                  <input className="input" type="number" min={0} step={0.01} value={ledger.addOnPrice / 100} onChange={(e) => setConfig({ ...config, ledger: { ...ledger, addOnPrice: money(e.target.value) } })} />
                </Field>
              )}
            </>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={config.autoApprove} onChange={(e) => setConfig({ ...config, autoApprove: e.target.checked })} />
        Auto-approve buy-ins and rebuys
      </label>

      <button type="button" className="self-start text-sm text-emerald-400 underline" onClick={() => setAdvanced(!advanced)}>
        {advanced ? 'Hide' : 'Show'} timer settings
      </button>
      {advanced && (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['preflopSeconds', 'Preflop decision (s)'],
              ['postflopSeconds', 'Postflop decision (s)'],
              ['timeBankChips', 'Time bank chips'],
              ['timeBankChipSeconds', 'Seconds per chip'],
              ['timeBankRefillHands', 'Refill 1 chip every N hands'],
              ['timeBankMaxChips', 'Max chips'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className="input"
                type="number"
                min={0}
                value={config.timing[key]}
                onChange={(e) => setConfig({ ...config, timing: { ...config.timing, [key]: num(e.target.value) } })}
              />
            </Field>
          ))}
          <Field label="Seats">
            <input className="input" type="number" min={2} max={9} value={config.maxSeats} onChange={(e) => setConfig({ ...config, maxSeats: Math.min(9, Math.max(2, num(e.target.value))) })} />
          </Field>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Creating…' : 'Create room'}
      </button>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      {children}
    </label>
  );
}

function Toggle({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      <div className="flex rounded-lg bg-black/30 p-1">
        {options.map(([v, text]) => (
          <button
            type="button"
            key={v}
            onClick={() => onChange(v)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${value === v ? 'bg-emerald-500 text-black' : 'text-white/70'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
