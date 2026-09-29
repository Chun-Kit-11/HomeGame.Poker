import { type RoomConfig, roomConfigSchema } from '@poker/shared';
import type { Clock } from '../clock';
import type { Persistence, RoomStatusValue } from '../persistence';
import type { Dealer } from './dealer';
import { Room, type RoomDeps, type RoomInfo, type RoomSnapshot, type Transport } from './Room';
import { TournamentRoom } from './TournamentRoom';

export interface RoomRow {
  id: string;
  code: string;
  hostId: string;
  config: unknown;
  status: RoomStatusValue;
  snapshot: unknown;
}

export interface ManagerDeps {
  persistence: Persistence;
  clock: Clock;
  dealer: (code: string) => Dealer;
  transport: (code: string) => Transport;
  /** Loads a room row by code (from the database) */
  loadRoom: (code: string) => Promise<RoomRow | null>;
  delays?: RoomDeps['delays'];
  /** Picks the Room subclass for a configuration */
  roomFactory?: (info: RoomInfo, deps: RoomDeps, snapshot: RoomSnapshot | null) => Room;
}

/** Keeps live rooms in memory, loading them lazily from the database. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room | null>>();

  constructor(private deps: ManagerDeps) {}

  async get(code: string): Promise<Room | null> {
    const key = code.toUpperCase();
    const live = this.rooms.get(key);
    if (live) return live;
    let p = this.loading.get(key);
    if (!p) {
      p = this.load(key).finally(() => this.loading.delete(key));
      this.loading.set(key, p);
    }
    return p;
  }

  private async load(code: string): Promise<Room | null> {
    const row = await this.deps.loadRoom(code);
    if (!row || row.status === 'ENDED') return null;
    const config = roomConfigSchema.parse(row.config) as RoomConfig;
    const room = this.instantiate({ id: row.id, code: row.code, hostId: row.hostId, config, status: row.status }, (row.snapshot as RoomSnapshot | null) ?? null);
    this.rooms.set(code, room);
    return room;
  }

  instantiate(info: RoomInfo, snapshot: RoomSnapshot | null): Room {
    const deps: RoomDeps = {
      persistence: this.deps.persistence,
      clock: this.deps.clock,
      dealer: this.deps.dealer(info.code),
      transport: this.deps.transport(info.code),
      delays: this.deps.delays,
    };
    if (this.deps.roomFactory) return this.deps.roomFactory(info, deps, snapshot);
    return info.config.gameMode === 'TOURNAMENT' ? new TournamentRoom(info, deps, snapshot) : new Room(info, deps, snapshot);
  }

  /** Registers a freshly created room (avoids a database round-trip). */
  add(info: RoomInfo): Room {
    const room = this.instantiate(info, null);
    this.rooms.set(info.code, room);
    return room;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  async flushAll() {
    await Promise.all(this.all().map((r) => r.flush()));
  }

  disposeAll() {
    for (const r of this.rooms.values()) r.dispose();
  }
}
