'use client';

const KEY = 'poker.customSeed';

/** Returns this player's contribution to the next shuffle: a fresh random value, optionally prefixed with a custom phrase. */
export function clientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  let custom = '';
  try {
    custom = localStorage.getItem(KEY) ?? '';
  } catch {
    /* ignore */
  }
  return (custom ? `${custom.slice(0, 60)}:` : '') + random;
}

export function getCustomSeed(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCustomSeed(v: string) {
  try {
    localStorage.setItem(KEY, v.slice(0, 60));
  } catch {
    /* ignore */
  }
}
