import { Router } from 'express';
import { requireUser } from '../auth/routes';
import { db } from '../db';

const PAGE = 30;

export function handsRouter(): Router {
  const r = Router();

  /** Hands I played, newest first. Filters: room code, result (won/lost), showdown only. */
  r.get('/', requireUser, async (req, res) => {
    const me = req.user!.id;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const room = typeof req.query.room === 'string' ? req.query.room.toUpperCase() : undefined;
    const result = req.query.result;
    const rows = await db().handPlayer.findMany({
      where: {
        userId: me,
        ...(result === 'won' ? { net: { gt: 0 } } : result === 'lost' ? { net: { lt: 0 } } : {}),
        ...(req.query.showdown === '1' ? { sawShowdown: true } : {}),
        ...(room ? { hand: { room: { code: room } } } : {}),
      },
      orderBy: [{ hand: { endedAt: 'desc' } }, { handId: 'desc' }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { handId_userId: { handId: cursor, userId: me } }, skip: 1 } : {}),
      include: { hand: { select: { id: true, handNo: true, endedAt: true, board: true, potTotal: true, smallBlind: true, bigBlind: true, room: { select: { code: true, name: true } } } } },
    });
    const more = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    res.json({
      hands: page.map((p) => ({
        id: p.hand.id,
        handNo: p.hand.handNo,
        endedAt: p.hand.endedAt,
        room: p.hand.room,
        blinds: `${p.hand.smallBlind}/${p.hand.bigBlind}`,
        board: p.hand.board,
        potTotal: p.hand.potTotal,
        position: p.position,
        holeCards: p.holeCards,
        net: p.net,
        sawShowdown: p.sawShowdown,
      })),
      nextCursor: more ? page[page.length - 1].handId : null,
    });
  });

  /** Look up a hand by room code and hand number (used by the table's "Verify" link). */
  r.get('/by-number/:code/:handNo', requireUser, async (req, res) => {
    const hand = await db().hand.findFirst({
      where: { handNo: Number(req.params.handNo) || 0, room: { code: String(req.params.code).toUpperCase() } },
      select: { id: true },
    });
    if (!hand) {
      res.status(404).json({ error: 'Hand not found (it may still be saving)' });
      return;
    }
    await sendHand(hand.id, req.user!.id, res);
  });

  /** Full hand history. Visible to members of the room; unshown hole cards stay private. */
  r.get('/:id', requireUser, async (req, res) => {
    await sendHand(String(req.params.id), req.user!.id, res);
  });

  return r;
}

async function sendHand(id: string, me: string, res: import('express').Response) {
  const hand = await db().hand.findUnique({
    where: { id },
    include: {
      room: { select: { id: true, code: true, name: true, hostId: true } },
      players: { include: { user: { select: { username: true } } }, orderBy: { seat: 'asc' } },
    },
  });
  if (!hand) {
    res.status(404).json({ error: 'Hand not found' });
    return;
  }
  const member = await db().roomMember.findUnique({ where: { roomId_userId: { roomId: hand.room.id, userId: me } } });
  if (!member && hand.room.hostId !== me) {
    res.status(403).json({ error: 'Only players from this room can view its hands' });
    return;
  }
  const history = hand.history as { config: Record<string, unknown>; events: unknown[] };
  const seeds = hand.clientSeeds as { handId: string; seeds: { seat: number; userId: string; seed: string }[] };
  const names = new Map(hand.players.map((p) => [p.userId, p.user.username]));
  res.json({
    id: hand.id,
    room: { code: hand.room.code, name: hand.room.name },
    handNo: hand.handNo,
    startedAt: hand.startedAt,
    endedAt: hand.endedAt,
    smallBlind: hand.smallBlind,
    bigBlind: hand.bigBlind,
    ante: hand.ante,
    board: hand.board,
    potTotal: hand.potTotal,
    mySeat: hand.players.find((p) => p.userId === me)?.seat ?? null,
    players: hand.players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      seat: p.seat,
      position: p.position,
      holeCards: p.userId === me || p.shown ? p.holeCards : null,
      shown: p.shown,
      startStack: p.startStack,
      endStack: p.endStack,
      net: p.net,
    })),
    config: history.config,
    events: history.events,
    fair: {
      serverSeedHash: hand.serverSeedHash,
      serverSeed: hand.serverSeed,
      handId: seeds?.handId ?? '',
      clientSeeds: (seeds?.seeds ?? []).map((s) => ({ seat: s.seat, seed: s.seed, username: names.get(s.userId) ?? '' })),
    },
  });
}
