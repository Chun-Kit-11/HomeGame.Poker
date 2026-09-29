import { Router } from 'express';
import { roomConfigSchema } from '@poker/shared';
import { requireUser } from '../auth/routes';
import { db } from '../db';
import { newRoomCode } from '../rooms/codes';
import type { RoomManager } from '../rooms/RoomManager';

export function roomsRouter(manager: RoomManager): Router {
  const r = Router();

  r.post('/', requireUser, async (req, res) => {
    const parsed = roomConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' });
      return;
    }
    const config = parsed.data;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode();
      try {
        const row = await db().room.create({
          data: {
            code,
            name: config.name,
            hostId: req.user!.id,
            gameMode: config.gameMode,
            moneyMode: config.moneyMode,
            config,
            members: { create: { userId: req.user!.id } },
          },
        });
        manager.add({ id: row.id, code, hostId: row.hostId, config, status: 'OPEN' });
        res.status(201).json({ code });
        return;
      } catch (err: unknown) {
        if ((err as { code?: string }).code !== 'P2002') throw err; // retry on code collision
      }
    }
    res.status(500).json({ error: 'Could not create room' });
  });

  r.get('/', requireUser, async (req, res) => {
    const rooms = await db().room.findMany({
      where: { OR: [{ hostId: req.user!.id }, { members: { some: { userId: req.user!.id } } }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { code: true, name: true, gameMode: true, moneyMode: true, status: true, createdAt: true, host: { select: { username: true } } },
    });
    res.json({ rooms: rooms.map((x) => ({ ...x, host: x.host.username })) });
  });

  /** Recent hands of a room, newest first (members only): powers the in-table history sheet. */
  r.get('/:code/hands', requireUser, async (req, res) => {
    const room = await db().room.findUnique({ where: { code: String(req.params.code).toUpperCase() }, select: { id: true, hostId: true } });
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const member = await db().roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: req.user!.id } } });
    if (!member && room.hostId !== req.user!.id) {
      res.status(403).json({ error: 'Join the room first' });
      return;
    }
    const hands = await db().hand.findMany({ where: { roomId: room.id }, orderBy: { handNo: 'desc' }, take: 50, select: { id: true, handNo: true, endedAt: true } });
    res.json({ hands });
  });

  r.get('/:code', requireUser, async (req, res) => {
    const row = await db().room.findUnique({
      where: { code: String(req.params.code).toUpperCase() },
      select: { id: true, code: true, name: true, gameMode: true, moneyMode: true, status: true, host: { select: { username: true } } },
    });
    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: { ...row, host: row.host.username } });
  });

  return r;
}
