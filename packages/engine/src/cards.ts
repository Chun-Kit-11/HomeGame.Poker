/**
 * Cards are integers 0..51: rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3.
 * Using plain numbers keeps the engine fast and state trivially serialisable.
 */
export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';

export const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

export function cardToString(c: Card): string {
  if (!Number.isInteger(c) || c < 0 || c > 51) throw new Error(`Invalid card ${c}`);
  return RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)];
}

export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0]?.toUpperCase() ?? '');
  const su = SUIT_CHARS.indexOf(s[1]?.toLowerCase() ?? '');
  if (s.length !== 2 || r < 0 || su < 0) throw new Error(`Invalid card "${s}"`);
  return makeCard(r, su);
}

/** Parses "As Kd 7h" or "AsKd7h". */
export function parseCards(s: string): Card[] {
  const compact = s.replace(/[\s,]+/g, '');
  const out: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) out.push(parseCard(compact.slice(i, i + 2)));
  return out;
}

export const cardsToString = (cards: readonly Card[]): string => cards.map(cardToString).join(' ');

/** The 52 cards in canonical order (2c 2d 2h 2s 3c ... As). */
export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}
