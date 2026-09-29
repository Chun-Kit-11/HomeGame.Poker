'use client';
import { useEffect, useRef, useState } from 'react';

/** Countdown ring around an avatar. `deadline` is in server time; `skew` = server - client clock. */
export function TimerRing({ deadline, skew, bank }: { deadline: number; skew: number; bank: boolean }) {
  const total = useRef<{ deadline: number; ms: number } | null>(null);
  const [now, setNow] = useState(() => Date.now() + skew);
  if (!total.current || total.current.deadline !== deadline) {
    total.current = { deadline, ms: Math.max(1000, deadline - (Date.now() + skew)) };
  }
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew), 100);
    return () => clearInterval(id);
  }, [skew]);
  const remaining = Math.max(0, deadline - now);
  const frac = Math.min(1, remaining / total.current.ms);
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = bank ? '#f59e0b' : frac > 0.5 ? '#34d399' : frac > 0.2 ? '#fbbf24' : '#ef4444';
  return (
    <svg className="pointer-events-none absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] -rotate-90" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} strokeLinecap="round" />
    </svg>
  );
}

export function useCountdown(deadline: number | null, skew: number) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now() + skew), 250);
    return () => clearInterval(id);
  }, [deadline, skew]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}
