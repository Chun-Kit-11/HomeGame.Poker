import { Router, type Response } from 'express';
import { type LedgerLine, type RoomConfig, computeBalances, findDiscrepancies, minorToDecimal, toCsv } from '@poker/shared';
import { requireUser } from '../auth/routes';
import { db } from '../db';

interface StoredResults {
  stats?: { handsPlayed: number; biggestPot: number; players: { userId: string; username: string; buyIn: number; cashOut: number; net: number; handsPlayed: number }[] };
  ledger?: {
    currency: string;
    balances: { userId: string; username: string; paidIn: number; paidOut: number; net: number; chipsIn: number; chipsOut: number }[];
    transfers: { from: string; to: string; amount: number }[];
    discrepancies: { kind: string; message: string; amount: number }[];
    rounded: boolean;
  } | null;
  tournament?: { entrants: number; prizePool: number; standings: { place: number; userId: string; username: string; prize: number }[] };
}

async function loadSession(code: string, me: string, res: Response) {
  const room = await db().room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      host: { select: { username: true } },
      ledger: { orderBy: { createdAt: 'asc' }, include: { user: { select: { username: true } } } },
      members: { where: { userId: me } },
    },
  });
  if (!room) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (room.members.length === 0 && room.hostId !== me) {
    res.status(403).json({ error: 'Only players from this session can view it' });
    return null;
  }
  const config = room.config as unknown as RoomConfig;
  const results = (room.results ?? null) as StoredResults | null;
  const names = new Map(room.ledger.map((l) => [l.userId, l.user.username]));
  let ledger = results?.ledger ?? null;
  // Live (provisional) numbers while the session is still running
  if (!ledger && room.moneyMode === 'LEDGER' && config.ledger) {
    const lines: LedgerLine[] = room.ledger.map((l) => ({ userId: l.userId, type: l.type, chips: l.chips, amountMinor: l.amountMinor }));
    const { balances, rounded } = computeBalances(lines, room.gameMode, config.ledger.ratio);
    ledger = {
      currency: config.ledger.currency,
      balances: balances.map((b) => ({ ...b, username: names.get(b.userId) ?? '?' })),
      transfers: [],
      discrepancies: room.status === 'ENDED' ? findDiscrepancies(balances, room.gameMode) : [],
      rounded,
    };
  }
  return { room, config, results, ledger, names };
}

export function sessionsRouter(): Router {
  const r = Router();

  /** My sessions with my result in each. */
  r.get('/', requireUser, async (req, res) => {
    res.json({ sessions: await mySessions(req.user!.id) });
  });

  /** All my sessions as CSV. */
  r.get('/export.csv', requireUser, async (req, res) => {
    const sessions = await mySessions(req.user!.id);
    const rows: unknown[][] = [['Date', 'Room', 'Code', 'Game', 'Money', 'Status', 'Currency', 'Paid in', 'Received', 'Net', 'Net chips']];
    for (const s of sessions) {
      rows.push([
        new Date(s.createdAt).toISOString().slice(0, 10),
        s.name,
        s.code,
        s.gameMode,
        s.moneyMode,
        s.status,
        s.currency ?? '',
        s.paidIn !== null ? minorToDecimal(s.paidIn) : '',
        s.paidOut !== null ? minorToDecimal(s.paidOut) : '',
        s.net !== null ? minorToDecimal(s.net) : '',
        s.netChips ?? '',
      ]);
    }
    sendCsv(res, `poker-sessions-${req.user!.username}.csv`, toCsv(rows));
  });

  r.get('/:code', requireUser, async (req, res) => {
    const s = await loadSession(String(req.params.code), req.user!.id, res);
    if (!s) return;
    const { room, config, results, ledger } = s;
    res.json({
      room: {
        code: room.code,
        name: room.name,
        host: room.host.username,
        gameMode: room.gameMode,
        moneyMode: room.moneyMode,
        status: room.status,
        createdAt: room.createdAt,
        endedAt: room.endedAt,
        config,
      },
      entries: room.ledger.map((l) => ({ id: l.id, username: l.user.username, userId: l.userId, type: l.type, chips: l.chips, amountMinor: l.amountMinor, createdAt: l.createdAt })),
      stats: results?.stats ?? null,
      tournament: results?.tournament ?? null,
      ledger,
    });
  });

  r.get('/:code/export.csv', requireUser, async (req, res) => {
    const s = await loadSession(String(req.params.code), req.user!.id, res);
    if (!s) return;
    const { room, ledger, results, names } = s;
    const rows: unknown[][] = [
      ['Session', room.name],
      ['Code', room.code],
      ['Game', room.gameMode],
      ['Money', room.moneyMode],
      ['Started', room.createdAt.toISOString()],
      ['Ended', room.endedAt?.toISOString() ?? 'in progress'],
      [],
      ['Entries'],
      ['Time', 'Player', 'Type', 'Chips', `Amount${ledger ? ` (${ledger.currency})` : ''}`],
      ...room.ledger.map((l) => [l.createdAt.toISOString(), l.user.username, l.type, l.chips, minorToDecimal(l.amountMinor)]),
    ];
    if (ledger) {
      rows.push([], ['Results'], ['Player', 'Paid in', 'Received', 'Net']);
      for (const b of ledger.balances) rows.push([b.username, minorToDecimal(b.paidIn), minorToDecimal(b.paidOut), minorToDecimal(b.net)]);
      rows.push(['Total', '', '', minorToDecimal(ledger.balances.reduce((t, b) => t + b.net, 0))]);
      rows.push([], ['Settle up'], ['From', 'To', 'Amount']);
      for (const t of ledger.transfers) rows.push([names.get(t.from) ?? t.from, names.get(t.to) ?? t.to, minorToDecimal(t.amount)]);
      for (const d of ledger.discrepancies) rows.push(['DISCREPANCY', d.message]);
    } else if (results?.stats) {
      rows.push([], ['Results (chips)'], ['Player', 'Bought in', 'Cashed out', 'Net']);
      for (const p of results.stats.players) rows.push([p.username, p.buyIn, p.cashOut, p.net]);
    }
    if (results?.tournament) {
      rows.push([], ['Standings'], ['Place', 'Player', 'Prize']);
      for (const st of results.tournament.standings) rows.push([st.place, st.username, minorToDecimal(st.prize)]);
    }
    sendCsv(res, `poker-${room.code}.csv`, toCsv(rows));
  });

  return r;
}

function sendCsv(res: Response, filename: string, body: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.send('﻿' + body); // BOM so Excel reads UTF-8
}

async function mySessions(me: string) {
  const rooms = await db().room.findMany({
    where: { OR: [{ hostId: me }, { members: { some: { userId: me, played: true } } }] },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { ledger: { where: { userId: me } } },
  });
  return rooms.map((room) => {
    const config = room.config as unknown as RoomConfig;
    const results = (room.results ?? null) as StoredResults | null;
    const stored = results?.ledger?.balances.find((b) => b.userId === me);
    const inTypes = ['BUY_IN', 'REBUY', 'TOP_UP', 'ENTRY', 'ADDON'];
    const paidIn = room.ledger.filter((l) => inTypes.includes(l.type)).reduce((t, l) => t + l.amountMinor, 0);
    const paidOut = room.ledger.filter((l) => !inTypes.includes(l.type)).reduce((t, l) => t + l.amountMinor, 0);
    const chipsIn = room.ledger.filter((l) => inTypes.includes(l.type) && room.gameMode === 'CASH').reduce((t, l) => t + l.chips, 0);
    const chipsOut = room.ledger.filter((l) => l.type === 'CASH_OUT').reduce((t, l) => t + l.chips, 0);
    const ledgerMode = room.moneyMode === 'LEDGER';
    return {
      code: room.code,
      name: room.name,
      gameMode: room.gameMode,
      moneyMode: room.moneyMode,
      status: room.status,
      createdAt: room.createdAt,
      endedAt: room.endedAt,
      currency: ledgerMode ? (config.ledger?.currency ?? null) : null,
      paidIn: ledgerMode ? (stored?.paidIn ?? paidIn) : null,
      paidOut: ledgerMode ? (stored?.paidOut ?? paidOut) : null,
      net: ledgerMode ? (stored?.net ?? paidOut - paidIn) : null,
      netChips: room.gameMode === 'CASH' && room.status === 'ENDED' ? chipsOut - chipsIn : null,
    };
  });
}

