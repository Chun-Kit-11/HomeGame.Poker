import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L to avoid confusion when reading codes aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode(length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
