import { describe, expect, it } from 'vitest';
import { RoomError } from '../src/rooms/Room';
import { cashConfig, makeRoom, playPassively, settle } from './harness';

async function seatedTable(n = 3, configOverrides = {}) {
  const t = makeRoom(cashConfig({ autoApprove: true, ...configOverrides }));
  const users = ['host', 'bob', 'cara', 'dan'].slice(0, n);
  for (const u of users) t.room.join(u, u.toUpperCase());
  users.forEach((u, i) => {
    t.room.requestSeat(u, i, 100, 'waitForBB');
  });
  return { ...t, users };
}

describe('room: seating and buy-ins', () => {
  it('requires host approval unless auto-approve is on', async () => {
    const { room, transport } = makeRoom(cashConfig());
    room.join('host', 'Host');
    room.join('bob', 'Bob');
    room.requestSeat('bob', 3, 100, 'waitForBB');
    await settle();
    let hv = transport.lastView('host');
    expect(hv.requests).toHaveLength(1);
    expect(hv.seats[3]).toMatchObject({ status: 'pending', pendingAmount: 100 });
    // Bob cannot see the host's request list
    expect(transport.lastView('bob').requests).toEqual([]);
    expect(() => room.approve('bob', hv.requests[0].id)).toThrow(RoomError);
    room.approve('host', hv.requests[0].id);
    await settle();
    hv = transport.lastView('host');
    expect(hv.seats[3]).toMatchObject({ status: 'active', stack: 100 });
  });

  it('enforces one seat per account, free seats, and buy-in limits', () => {
    const { room } = makeRoom(cashConfig({ autoApprove: true }));
    room.join('host', 'Host');
    room.join('bob', 'Bob');
    room.requestSeat('bob', 1, 100, 'waitForBB');
    expect(() => room.requestSeat('bob', 2, 100, 'waitForBB')).toThrow(/already have a seat/);
    expect(() => room.requestSeat('host', 1, 100, 'waitForBB')).toThrow(/taken/);
    expect(() => room.requestSeat('host', 2, 10, 'waitForBB')).toThrow(/between 40 and 200/);
    expect(() => room.requestSeat('host', 2, 500, 'waitForBB')).toThrow(/between/);
    expect(() => room.requestSeat('host', 9, 100, 'waitForBB')).toThrow(/No such seat/);
  });
});

describe('room: cash game flow', () => {
  it('deals hands, conserves chips, and records history', async () => {
    const { room, transport, clock, persistence, users } = await seatedTable(3);
    room.start('host');
    await settle();
    for (let h = 0; h < 5; h++) {
      await playPassively(room, transport, clock, users);
      await clock.advance(1500);
    }
    await room.flush();
    expect(persistence.hands.length).toBeGreaterThanOrEqual(5);
    const v = transport.lastView('host');
    const total = v.seats.reduce((t, s) => t + (s?.stack ?? 0), 0) + (v.hand && v.hand.phase !== 'complete' ? v.hand.totalPot : 0);
    expect(total).toBe(300);
    // Button moves every hand
    const buttons = persistence.hands.map((h: any) => h.history.config.buttonSeat);
    for (let i = 1; i < buttons.length; i++) expect(buttons[i]).not.toBe(buttons[i - 1]);
  });

  it('times out to check/fold after spending time-bank chips first', async () => {
    const { room, transport, clock, users } = await seatedTable(2);
    room.start('host');
    await settle();
    room.broadcastNow();
    const v = transport.lastView('host');
    const actor = v.hand!.toAct!;
    const actorUser = v.seats[actor]!.userId;
    const chips = v.seats[actor]!.timeBankChips;
    expect(chips).toBe(6);
    // 15s preflop, then six 10s chips, then auto-action
    await clock.advance(15_000);
    room.broadcastNow();
    expect(transport.lastView(actorUser).seats[actor]!.timeBankChips).toBe(5);
    expect(transport.lastView(actorUser).hand!.usingTimeBank).toBe(true);
    await clock.advance(60_000);
    room.broadcastNow();
    const after = transport.lastView(actorUser);
    expect(after.seats[actor]!.timeBankChips).toBe(0);
    // heads-up SB facing the BB could not check, so it folded
    expect(after.hand!.phase).toBe('complete');
    void users;
  });

  it('a player leaving mid-hand is folded and cashed out when the hand ends', async () => {
    const { room, transport, clock, persistence } = await seatedTable(3);
    room.start('host');
    await settle();
    room.broadcastNow();
    const v = transport.lastView('host');
    const leaver = v.seats.find((s) => s && s.userId !== v.seats[v.hand!.toAct!]!.userId)!;
    room.leaveSeat(leaver.userId);
    await playPassively(room, transport, clock, ['host', 'bob', 'cara']);
    await clock.advance(10);
    await room.flush();
    const nv = transport.lastView('host');
    expect(nv.seats[leaver.seat]).toBeNull();
    const cashOut = persistence.ledger.find((l) => l.type === 'CASH_OUT' && l.userId === leaver.userId);
    expect(cashOut).toBeDefined();
  });

  it('blind changes apply from the next hand', async () => {
    const { room, transport, clock, users } = await seatedTable(3);
    room.start('host');
    await settle();
    room.setBlinds('host', 5, 10);
    room.broadcastNow();
    expect(transport.lastView('host').room.bigBlind).toBe(2);
    expect(transport.lastView('host').room.pendingBlinds).toEqual({ smallBlind: 5, bigBlind: 10 });
    await playPassively(room, transport, clock, users);
    await clock.advance(1500);
    room.broadcastNow();
    const v = transport.lastView('host');
    expect(v.room.bigBlind).toBe(10);
    expect(v.hand!.handNo).toBe(2);
  });

  it('ending the session cashes everyone out and the chip ledger balances', async () => {
    const { room, transport, clock, persistence, users } = await seatedTable(3);
    room.start('host');
    await settle();
    for (let h = 0; h < 3; h++) {
      await playPassively(room, transport, clock, users);
      await clock.advance(1500);
    }
    room.end('host');
    await playPassively(room, transport, clock, users);
    await clock.advance(10);
    await room.flush();
    expect(room.status).toBe('ENDED');
    const net = persistence.ledger.reduce((t, l) => t + (l.type === 'CASH_OUT' ? l.chips : -l.chips), 0);
    expect(net).toBe(0);
  });

  it('non-hosts cannot use host controls', () => {
    const { room } = makeRoom(cashConfig());
    room.join('host', 'Host');
    room.join('bob', 'Bob');
    for (const fn of [() => room.start('bob'), () => room.pause('bob'), () => room.kick('bob', 'host'), () => room.end('bob'), () => room.setBlinds('bob', 1, 2)]) {
      expect(fn).toThrow(/Only the host/);
    }
  });

  it('rejects actions out of turn and for old hands', async () => {
    const { room, transport } = await seatedTable(3);
    room.start('host');
    await settle();
    room.broadcastNow();
    const v = transport.lastView('host');
    const notActor = v.seats.find((s) => s && s.seat !== v.hand!.toAct)!;
    expect(() => room.act(notActor.userId, v.hand!.handNo, { type: 'fold' })).toThrow(/Not your turn/);
    expect(() => room.act('host', v.hand!.handNo - 1, { type: 'fold' })).toThrow(/hand is over/);
  });
});
