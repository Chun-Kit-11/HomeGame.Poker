import { describe, expect, it } from 'vitest';
import { Room, type RoomSnapshot } from '../src/rooms/Room';
import { cashConfig, makeRoom, playPassively, settle } from './harness';

describe('disconnects and crash recovery', () => {
  it('a disconnected player keeps their seat, is auto-acted without using the time bank, and sees their cards on reconnect', async () => {
    const { room, transport, clock } = makeRoom(cashConfig({ autoApprove: true }));
    for (const [i, u] of ['host', 'bob'].entries()) {
      room.join(u, u);
      room.requestSeat(u, i, 100, 'waitForBB');
    }
    room.start('host');
    await settle();
    room.broadcastNow();
    const v = transport.lastView('host');
    const actorSeat = v.hand!.toAct!;
    const actor = v.seats[actorSeat]!.userId;
    room.disconnect(actor);
    room.broadcastNow();
    expect(transport.lastView(actor === 'host' ? 'bob' : 'host').seats[actorSeat]!.connected).toBe(false);
    // Normal 15s preflop timer, no time-bank chip used while offline
    await clock.advance(15_000);
    expect(room.seatOf(actor)!.timeBankChips).toBe(6);
    expect(room.seatOf(actor)).not.toBeNull();
    // Reconnect: their view includes their own hole cards again
    room.join(actor, actor);
    await clock.advance(2000); // next hand starts
    room.broadcastNow();
    const back = transport.lastView(actor);
    expect(back.me.seat).toBe(actorSeat);
    expect(Array.isArray(back.seats[actorSeat]!.cards)).toBe(true);
    room.dispose();
  });

  it('restores seats, stacks, positions and the ledger from a snapshot (a hand in progress is voided)', async () => {
    const { room, transport, clock, persistence } = makeRoom(cashConfig({ autoApprove: true }));
    const users = ['host', 'bob', 'cara'];
    users.forEach((u, i) => {
      room.join(u, u);
      room.requestSeat(u, i, 100, 'waitForBB');
    });
    room.start('host');
    for (let h = 0; h < 3; h++) {
      await playPassively(room, transport, clock, users);
      await clock.advance(1500);
    }
    // A new hand is now in progress; the server "crashes"
    await room.flush();
    const snap = persistence.snapshots.get('room1') as RoomSnapshot;
    room.dispose();
    const stacksBefore = snap.seats.map((s) => s.stack).reduce((a, b) => a + b, 0);
    expect(stacksBefore).toBe(300); // start-of-hand stacks: nothing in the voided hand is lost

    const again = makeRoom(cashConfig({ autoApprove: true }));
    const restored = new Room({ id: 'room1', code: 'TEST01', hostId: 'host', config: cashConfig({ autoApprove: true }), status: 'RUNNING' }, {
      persistence: again.persistence,
      clock: again.clock,
      transport: again.transport,
      dealer: { prepare: async () => ({ deck: Array.from({ length: 52 }, (_, i) => i), fair: { serverSeedHash: '', serverSeed: '', handId: '', clientSeeds: [] } }) },
    }, snap);
    expect(restored.status).toBe('PAUSED');
    for (const u of users) expect(restored.seatOf(u)).not.toBeNull();
    restored.join('host', 'host');
    restored.resume('host');
    await settle();
    restored.broadcastNow();
    const v = again.transport.lastView('host');
    expect(v.hand!.handNo).toBe(snap.handNo + 1);
    expect(v.stats.players.reduce((t, p) => t + p.buyIn, 0)).toBe(300);
    restored.dispose();
  });

  it('a buy-in is in the snapshot immediately (no chips lost if the server crashes right after)', async () => {
    const { room, persistence } = makeRoom(cashConfig({ autoApprove: true }));
    room.join('host', 'host');
    room.requestSeat('host', 0, 150, 'waitForBB');
    await room.flush();
    const snap = persistence.snapshots.get('room1') as RoomSnapshot;
    expect(snap.seats.find((s) => s.userId === 'host')!.stack).toBe(150);
    expect(snap.ledger).toHaveLength(1);
  });
});
