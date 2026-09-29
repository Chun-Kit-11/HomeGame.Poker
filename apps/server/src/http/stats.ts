import { Router } from 'express';
import { requireUser } from '../auth/routes';
import { db } from '../db';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Lifetime playing statistics for the current user. */
export function statsRouter(): Router {
  const r = Router();
  r.get('/', requireUser, async (req, res) => {
    const rows = await db().handPlayer.findMany({
      where: { userId: req.user!.id },
      select: {
        position: true,
        net: true,
        vpip: true,
        pfr: true,
        threeBet: true,
        sawFlop: true,
        sawShowdown: true,
        wonShowdown: true,
        wonHand: true,
        hand: { select: { bigBlind: true, potTotal: true, room: { select: { gameMode: true } } } },
      },
    });
    const n = rows.length;
    const count = (f: (x: (typeof rows)[number]) => boolean) => rows.filter(f).length;
    const cash = rows.filter((x) => x.hand.room.gameMode === 'CASH');
    const bbWon = cash.reduce((t, x) => t + x.net / x.hand.bigBlind, 0);
    const positions = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
      .map((p) => {
        const ps = rows.filter((x) => x.position === p);
        return {
          position: p,
          hands: ps.length,
          vpip: pct(ps.filter((x) => x.vpip).length, ps.length),
          bbPer100: ps.length ? Math.round((ps.reduce((t, x) => t + x.net / x.hand.bigBlind, 0) / ps.length) * 100 * 10) / 10 : null,
        };
      })
      .filter((p) => p.hands > 0);
    res.json({
      hands: n,
      vpip: pct(count((x) => x.vpip), n),
      pfr: pct(count((x) => x.pfr), n),
      threeBet: pct(count((x) => x.threeBet), n),
      wtsd: pct(count((x) => x.sawShowdown), count((x) => x.sawFlop)),
      wsd: pct(count((x) => x.wonShowdown), count((x) => x.sawShowdown)),
      handsWon: pct(count((x) => x.wonHand), n),
      cashHands: cash.length,
      bbPer100: cash.length ? Math.round((bbWon / cash.length) * 100 * 10) / 10 : null,
      biggestPotWon: Math.max(0, ...rows.filter((x) => x.wonHand).map((x) => x.hand.potTotal)),
      positions,
    });
  });
  return r;
}
