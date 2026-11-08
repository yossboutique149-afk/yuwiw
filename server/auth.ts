import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, getMeta, setMeta, uid, now } from './db';

const COOKIE = 'yumera_session';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  let stored = getMeta('session_secret');
  if (!stored) {
    stored = crypto.randomBytes(48).toString('hex');
    setMeta('session_secret', stored);
  }
  return stored;
}

export type PublicUser = {
  id: string;
  email?: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  cover_url: string | null;
  locale: string;
  is_private: number;
  role: string;
  email_verified: number;
  created_at: string;
};

export type AuthedRequest = Request<Record<string, string>> & { user?: PublicUser };

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, secret(), { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    maxAge: THIRTY_DAYS,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function userById(id: string): PublicUser | undefined {
  return db
    .prepare(
      'SELECT id, email, username, display_name, bio, avatar_url, cover_url, locale, is_private, role, email_verified, created_at FROM users WHERE id = ?'
    )
    .get(id) as PublicUser | undefined;
}

export function userByUsername(username: string): PublicUser | undefined {
  return db
    .prepare(
      'SELECT id, email, username, display_name, bio, avatar_url, cover_url, locale, is_private, role, email_verified, created_at FROM users WHERE lower(username) = lower(?)'
    )
    .get(username) as PublicUser | undefined;
}

function readSession(req: Request): PublicUser | undefined {
  const token = req.cookies?.[COOKIE];
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, secret()) as { sub?: string };
    if (!payload.sub) return undefined;
    return userById(payload.sub);
  } catch {
    return undefined;
  }
}

export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  req.user = readSession(req);
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  next();
}

export function requireOfficial(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role !== 'official' && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

export function newResetToken(userId: string, kind: 'reset' | 'verify' = 'reset') {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (token, user_id, expires_at, used, kind) VALUES (?, ?, ?, 0, ?)').run(
    token,
    userId,
    expires,
    kind
  );
  return token;
}

export function consumeResetToken(token: string, kind: 'reset' | 'verify' = 'reset') {
  const row = db
    .prepare('SELECT token, user_id, expires_at, used, kind FROM password_resets WHERE token = ?')
    .get(token) as { token: string; user_id: string; expires_at: string; used: number; kind: string } | undefined;
  if (!row || row.used || row.kind !== kind) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
  return row.user_id;
}

export const sessionCreatedAt = now;

/** True when either user has blocked the other. */
export function isBlocked(a: string, b: string) {
  const row = db
    .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
    .get(a, b, b, a);
  return Boolean(row);
}

export function newId() {
  return uid();
}
