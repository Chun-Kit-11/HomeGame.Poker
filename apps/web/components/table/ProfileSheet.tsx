'use client';
import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@poker/shared';
import { api } from '@/lib/api';
import { useAmount } from '@/lib/display';
import { Close } from '../ui/Icons';
import { Avatar } from './Seat';

interface Profile {
  user: { id: string; username: string; memberSince: string };
  together: boolean;
  hands: number;
  vpip: number | null;
  pfr: number | null;
  threeBet: number | null;
  ats: number | null;
  wtsd: number | null;
  wsd: number | null;
  bbPer100: number | null;
  note: { color: string | null; note: string };
  colors: string[];
}

/** A ring showing a percentage (like a HUD stat). */
function StatRing({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1" title={hint}>
      <div className="relative h-[66px] w-[66px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
          {value !== null && <circle cx="32" cy="32" r={r} fill="none" stroke="#22c55e" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />}
        </svg>
        <div className="absolute inset-0 grid place-items-center font-display text-[17px] font-extrabold tabular">
          {value === null ? '—' : (
            <span>
              {value}
              <span className="text-[10px]">%</span>
            </span>
          )}
        </div>
      </div>
      <div className="text-[13px] font-semibold text-white/75">{label}</div>
    </div>
  );
}

export function ProfileSheet({ userId, view, onClose, onLabel }: { userId: string; view: TableView; onClose: () => void; onLabel: (userId: string, color: string | null) => void }) {
  const fmt = useAmount();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<Profile>(`/players/${userId}/profile`)
      .then((r) => {
        setP(r);
        setColor(r.note.color);
        setNote(r.note.note);
      })
      .catch((e) => setError(e.message));
  }, [userId]);

  const save = (c: string | null, n: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSaved('saving');
    timer.current = setTimeout(async () => {
      try {
        await api(`/players/${userId}/note`, { method: 'PUT', body: { color: c, note: n } });
        setSaved('saved');
        onLabel(userId, c);
      } catch {
        setSaved('idle');
      }
    }, 600);
  };

  const session = view.stats.players.find((x) => x.userId === userId);
  const isMe = userId === view.me.userId;
  const seat = view.seats.find((s) => s?.userId === userId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="slide-up mt-auto max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-[#121211] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex justify-end pt-2">
          <button className="icon-btn h-9 w-9" onClick={onClose} aria-label="Close">
            <Close className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="py-6 text-center text-red-300">{error}</p>}
        {!p && !error && <p className="py-10 text-center text-white/40">Loading…</p>}
        {p && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="rounded-full p-[3px]" style={{ background: color ?? 'linear-gradient(180deg,#f6e3a8,#b8913f)' }}>
                  <Avatar name={p.user.username} size={84} ring="ring-2 ring-black" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-2xl font-bold">{p.user.username}</div>
                <div className="text-xs text-white/45">Member since {new Date(p.user.memberSince).toLocaleDateString()}</div>
                {seat && <div className="mt-1 text-sm text-white/70">Seat {seat.seat + 1} · stack <b className="tabular text-gold">{fmt(seat.stack)}</b></div>}
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/[0.06]">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm">
                  <b className="tabular">{p.hands}</b> <span className="text-white/50">{p.hands === 1 ? 'hand' : 'hands'} {p.together ? 'played together' : 'played'}</span>
                </span>
                {p.bbPer100 !== null && (
                  <span className={`text-sm font-bold tabular ${p.bbPer100 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.bbPer100 > 0 ? '+' : ''}
                    {p.bbPer100} bb/100
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1">
                <StatRing label="VPIP" value={p.vpip} hint="Voluntarily put money in the pot preflop" />
                <StatRing label="PFR" value={p.pfr} hint="Raised preflop" />
                <StatRing label="ATS" value={p.ats} hint="Attempted to steal the blinds from CO/BTN/SB when folded to" />
                <StatRing label="3BET" value={p.threeBet} hint="Re-raised when facing a single raise preflop" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-white/60">
                <div className="rounded-lg bg-black/25 py-1.5">
                  Went to showdown <b className="text-white">{p.wtsd ?? '—'}{p.wtsd !== null && '%'}</b>
                </div>
                <div className="rounded-lg bg-black/25 py-1.5">
                  Won at showdown <b className="text-white">{p.wsd ?? '—'}{p.wsd !== null && '%'}</b>
                </div>
              </div>
              {p.together && <p className="mt-2 text-[11px] text-white/35">Stats only include hands you both played in.</p>}
            </div>

            {session && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/[0.04] py-2.5">
                  <div className="eyebrow">This session</div>
                  <div className="font-display font-bold tabular">
                    {session.handsPlayed} {session.handsPlayed === 1 ? 'hand' : 'hands'}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.04] py-2.5">
                  <div className="eyebrow">Bought in</div>
                  <div className="font-display font-bold tabular">{fmt(session.buyIn)}</div>
                </div>
                <div className="rounded-xl bg-white/[0.04] py-2.5">
                  <div className="eyebrow">Result</div>
                  <div className={`font-display font-bold tabular ${session.net > 0 ? 'text-emerald-400' : session.net < 0 ? 'text-red-400' : ''}`}>
                    {session.net > 0 ? '+' : ''}
                    {fmt(session.net)}
                  </div>
                </div>
              </div>
            )}

            {!isMe && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">My label &amp; note (only you can see this)</span>
                  <span className="text-[11px] text-white/40">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setColor(null);
                      save(null, note);
                    }}
                    className={`h-8 rounded-lg px-3 text-xs ring-1 ring-inset ${color === null ? 'bg-white/15 ring-white/40' : 'bg-transparent ring-white/15'}`}
                  >
                    None
                  </button>
                  {p.colors.map((c) => (
                    <button
                      key={c}
                      aria-label={`Label ${c}`}
                      onClick={() => {
                        setColor(c);
                        save(c, note);
                      }}
                      className={`h-8 w-8 rounded-lg transition ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#121211]' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <textarea
                  className="input h-28 resize-none py-2.5 text-sm"
                  placeholder="Note (e.g. bluffs rivers, calls light…)"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    save(color, e.target.value);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
