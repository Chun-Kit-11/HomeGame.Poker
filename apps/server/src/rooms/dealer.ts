import { randomInt } from 'node:crypto';
import type { Card } from '@poker/engine';

export interface FairRecord {
  serverSeedHash: string;
  serverSeed: string;
  clientSeeds: { seat: number; userId: string; seed: string }[];
}

export interface Participant {
  userId: string;
  seat: number;
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
    return { deck, fair: { serverSeedHash: '', serverSeed: '', clientSeeds: [] } };
  }
}
