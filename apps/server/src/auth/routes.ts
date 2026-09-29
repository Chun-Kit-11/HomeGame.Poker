import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { guestSchema } from '@poker/shared';
import { db } from '../db';
import { RateLimiter } from '../ratelimit';
import { type AuthUser, createSession, sessionCookie, tokenFromCookieHeader, userFromToken } from './sessions';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser | null;
  }
}

// 10 new guests per IP, refilling one every 30s.
const guestLimiter = new RateLimiter(10, 1 / 30);

/** Attaches req.user (or null) from the session cookie. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await userFromToken(tokenFromCookieHeader(req.headers.cookie));
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Enter your name first' });
    return;
  }
  next();
}

/**
 * There are no accounts: a player just types a name. The first time, this
 * creates a guest identity remembered by the session cookie on that device;
 * afterwards it only changes the name.
 */
export function authRouter(): Router {
  const r = Router();

  r.post('/guest', async (req, res) => {
    const parsed = guestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid name' });
      return;
    }
    const { name } = parsed.data;
    if (req.user) {
      const user = await db().user.update({ where: { id: req.user.id }, data: { username: name }, select: { id: true, username: true } });
      res.json({ user });
      return;
    }
    if (!guestLimiter.take(`ip:${req.ip}`)) {
      res.status(429).json({ error: 'Too many attempts, try again later' });
      return;
    }
    const user = await db().user.create({
      // Names need not be unique, so the unique key is a random guest id and there is no password.
      data: { username: name, usernameLower: `guest_${randomBytes(12).toString('base64url')}`, passwordHash: '' },
      select: { id: true, username: true },
    });
    res.setHeader('Set-Cookie', sessionCookie(await createSession(user.id)));
    res.status(201).json({ user });
  });

  r.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return r;
}
