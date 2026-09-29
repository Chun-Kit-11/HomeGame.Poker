import { describe, expect, it } from 'vitest';
import { combineClientSeeds, commitmentOf, dealFromDeck, shuffleDeck } from '@poker/shared';
import { FairDealer } from '../src/rooms/dealer';
import { cashConfig, FakeClock, FakeTransport, playPassively, settle } from './harness';
import { MemoryPersistence } from '../src/persistence';
import { Room } from '../src/rooms/Room';

describe('fair dealer', () => {
  it('publishes the commitment first, waits for seeds, and the dealt cards can be recomputed', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const persistence = new MemoryPersistence();
    const dealer = new FairDealer('FAIR01', (e, p) => transport.toAll(e, p), clock, 1500);
    const room = new Room(
      { id: 'r', code: 'FAIR01', hostId: 'host', config: cashConfig({ autoApprove: true }), status: 'OPEN' },
      { persistence, clock, transport, dealer, delays: { afterHand: 500, afterShowdown: 500, decisionMs: 5000, runoutStep: 10 } },
    );
    const users = ['host', 'bob', 'cara'];
    users.forEach((u, i) => {
      room.join(u, u);
      room.requestSeat(u, i * 3, 100, 'waitForBB');
    });
    room.start('host');
    await settle();
    const commit = transport.sent.find((m) => m.event === 'fair:commit')!;
    expect(commit.payload).toMatchObject({ handNo: 1, handId: 'FAIR01#1' });
    // Hand not dealt yet: waiting for seeds
    room.broadcastNow();
    expect(transport.lastView('host').hand).toBeNull();
    room.submitSeed('host', 1, 'host-seed');
    room.submitSeed('bob', 1, 'bob-seed');
    room.submitSeed('bob', 1, 'changed-my-mind'); // ignored: first submission counts
    room.submitSeed('cara', 1, 'cara-seed');
    await settle();
    room.broadcastNow();
    const live = transport.lastView('host').hand!;
    expect(live.fair).toEqual({ serverSeedHash: commit.payload.serverSeedHash, serverSeed: null }); // seed secret during the hand

    await playPassively(room, transport, clock, users);
    await room.flush();
    const rec = persistence.hands[0];
    expect(commitmentOf(rec.serverSeed)).toBe(rec.serverSeedHash);
    const cs = rec.clientSeeds as { handId: string; seeds: { seat: number; seed: string }[] };
    expect(cs.seeds.map((s) => s.seed).sort()).toEqual(['bob-seed', 'cara-seed', 'host-seed']);
    const deck = shuffleDeck(rec.serverSeed, combineClientSeeds(cs.seeds), cs.handId);
    const history = rec.history as { config: { buttonSeat: number } };
    const board = (rec.board as { board: number[] }).board;
    const dealt = dealFromDeck(deck, { seats: rec.players.map((p) => p.seat), buttonSeat: history.config.buttonSeat, boardLength: board.length });
    for (const p of rec.players) expect(p.holeCards).toEqual(dealt.holes.get(p.seat));
    expect(board).toEqual(dealt.board);
    // After the hand, the seed is revealed in the view
    room.broadcastNow();
    expect(transport.lastView('host').hand!.fair!.serverSeed).toBe(rec.serverSeed);
    room.dispose();
  });

  it('does not wait longer than the timeout for missing seeds', async () => {
    const c = new FakeClock();
    const d = new FairDealer('X', () => undefined, c, 1500);
    const p = d.prepare(1, [
      { seat: 0, userId: 'a', connected: true },
      { seat: 1, userId: 'b', connected: true },
    ]);
    d.submitSeed('a', 1, 's');
    await c.advance(1500);
    const { fair } = await p;
    expect(fair.clientSeeds.find((s) => s.userId === 'b')!.seed).toBe('');
  });
});
