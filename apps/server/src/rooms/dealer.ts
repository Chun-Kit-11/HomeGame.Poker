import { randomBytes, randomInt } from 'node:crypto';
import type { Card } from '@poker/engine';
import { combineClientSeeds, commitmentOf, handIdFor, shuffleDeck } from '@poker/shared';
import type { Clock } from '../clock';

export interface FairRecord {
  serverSeedHash: string;
  serverSeed: string;
  handId: string;
  clientSeeds: { seat: number; userId: string; seed: string }[];
}

export interface Participant {
  userId: string;
  seat: number;
  /** Only connected players are waited for when collecting client seeds */
  connected?: boolean;
}

/** Produces the shuffled deck for a hand (and the data needed to verify it). */
export interface Dealer {
  prepare(handNo: number, participants: Participant[]): Promise<{ deck: Card[]; fair: FairRecord }>;
  submitSeed?(userId: string, handNo: number, seed: string): void;
}

/** Plain Fisher-Yates with Node's CSPRNG. */
export class CryptoDealer implements Dealer {
  async prepare() {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 51; i > 0; i--) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { deck, fair: { serverSeedHash: '', serverSeed: '', handId: '', clientSeeds: [] } };
  }
}

interface PendingHand {
  handNo: number;
  participants: Participant[];
  seeds: Map<string, string>;
  done: () => void;
}

/**
 * Provably fair dealer: commits to a secret server seed, collects a seed from
 * each player (up to `waitMs`), then shuffles with shuffleDeck().
 */
export class FairDealer implements Dealer {
  private pending: PendingHand | null = null;

  constructor(
    private readonly roomCode: string,
    private readonly emitAll: (event: string, payload: unknown) => void,
    private readonly clock: Clock,
    private readonly waitMs = 1500,
  ) {}

  async prepare(handNo: number, participants: Participant[]) {
    const serverSeed = randomBytes(32).toString('hex');
    const serverSeedHash = commitmentOf(serverSeed);
    const handId = handIdFor(this.roomCode, handNo);
    const seeds = new Map<string, string>();

    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.clock.clearTimeout(timer);
        resolve();
      };
      const timer = this.clock.setTimeout(done, this.waitMs);
      this.pending = { handNo, participants, seeds, done };
      // The commitment is published before any player seed is accepted.
      this.emitAll('fair:commit', { handNo, serverSeedHash, handId });
      if (participants.every((p) => p.connected === false)) done();
    });
    this.pending = null;

    const clientSeeds = participants.map((p) => ({ seat: p.seat, userId: p.userId, seed: seeds.get(p.userId) ?? '' }));
    const deck = shuffleDeck(serverSeed, combineClientSeeds(clientSeeds), handId);
    return { deck, fair: { serverSeedHash, serverSeed, handId, clientSeeds } };
  }

  submitSeed(userId: string, handNo: number, seed: string) {
    const p = this.pending;
    if (!p || p.handNo !== handNo) return;
    if (!p.participants.some((x) => x.userId === userId)) return;
    if (p.seeds.has(userId)) return; // first submission only
    p.seeds.set(userId, seed.slice(0, 128));
    const waiting = p.participants.filter((x) => x.connected !== false && !p.seeds.has(x.userId));
    if (waiting.length === 0) p.done();
  }
}
