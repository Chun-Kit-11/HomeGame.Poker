import type { Prisma } from '@prisma/client';
import { db } from './db';

export type LedgerType = 'BUY_IN' | 'REBUY' | 'TOP_UP' | 'CASH_OUT' | 'ENTRY' | 'ADDON' | 'PAYOUT';
export type RoomStatusValue = 'OPEN' | 'RUNNING' | 'PAUSED' | 'ENDED';

export interface LedgerRecord {
  userId: string;
  type: LedgerType;
  chips: number;
  amountMinor: number;
  note?: string;
}

export interface HandPlayerRecord {
  userId: string;
  seat: number;
  position: string;
  holeCards: number[];
  shown: boolean;
  startStack: number;
  endStack: number;
  net: number;
  vpip: boolean;
  pfr: boolean;
  threeBet: boolean;
  sawFlop: boolean;
  sawShowdown: boolean;
  wonShowdown: boolean;
  wonHand: boolean;
}

export interface HandRecord {
  handNo: number;
  startedAt: Date;
  serverSeedHash: string;
  serverSeed: string;
  clientSeeds: unknown;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  board: unknown;
  potTotal: number;
  history: unknown;
  players: HandPlayerRecord[];
}

/** Everything the game needs to store. Swappable so tests can run without a database. */
export interface Persistence {
  saveSnapshot(roomId: string, status: RoomStatusValue, snapshot: unknown): Promise<void>;
  saveHand(roomId: string, hand: HandRecord): Promise<void>;
  addLedger(roomId: string, entry: LedgerRecord): Promise<void>;
  markMember(roomId: string, userId: string, played: boolean): Promise<void>;
  endRoom(roomId: string, results: unknown): Promise<void>;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export class PrismaPersistence implements Persistence {
  async saveSnapshot(roomId: string, status: RoomStatusValue, snapshot: unknown) {
    await db().room.update({ where: { id: roomId }, data: { status, snapshot: json(snapshot) } });
  }

  async saveHand(roomId: string, h: HandRecord) {
    await db().hand.create({
      data: {
        roomId,
        handNo: h.handNo,
        startedAt: h.startedAt,
        serverSeedHash: h.serverSeedHash,
        serverSeed: h.serverSeed,
        clientSeeds: json(h.clientSeeds),
        smallBlind: h.smallBlind,
        bigBlind: h.bigBlind,
        ante: h.ante,
        board: json(h.board),
        potTotal: h.potTotal,
        history: json(h.history),
        players: { create: h.players.map((p) => ({ ...p, holeCards: json(p.holeCards) })) },
      },
    });
  }

  async addLedger(roomId: string, e: LedgerRecord) {
    await db().ledgerEntry.create({ data: { roomId, ...e } });
  }

  async markMember(roomId: string, userId: string, played: boolean) {
    await db().roomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, played },
      update: played ? { played: true } : {},
    });
  }

  async endRoom(roomId: string, results: unknown) {
    await db().room.update({ where: { id: roomId }, data: { status: 'ENDED', endedAt: new Date(), results: json(results), snapshot: undefined } });
  }
}

/** In-memory persistence for tests. */
export class MemoryPersistence implements Persistence {
  snapshots = new Map<string, unknown>();
  hands: (HandRecord & { roomId: string })[] = [];
  ledger: (LedgerRecord & { roomId: string })[] = [];
  members = new Map<string, boolean>();
  ended = new Map<string, unknown>();
  async saveSnapshot(roomId: string, _status: RoomStatusValue, snapshot: unknown) {
    this.snapshots.set(roomId, structuredClone(snapshot));
  }
  async saveHand(roomId: string, hand: HandRecord) {
    this.hands.push({ roomId, ...structuredClone(hand) });
  }
  async addLedger(roomId: string, entry: LedgerRecord) {
    this.ledger.push({ roomId, ...entry });
  }
  async markMember(roomId: string, userId: string, played: boolean) {
    this.members.set(`${roomId}:${userId}`, played || (this.members.get(`${roomId}:${userId}`) ?? false));
  }
  async endRoom(roomId: string, results: unknown) {
    this.ended.set(roomId, results);
  }
}
