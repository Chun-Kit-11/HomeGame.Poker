'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { chips } from './format';

export type Unit = 'chips' | 'bb';
export type ThemeName = 'onyx' | 'sapphire' | 'emerald' | 'burgundy' | 'graphite';

export interface TableTheme {
  label: string;
  /** One-line description for the picker */
  tagline: string;
  /** Felt gradient */
  felt: string;
  /** Pattern printed on the felt (CSS background layers) */
  pattern: string;
  patternSize: string;
  patternOpacity: number;
  /** Rail (outer ring) gradient */
  rail: string;
  /** Decoration on the rail */
  railDetail: 'studs' | 'chrome' | 'stitch' | 'plain';
  railDetailColor: string;
  /** Betting line printed on the felt */
  line: string;
  lineStyle: 'solid' | 'dashed' | 'double';
  /** Crest emblem colour */
  crest: string;
  /** Page backdrop behind the table */
  backdrop: string;
  /** Seat plate background (with alpha) */
  plate: string;
  /** Stack amount colour */
  stack: string;
}

export const THEMES: Record<ThemeName, TableTheme> = {
  onyx: {
    label: 'Onyx & Gold',
    tagline: 'Art-deco black with a studded gold rail',
    felt: 'radial-gradient(ellipse at 50% 40%, #2d2b27 0%, #1a1917 42%, #0e0d0c 78%, #070706 100%)',
    // Art-deco fans
    pattern:
      'radial-gradient(circle at 50% 100%, transparent 38%, rgba(227,193,115,0.9) 39%, rgba(227,193,115,0.9) 41%, transparent 42%, transparent 58%, rgba(227,193,115,0.9) 59%, rgba(227,193,115,0.9) 61%, transparent 62%)',
    patternSize: '44px 22px',
    patternOpacity: 0.07,
    rail: 'linear-gradient(180deg, #f6e3a8 0%, #d9b45e 18%, #a07a2c 45%, #6b4e17 70%, #3a2a0a 100%)',
    railDetail: 'studs',
    railDetailColor: 'rgba(255, 244, 205, 0.85)',
    line: 'rgba(227, 193, 115, 0.45)',
    lineStyle: 'double',
    crest: '#e3c173',
    backdrop:
      'radial-gradient(900px 650px at 50% 35%, rgba(227, 193, 115, 0.10), transparent 70%), radial-gradient(600px 400px at 100% 100%, rgba(184, 145, 63, 0.08), transparent 70%), #030303',
    plate: 'rgba(10, 9, 8, 0.92)',
    stack: '#e8c77a',
  },
  sapphire: {
    label: 'Royal Sapphire',
    tagline: 'Deep blue with a diamond lattice and chrome rail',
    felt: 'radial-gradient(ellipse at 50% 42%, #3a61c4 0%, #26449a 38%, #1b3278 72%, #12225a 100%)',
    pattern:
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 22px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 22px)',
    patternSize: 'auto',
    patternOpacity: 0.06,
    rail: 'linear-gradient(180deg, #f4f6fb 0%, #b8c0cf 20%, #6b7485 50%, #3b4150 75%, #1c2029 100%)',
    railDetail: 'chrome',
    railDetailColor: 'rgba(255, 255, 255, 0.7)',
    line: 'rgba(190, 210, 255, 0.35)',
    lineStyle: 'solid',
    crest: '#c9d7ff',
    backdrop:
      'radial-gradient(900px 700px at 50% 30%, rgba(46, 84, 180, 0.35), transparent 70%), radial-gradient(700px 500px at 0% 100%, rgba(120, 60, 160, 0.18), transparent 70%), #060913',
    plate: 'rgba(11, 18, 36, 0.9)',
    stack: '#a9c3ff',
  },
  emerald: {
    label: 'Classic Emerald',
    tagline: 'Casino green, pinstripes and a stitched leather rail',
    felt: 'radial-gradient(ellipse at 50% 42%, #2e9368 0%, #1b6e4d 38%, #115236 72%, #0a3625 100%)',
    pattern: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 9px)',
    patternSize: 'auto',
    patternOpacity: 0.035,
    rail: 'linear-gradient(180deg, #6b4a31 0%, #4a321f 30%, #2c1d12 65%, #150e08 100%)',
    railDetail: 'stitch',
    railDetailColor: 'rgba(242, 214, 160, 0.65)',
    line: 'rgba(242, 214, 160, 0.35)',
    lineStyle: 'dashed',
    crest: '#f2d6a0',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(16, 185, 129, 0.16), transparent 70%), #07090a',
    plate: 'rgba(7, 20, 15, 0.9)',
    stack: '#9be3c2',
  },
  burgundy: {
    label: 'Crimson Velvet',
    tagline: 'Velvet red with damask and a polished gold rail',
    felt: 'radial-gradient(ellipse at 50% 42%, #922d3e 0%, #6d1f2d 40%, #521623 75%, #360d17 100%)',
    // Damask-like scattered diamonds and dots
    pattern:
      'radial-gradient(circle at 25% 25%, rgba(255,215,170,0.9) 0 2px, transparent 3px), radial-gradient(circle at 75% 75%, rgba(255,215,170,0.9) 0 2px, transparent 3px), linear-gradient(45deg, transparent 46%, rgba(255,215,170,0.9) 47% 53%, transparent 54%), linear-gradient(-45deg, transparent 46%, rgba(255,215,170,0.9) 47% 53%, transparent 54%)',
    patternSize: '34px 34px',
    patternOpacity: 0.06,
    rail: 'linear-gradient(180deg, #f3d892 0%, #c79a3e 25%, #7d5a1c 60%, #3b2a0c 100%)',
    railDetail: 'plain',
    railDetailColor: 'rgba(255, 235, 190, 0.7)',
    line: 'rgba(255, 215, 170, 0.4)',
    lineStyle: 'solid',
    crest: '#f3d892',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(160, 40, 60, 0.25), transparent 70%), #0a0607',
    plate: 'rgba(24, 8, 12, 0.9)',
    stack: '#f3c4cc',
  },
  graphite: {
    label: 'Carbon',
    tagline: 'Carbon-fibre weave with a cyan light line',
    felt: 'radial-gradient(ellipse at 50% 42%, #3b4148 0%, #2a2f35 40%, #1c2024 75%, #111315 100%)',
    // Carbon-fibre weave
    pattern:
      'linear-gradient(45deg, rgba(255,255,255,0.9) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.9) 75%), linear-gradient(45deg, rgba(255,255,255,0.9) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.9) 75%)',
    patternSize: '8px 8px',
    patternOpacity: 0.045,
    rail: 'linear-gradient(180deg, #3a3f46 0%, #1d2126 50%, #0a0b0d 100%)',
    railDetail: 'chrome',
    railDetailColor: 'rgba(34, 211, 238, 0.8)',
    line: 'rgba(34, 211, 238, 0.45)',
    lineStyle: 'solid',
    crest: '#67e8f9',
    backdrop: 'radial-gradient(900px 700px at 50% 30%, rgba(34, 211, 238, 0.10), transparent 70%), #050607',
    plate: 'rgba(12, 13, 15, 0.9)',
    stack: '#a5f3fc',
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
