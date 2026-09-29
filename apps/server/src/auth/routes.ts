import { Router, type Request, type Response, type NextFunction } from 'express';
import { credentialsSchema } from '@poker/shared';
import { db } from '../db';
import { RateLimiter } from '../ratelimit';
import { hashPassword, verifyPassword } from './password';
import {
  type AuthUser,
  clearedSessionCookie,
  createSession,
  destroySession,
  sessionCookie,
  tokenFromCookieHeader,
  userFromToken,
} from './sessions';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser | null;
  }
}

// 10 login/register attempts per IP, refilling one every 30s.
const authLimiter = new RateLimiter(10, 1 / 30);

// A fixed dummy hash so failed logins for unknown users take as long as real ones.
let dummyHash: Promise<string> | null = null;

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
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  next();
}

export function authRouter(): Router {
  const r = Router();

  r.post('/register', async (req, res) => {
    if (!authLimiter.take(`ip:${req.ip}`)) {
      res.status(429).json({ error: 'Too many attempts, try again later' });
      return;
    }
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    const { username, password } = parsed.data;
    const usernameLower = username.toLowerCase();
    const existing = await db().user.findUnique({ where: { usernameLower } });
    if (existing) {
      res.status(409).json({ error: 'That username is taken' });
      return;
    }
    const user = await db().user.create({
      data: { username, usernameLower, passwordHash: await hashPassword(password) },
      select: { id: true, username: true },
    });
    res.setHeader('Set-Cookie', sessionCookie(await createSession(user.id)));
    res.status(201).json({ user });
  });

  r.post('/login', async (req, res) => {
    if (!authLimiter.take(`ip:${req.ip}`)) {
      res.status(429).json({ error: 'Too many attempts, try again later' });
      return;
    }
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json({ error: 'Wrong username or password' });
      return;
    }
    const { username, password } = parsed.data;
    const user = await db().user.findUnique({ where: { usernameLower: username.toLowerCase() } });
    if (!user) {
      dummyHash ??= hashPassword('dummy-password-for-timing');
      await verifyPassword(await dummyHash, password);
      res.status(401).json({ error: 'Wrong username or password' });
      return;
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      res.status(401).json({ error: 'Wrong username or password' });
      return;
    }
    res.setHeader('Set-Cookie', sessionCookie(await createSession(user.id)));
    res.json({ user: { id: user.id, username: user.username } });
  });

  r.post('/logout', async (req, res) => {
    await destroySession(tokenFromCookieHeader(req.headers.cookie));
    res.setHeader('Set-Cookie', clearedSessionCookie());
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return r;
}
