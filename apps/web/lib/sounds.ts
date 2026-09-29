'use client';

const KEY = 'poker.muted';
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Tiny synthesized sounds: no audio files needed. */
const SOUNDS: Record<string, [number, number, OscillatorType, number][]> = {
  // [frequency, duration s, wave, delay s]
  check: [[520, 0.06, 'square', 0], [520, 0.06, 'square', 0.09]],
  call: [[880, 0.05, 'triangle', 0], [1320, 0.05, 'triangle', 0.05]],
  bet: [[660, 0.05, 'triangle', 0], [990, 0.05, 'triangle', 0.05], [1320, 0.06, 'triangle', 0.1]],
  raise: [[660, 0.05, 'triangle', 0], [990, 0.05, 'triangle', 0.05], [1320, 0.06, 'triangle', 0.1]],
  fold: [[220, 0.12, 'sine', 0]],
  street: [[400, 0.04, 'sine', 0], [500, 0.04, 'sine', 0.05], [600, 0.04, 'sine', 0.1]],
  newHand: [[300, 0.05, 'sine', 0], [450, 0.05, 'sine', 0.06]],
  win: [[523, 0.1, 'triangle', 0], [659, 0.1, 'triangle', 0.1], [784, 0.18, 'triangle', 0.2]],
  yourTurn: [[880, 0.12, 'sine', 0], [1175, 0.16, 'sine', 0.14]],
  timeBank: [[300, 0.1, 'sawtooth', 0]],
  tick: [[1046, 0.07, 'square', 0]],
  tickUrgent: [[1318, 0.08, 'square', 0], [1318, 0.08, 'square', 0.12]],
};

export function playSound(kind: string) {
  if (typeof window === 'undefined' || isMuted()) return;
  const notes = SOUNDS[kind];
  if (!notes) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    for (const [freq, dur, type, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.08, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    }
  } catch {
    /* audio unavailable */
  }
}
