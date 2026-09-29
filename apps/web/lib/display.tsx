'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { chips } from './format';

export type Unit = 'chips' | 'bb';
export type ThemeName = 'onyx' | 'sapphire' | 'emerald' | 'burgundy' | 'graphite';

export interface TableTheme {
  label: string;
  /** Felt gradient */
  felt: string;
  /** Rail (outer ring) gradient */
  rail: string;
  /** Thin line printed on the felt */
  line: string;
  /** Page backdrop behind the table */
  backdrop: string;
  /** Swatch for the picker */
  swatch: string;
  /** Seat plate background (with alpha) */
  plate: string;
  /** Stack amount colour */
  stack: string;
}

export const THEMES: Record<ThemeName, TableTheme> = {
  onyx: {
    label: 'Onyx & Gold',
    felt: 'radial-gradient(ellipse at 50% 40%, #2b2a27 0%, #1a1917 42%, #0e0d0c 78%, #070706 100%)',
    rail: 'linear-gradient(180deg, #f6e3a8 0%, #d9b45e 18%, #a07a2c 45%, #6b4e17 70%, #3a2a0a 100%)',
    line: 'rgba(227, 193, 115, 0.38)',
    backdrop: 'radial-gradient(900px 650px at 50% 35%, rgba(227, 193, 115, 0.10), transparent 70%), radial-gradient(600px 400px at 100% 100%, rgba(184, 145, 63, 0.08), transparent 70%), #030303',
    swatch: '#1a1917',
    plate: 'rgba(10, 9, 8, 0.92)',
    stack: '#e8c77a',
  },
  sapphire: {
    label: 'Sapphire',
    felt: 'radial-gradient(ellipse at 50% 42%, #3559b8 0%, #26449a 38%, #1b3278 72%, #13245a 100%)',
    rail: 'linear-gradient(180deg, #1c2542 0%, #0d1326 55%, #070b17 100%)',
    line: 'rgba(160, 190, 255, 0.18)',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(46, 84, 180, 0.35), transparent 70%), radial-gradient(700px 500px at 0% 100%, rgba(120, 60, 160, 0.18), transparent 70%), #060913',
    swatch: '#26449a',
    plate: 'rgba(11, 18, 36, 0.9)',
    stack: '#a9c3ff',
  },
  emerald: {
    label: 'Emerald',
    felt: 'radial-gradient(ellipse at 50% 42%, #2a8a62 0%, #1b6e4d 38%, #115236 72%, #0a3625 100%)',
    rail: 'linear-gradient(180deg, #3d2b1d 0%, #23170f 55%, #150e08 100%)',
    line: 'rgba(227, 193, 115, 0.16)',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(16, 185, 129, 0.16), transparent 70%), #07090a',
    swatch: '#1b6e4d',
    plate: 'rgba(7, 20, 15, 0.9)',
    stack: '#9be3c2',
  },
  burgundy: {
    label: 'Burgundy',
    felt: 'radial-gradient(ellipse at 50% 42%, #8a2a3a 0%, #6d1f2d 40%, #521623 75%, #360d17 100%)',
    rail: 'linear-gradient(180deg, #2a1a14 0%, #170e0a 60%, #0c0705 100%)',
    line: 'rgba(227, 193, 115, 0.18)',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(160, 40, 60, 0.22), transparent 70%), #0a0607',
    swatch: '#6d1f2d',
    plate: 'rgba(24, 8, 12, 0.9)',
    stack: '#f3c4cc',
  },
  graphite: {
    label: 'Graphite',
    felt: 'radial-gradient(ellipse at 50% 42%, #3b4148 0%, #2c3137 40%, #1f2327 75%, #15181b 100%)',
    rail: 'linear-gradient(180deg, #202428 0%, #111316 60%, #08090a 100%)',
    line: 'rgba(255, 255, 255, 0.10)',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(120, 130, 140, 0.16), transparent 70%), #070809',
    swatch: '#2c3137',
    plate: 'rgba(12, 13, 15, 0.9)',
    stack: '#d6dbe1',
  },
};

interface DisplayCtx {
  unit: Unit;
  setUnit: (u: Unit) => void;
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  bigBlind: number;
}

const Ctx = createContext<DisplayCtx>({ unit: 'chips', setUnit: () => {}, theme: 'onyx', setTheme: () => {}, bigBlind: 1 });

function read<T extends string>(key: string, fallback: T, allowed: readonly string[]): T {
  try {
    const v = localStorage.getItem(key);
    return v && allowed.includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Per-device display preferences: table colour and chips-vs-big-blinds. */
export function DisplayProvider({ bigBlind, defaultUnit, children }: { bigBlind: number; defaultUnit: Unit; children: React.ReactNode }) {
  const [unit, setUnitState] = useState<Unit>(defaultUnit);
  const [theme, setThemeState] = useState<ThemeName>('onyx');
  useEffect(() => {
    setUnitState(read('poker.unit', defaultUnit, ['chips', 'bb']));
    setThemeState(read('poker.theme', 'onyx', Object.keys(THEMES)));
  }, [defaultUnit]);
  const setUnit = useCallback((u: Unit) => {
    setUnitState(u);
    try {
      localStorage.setItem('poker.unit', u);
    } catch {
      /* ignore */
    }
  }, []);
  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    try {
      localStorage.setItem('poker.theme', t);
    } catch {
      /* ignore */
    }
  }, []);
  return <Ctx.Provider value={{ unit, setUnit, theme, setTheme, bigBlind }}>{children}</Ctx.Provider>;
}

export const useDisplay = () => useContext(Ctx);

export function formatBB(n: number, bb: number): string {
  const v = n / Math.max(1, bb);
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r.toLocaleString('en-US')} BB`;
}

/** Formats an amount in the viewer's chosen unit. */
export function useAmount() {
  const { unit, bigBlind } = useDisplay();
  return useCallback((n: number) => (unit === 'bb' ? formatBB(n, bigBlind) : chips(n)), [unit, bigBlind]);
}

export const useTheme = () => THEMES[useDisplay().theme];
