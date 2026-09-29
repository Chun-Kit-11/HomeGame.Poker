import type { HandEvent } from '@poker/engine';

export interface HandDetail {
  id: string;
  room: { code: string; name: string };
  handNo: number;
  startedAt: string;
  endedAt: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  board: { board: number[]; board2: number[] | null };
  potTotal: number;
  mySeat: number | null;
  players: {
    userId: string;
    username: string;
    seat: number;
    position: string;
    holeCards: number[] | null;
    shown: boolean;
    startStack: number;
    endStack: number;
    net: number;
  }[];
  config: { buttonSeat: number; sbSeat: number | null; bbSeat: number; smallBlind: number; bigBlind: number; bigBlindAnte: number };
  events: HandEvent[];
  fair: { serverSeedHash: string; serverSeed: string; handId: string; clientSeeds: { seat: number; seed: string; username: string }[] };
}
