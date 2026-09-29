/**
 * Ledger maths. The app only records and calculates: it never moves money.
 *
 * Every entry is double-entry against "the table": a buy-in moves money from a
 * player to the table, a cash-out moves it back. With no rake, the table must
 * end at zero, so players' net results always sum to exactly zero.
 */

export type LedgerKind = 'BUY_IN' | 'REBUY' | 'TOP_UP' | 'CASH_OUT' | 'ENTRY' | 'ADDON' | 'PAYOUT';

export interface LedgerLine {
  userId: string;
  type: LedgerKind;
  chips: number;
  amountMinor: number;
}

export interface Balance {
  userId: string;
  /** Money paid in (minor units) */
  paidIn: number;
  /** Money received (minor units) */
  paidOut: number;
  /** paidOut - paidIn */
  net: number;
  /** Chip totals (cash games) */
  chipsIn: number;
  chipsOut: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface Discrepancy {
  kind: 'chips' | 'money';
  message: string;
  amount: number;
}

const IN_TYPES: LedgerKind[] = ['BUY_IN', 'REBUY', 'TOP_UP', 'ENTRY', 'ADDON'];

/**
 * Cash games: chips are converted to money at `ratio` exactly; if a result
 * isn't a whole number of minor units it is rounded with the largest-remainder
 * method so the nets still sum to exactly zero (`rounded` is then true).
 * Tournaments: the recorded prices and payouts are used directly.
 */
export function computeBalances(lines: readonly LedgerLine[], mode: 'CASH' | 'TOURNAMENT', ratio?: { chips: number; minor: number }) {
  const users = [...new Set(lines.map((l) => l.userId))];
  const balances: Balance[] = users.map((userId) => {
    const mine = lines.filter((l) => l.userId === userId);
    const chipsIn = mine.filter((l) => IN_TYPES.includes(l.type)).reduce((t, l) => t + l.chips, 0);
    const chipsOut = mine.filter((l) => !IN_TYPES.includes(l.type)).reduce((t, l) => t + l.chips, 0);
    const paidIn = mine.filter((l) => IN_TYPES.includes(l.type)).reduce((t, l) => t + l.amountMinor, 0);
    const paidOut = mine.filter((l) => !IN_TYPES.includes(l.type)).reduce((t, l) => t + l.amountMinor, 0);
    return { userId, paidIn, paidOut, net: paidOut - paidIn, chipsIn, chipsOut };
  });

  let rounded = false;
  if (mode === 'CASH' && ratio) {
    // Recompute money from chips exactly, then round keeping the total at zero.
    const exact = balances.map((b) => ({ b, num: (b.chipsOut - b.chipsIn) * ratio.minor }));
    const floors = exact.map((e) => Math.floor(e.num / ratio.chips));
    const remainders = exact.map((e, i) => e.num - floors[i] * ratio.chips);
    rounded = remainders.some((r) => r !== 0);
    let missing = -floors.reduce((a, b) => a + b, 0); // units needed to reach zero
    const order = remainders.map((r, i) => [r, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const [, i] of order) {
      if (missing <= 0) break;
      if (remainders[i] > 0) {
        floors[i]++;
        missing--;
      }
    }
    balances.forEach((b, i) => {
      b.paidIn = Math.round((b.chipsIn * ratio.minor) / ratio.chips);
      b.paidOut = b.paidIn + floors[i];
      b.net = floors[i];
    });
  }
  return { balances, rounded };
}

/** Any reason the books don't balance. An empty list means everything adds up. */
export function findDiscrepancies(balances: readonly Balance[], mode: 'CASH' | 'TOURNAMENT', chipsStillInPlay = 0): Discrepancy[] {
  const out: Discrepancy[] = [];
  const netSum = balances.reduce((t, b) => t + b.net, 0);
  if (netSum !== 0) out.push({ kind: 'money', message: `Player results sum to ${netSum} instead of 0`, amount: netSum });
  if (mode === 'CASH') {
    const chipsIn = balances.reduce((t, b) => t + b.chipsIn, 0);
    const chipsOut = balances.reduce((t, b) => t + b.chipsOut, 0);
    const diff = chipsIn - chipsOut - chipsStillInPlay;
    if (diff !== 0) out.push({ kind: 'chips', message: `${diff} chips bought in were never cashed out`, amount: diff });
  }
  return out;
}

/**
 * The minimum number of transfers that settles everyone.
 *
 * With n players owed/owing, the fewest transfers is n - k where k is the most
 * groups the players can be split into that each sum to zero (each group of
 * size s needs s - 1 transfers). We find k exactly with a dynamic programme
 * over subsets (fast for up to 16 non-zero players), then settle each group
 * greedily. Larger sessions fall back to the greedy method.
 */
export function settle(balances: readonly { userId: string; net: number }[]): Transfer[] {
  const people = balances.filter((b) => b.net !== 0).map((b) => ({ ...b }));
  if (people.length === 0) return [];
  if (people.reduce((t, p) => t + p.net, 0) !== 0) throw new Error('Balances do not sum to zero');
  if (people.length > 16) return greedy(people);

  const n = people.length;
  const full = (1 << n) - 1;
  const sum = new Array<number>(1 << n).fill(0);
  for (let m = 1; m <= full; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low] + people[31 - Math.clz32(low)].net;
  }
  const dp = new Array<number>(1 << n).fill(0);
  for (let m = 1; m <= full; m++) {
    let best = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) best = Math.max(best, dp[m ^ (1 << i)]);
    dp[m] = best + (sum[m] === 0 ? 1 : 0);
  }
  // Walk down from the full set; consecutive zero-sum sets differ by one zero-sum group.
  const groups: number[] = [];
  let m = full;
  let lastZero = full;
  while (m) {
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (!(m & (1 << i))) continue;
      const sub = m ^ (1 << i);
      if (dp[sub] + (sum[m] === 0 ? 1 : 0) === dp[m]) {
        next = sub;
        break;
      }
    }
    m = next;
    if (sum[m] === 0) {
      groups.push(lastZero ^ m);
      lastZero = m;
    }
  }
  const transfers: Transfer[] = [];
  for (const g of groups) transfers.push(...greedy(people.filter((_, i) => g & (1 << i))));
  return transfers;
}

/** Largest debtor pays largest creditor until everyone is square. */
function greedy(people: { userId: string; net: number }[]): Transfer[] {
  const debtors = people.filter((p) => p.net < 0).map((p) => ({ id: p.userId, amt: -p.net }));
  const creditors = people.filter((p) => p.net > 0).map((p) => ({ id: p.userId, amt: p.net }));
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.amt - a.amt);
    creditors.sort((a, b) => b.amt - a.amt);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.amt, c.amt);
    out.push({ from: d.id, to: c.id, amount: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0) debtors.shift();
    if (c.amt === 0) creditors.shift();
  }
  return out;
}

/** Quotes a CSV field. Guards against spreadsheet formula injection. */
export function csvField(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Minor units to a plain decimal string for CSV: 1234 -> "12.34". */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const a = Math.abs(minor);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
