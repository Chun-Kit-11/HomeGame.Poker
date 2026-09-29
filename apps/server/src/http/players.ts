import { Router } from 'express';
import { z } from 'zod';
import { type HandEvent, preflopFlags } from '@poker/engine';
import { requireUser } from '../auth/routes';
import { db } from '../db';

export const LABEL_COLORS = ['#b91c1c', '#0d9488', '#c2410c', '#1d4ed8', '#a16207', '#7c2d12', '#4d7c0f', '#6d28d9', '#15803d', '#9d6b7d'];

const noteSchema = z.object({
  color: z.string().refine((c) => LABEL_COLORS.includes(c)).nullable(),
  note: z.string().max(1000),
});

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

/** Player profiles (stats from hands you played together) and private notes. */
export function playersRouter(): Router {
  const r = Router();

  /** My notes/labels for several players at once: ?ids=a,b,c */
  r.get('/notes', requireUser, async (req, res) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .filter(Boolean)
      .slice(0, 20);
    const rows = await db().playerNote.findMany({ where: { ownerId: req.user!.id, targetId: { in: ids } } });
    res.json({ notes: Object.fromEntries(rows.map((n) => [n.targetId, { color: n.color, note: n.note }])) });
  });

  r.put('/:id/note', requireUser, async (req, res) => {
    const parsed = noteSchema.safeParse(req.body);
    const targetId = String(req.params.id);
    if (!parsed.success || targetId === req.user!.id) {
      res.status(400).json({ error: 'Invalid note' });
      return;
    }
    const target = await db().user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    const data = { color: parsed.data.color, note: parsed.data.note.trim() };
    await db().playerNote.upsert({
      where: { ownerId_targetId: { ownerId: req.user!.id, targetId } },
      create: { ownerId: req.user!.id, targetId, ...data },
      update: data,
    });
    res.json({ ok: true });
  });

  /**
   * Profile with stats computed ONLY from hands the viewer also played in
   * (like a poker tracker's HUD), so nobody sees stats from games they weren't part of.
   */
  r.get('/:id/profile', requireUser, async (req, res) => {
    const me = req.user!.id;
    const targetId = String(req.params.id);
    const user = await db().user.findUnique({ where: { id: targetId }, select: { id: true, username: true, createdAt: true } });
    if (!user) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    const hands = await db().hand.findMany({
      where: targetId === me ? { players: { some: { userId: me } } } : { AND: [{ players: { some: { userId: targetId } } }, { players: { some: { userId: me } } }] },
      orderBy: { endedAt: 'desc' },
      take: 1000,
      select: { history: true, bigBlind: true, players: { where: { userId: targetId }, select: { seat: true, position: true, net: true, sawFlop: true, sawShowdown: true, wonShowdown: true } } },
    });
    let vpip = 0, pfr = 0, tbo = 0, tb = 0, so = 0, st = 0, flops = 0, sd = 0, wsd = 0, bbWon = 0;
    for (const h of hands) {
      const p = h.players[0];
      if (!p) continue;
      const events = (h.history as unknown as { events: HandEvent[] }).events;
      const f = preflopFlags(events, p.seat, p.position);
      if (f.vpip) vpip++;
      if (f.pfr) pfr++;
      if (f.threeBetOpp) tbo++;
      if (f.threeBet) tb++;
      if (f.stealOpp) so++;
      if (f.steal) st++;
      if (p.sawFlop) flops++;
      if (p.sawShowdown) sd++;
      if (p.wonShowdown) wsd++;
      bbWon += p.net / h.bigBlind;
    }
    const n = hands.length;
    const note = targetId === me ? null : await db().playerNote.findUnique({ where: { ownerId_targetId: { ownerId: me, targetId } } });
    res.json({
      user: { id: user.id, username: user.username, memberSince: user.createdAt },
      together: targetId !== me,
      hands: n,
      vpip: pct(vpip, n),
      pfr: pct(pfr, n),
      threeBet: pct(tb, tbo),
      ats: pct(st, so),
      wtsd: pct(sd, flops),
      wsd: pct(wsd, sd),
      bbPer100: n ? Math.round((bbWon / n) * 1000) / 10 : null,
      note: note ? { color: note.color, note: note.note } : { color: null, note: '' },
      colors: LABEL_COLORS,
    });
  });

  return r;
}
