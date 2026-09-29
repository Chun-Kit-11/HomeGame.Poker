import { createHash, randomBytes } from 'node:crypto';
import { parse as parseCookie, serialize } from 'cookie';
import { db } from '../db';
import { env } from '../env';

export const SESSION_COOKIE = 'poker_sid';
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  username: string;
}

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a session and returns the raw token to put in the cookie. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db().session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
    },
  });
  return token;
}

export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await db().session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db().session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db().session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return parseCookie(header)[SESSION_COOKIE];
}

export function sessionCookie(token: string): string {
  return serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearedSessionCookie(): string {
  return serialize(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: 0,
  });
}
