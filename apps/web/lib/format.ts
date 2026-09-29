export const chips = (n: number) => n.toLocaleString('en-US');

/** Formats minor units (e.g. sen) as money: 1234 -> "RM 12.34". */
export function money(minor: number, currency = ''): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  const s = `${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  return `${sign}${currency ? `${currency} ` : ''}${s}`;
}

export function signed(n: number, fmt: (n: number) => string = chips) {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

/** Stable colour for an avatar from a username. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}
