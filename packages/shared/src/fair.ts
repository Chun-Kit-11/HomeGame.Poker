import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Provably fair shuffle.
 *
 * Before a hand the server picks a secret random `serverSeed` (64 hex chars)
 * and publishes commitment = SHA-256(serverSeed). Every player's browser then
 * sends a random client seed. The deck is a Fisher-Yates shuffle whose random
 * numbers come from an HMAC-SHA256 stream:
 *
 *   block_k = HMAC-SHA256(key = serverSeed, message = `${clientSeeds}:${handId}:${k}`)
 *
 * Each 32-byte block yields eight 32-bit numbers; rejection sampling makes every
 * index exactly equally likely (no modulo bias). After the hand the server
 * reveals serverSeed, so anyone can check the commitment and recompute the deck.
 *
 * This exact code runs on the server and in the browser's Verify page.
 */

/** The commitment published before the hand: SHA-256 of the seed's text, in hex. */
export function commitmentOf(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)));
}

export interface ClientSeed {
  seat: number;
  seed: string;
}

/** Canonical combination of client seeds: ordered by seat, "seat:seed" joined by "|". */
export function combineClientSeeds(seeds: readonly ClientSeed[]): string {
  return [...seeds]
    .sort((a, b) => a.seat - b.seat)
    .map((s) => `${s.seat}:${s.seed}`)
    .join('|');
}

/** Deterministic stream of uniform 32-bit integers from the seeds. */
export class SeedStream {
  private buffer: number[] = [];
  private counter = 0;
  private readonly key: Uint8Array;

  constructor(
    serverSeed: string,
    private readonly clientSeeds: string,
    private readonly handId: string,
  ) {
    this.key = utf8ToBytes(serverSeed);
  }

  nextUint32(): number {
    if (this.buffer.length === 0) {
      const block = hmac(sha256, this.key, utf8ToBytes(`${this.clientSeeds}:${this.handId}:${this.counter++}`));
      for (let i = 0; i < 32; i += 4) {
        this.buffer.push(((block[i] << 24) | (block[i + 1] << 16) | (block[i + 2] << 8) | block[i + 3]) >>> 0);
      }
    }
    return this.buffer.shift()!;
  }

  /** Uniform integer in [0, n) using rejection sampling. */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error('bad range');
    const limit = Math.floor(2 ** 32 / n) * n;
    for (;;) {
      const x = this.nextUint32();
      if (x < limit) return x % n;
    }
  }
}

/**
 * Shuffles the canonical deck (0 = 2c, 1 = 2d, 2 = 2h, 3 = 2s, 4 = 3c ... 51 = As)
 * with Fisher-Yates driven by the seed stream.
 */
export function shuffleDeck(serverSeed: string, clientSeeds: string, handId: string): number[] {
  const stream = new SeedStream(serverSeed, clientSeeds, handId);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = stream.nextInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Hand identifier mixed into the shuffle so no two hands can share a deck. */
export const handIdFor = (roomCode: string, handNo: number) => `${roomCode}#${handNo}`;

/** Checks a revealed hand: the seed matches the commitment and reproduces the deck. */
export function verifyHand(input: { serverSeed: string; serverSeedHash: string; clientSeeds: string; handId: string }) {
  const hashOk = commitmentOf(input.serverSeed) === input.serverSeedHash.trim().toLowerCase();
  const deck = shuffleDeck(input.serverSeed, input.clientSeeds, input.handId);
  return { hashOk, deck };
}

/**
 * Where each card of a verified deck went, following the engine's dealing order:
 * hole cards one at a time clockwise starting left of the button (two rounds),
 * then burn + flop (3), burn + turn, burn + river; a second run (run it twice)
 * continues from there with a burn before each of its streets.
 */
export function dealFromDeck(
  deck: readonly number[],
  opts: { seats: readonly number[]; buttonSeat: number; boardLength: number; board2Common?: number | null },
) {
  const d = (s: number) => {
    const x = (s - opts.buttonSeat + 1000) % 1000;
    return x === 0 ? 1000 : x;
  };
  const order = [...opts.seats].sort((a, b) => d(a) - d(b));
  const holes = new Map<number, number[]>(order.map((s) => [s, []]));
  let pos = 0;
  for (let r = 0; r < 2; r++) for (const s of order) holes.get(s)!.push(deck[pos++]);
  const burns: number[] = [];
  const dealStreets = (board: number[], upTo: number) => {
    while (board.length < upTo) {
      burns.push(deck[pos++]);
      const n = board.length === 0 ? 3 : 1;
      for (let i = 0; i < n; i++) board.push(deck[pos++]);
    }
  };
  const board: number[] = [];
  dealStreets(board, opts.boardLength);
  let board2: number[] | null = null;
  if (opts.board2Common !== undefined && opts.board2Common !== null) {
    board2 = board.slice(0, opts.board2Common);
    dealStreets(board2, 5);
  }
  return { holes, board, board2, burns };
}
