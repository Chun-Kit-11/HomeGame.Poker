'use client';
import { useEffect, useState } from 'react';
import { THEMES, type ThemeName, useDisplay } from '@/lib/display';
import { getCustomSeed, setCustomSeed } from '@/lib/seed';
import { isMuted, setMuted } from '@/lib/sounds';

/** Per-device preferences. */
export function SettingsPanel({ onMutedChange }: { onMutedChange?: (m: boolean) => void }) {
  const { theme, setTheme, unit, setUnit } = useDisplay();
  const [muted, setMutedState] = useState(false);
  const [seed, setSeed] = useState('');
  useEffect(() => {
    setMutedState(isMuted());
    setSeed(getCustomSeed());
  }, []);

  return (
    <div className="space-y-6 p-4 text-sm">
      <section>
        <h3 className="eyebrow mb-2">Table colour</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(THEMES) as ThemeName[]).map((k) => (
            <button key={k} onClick={() => setTheme(k)} className={`flex flex-col items-center gap-1.5 rounded-xl p-2 ring-1 ring-inset ${theme === k ? 'bg-gold/10 ring-gold/60' : 'bg-black/25 ring-white/10'}`}>
              <span className="h-8 w-12 rounded-full p-[3px]" style={{ background: THEMES[k].rail }}>
                <span className="block h-full w-full rounded-full" style={{ background: THEMES[k].felt }} />
              </span>
              <span className={`text-[11px] ${theme === k ? 'text-gold' : 'text-white/60'}`}>{THEMES[k].label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="eyebrow mb-2">Show amounts in</h3>
        <div className="flex rounded-xl bg-black/30 p-1 ring-1 ring-inset ring-white/10">
          {(
            [
              ['chips', 'Chips'],
              ['bb', 'Big blinds'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setUnit(k)} className={`flex-1 rounded-lg py-2 font-semibold ${unit === k ? 'bg-white/10 text-white' : 'text-white/50'}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between">
        <span>Sounds</span>
        <button
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
            onMutedChange?.(!muted);
          }}
          className={`relative h-7 w-12 rounded-full transition ${muted ? 'bg-white/15' : 'bg-emerald-500'}`}
          aria-label="Toggle sounds"
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${muted ? 'left-1' : 'left-6'}`} />
        </button>
      </section>

      <section>
        <h3 className="eyebrow mb-2">My shuffle seed (optional)</h3>
        <input
          className="input h-10 text-sm"
          maxLength={60}
          placeholder="Any word or phrase"
          value={seed}
          onChange={(e) => {
            setSeed(e.target.value);
            setCustomSeed(e.target.value);
          }}
        />
        <p className="mt-1.5 text-[11px] text-white/40">
          Your device already adds a random seed to every shuffle. Anything typed here is mixed in too, and shown on the Verify page.
        </p>
      </section>
    </div>
  );
}
