import { Router } from 'express';
import { db, uid, now, NOTIFICATION_CATEGORIES } from '../db';
import {
  type AuthedRequest,
  clearSession,
  consumeResetToken,
  hashPassword,
  issueSession,
  newResetToken,
  requireAuth,
  userById,
  userByUsername,
  verifyPassword,
} from '../auth';
import { str, bool } from '../util';
import { createNotification } from '../notify';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

function publicUser(u: ReturnType<typeof userById>) {
  if (!u) return null;
  return u;
}

router.post('/register', (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  const username = str(req.body.username, 24);
  const displayName = str(req.body.display_name, 60) || username;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const locale = ['es', 'en', 'fr', 'ja'].includes(req.body.locale) ? req.body.locale : 'es';

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'email_taken' });
  if (db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(username))
    return res.status(409).json({ error: 'username_taken' });

  const id = uid();
  db.prepare(
    `INSERT INTO users (id, email, username, display_name, password_hash, bio, locale, created_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?)`
  ).run(id, email, username, displayName, hashPassword(password), locale, now());

  for (const category of NOTIFICATION_CATEGORIES) {
    db.prepare('INSERT OR IGNORE INTO notification_preferences (id, user_id, category, enabled, updated_at) VALUES (?, ?, ?, 1, ?)').run(
      uid(),
      id,
      category,
      now()
    );
  }
  db.prepare('INSERT OR IGNORE INTO notification_settings (user_id, updated_at) VALUES (?, ?)').run(id, now());

  createNotification({
    recipientId: id,
    type: 'welcome',
    category: 'system',
    title: 'Welcome to YumEra: Eternal Universe',
    message: 'Your universe is ready. Create your first yumesona and make a portrait.',
    targetType: 'user',
    targetId: username,
    push: false,
  });

  issueSession(res, id);
  res.status(201).json({ user: publicUser(userById(id)) });
});

router.post('/login', (req, res) => {
  const identifier = str(req.body.email || req.body.username, 160);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!identifier || !password) return res.status(400).json({ error: 'missing_credentials' });

  const row = db
    .prepare('SELECT id, password_hash FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
    .get(identifier, identifier) as { id: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });

  issueSession(res, row.id);
  res.json({ user: publicUser(userById(row.id)) });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', (req: AuthedRequest, res) => {
  if (!req.user) return res.json({ user: null });
  const counts = {
    posts: (db.prepare('SELECT count(*) c FROM posts WHERE author_id = ?').get(req.user.id) as { c: number }).c,
    followers: (db.prepare("SELECT count(*) c FROM follows WHERE following_id = ? AND status = 'accepted'").get(req.user.id) as { c: number }).c,
    following: (db.prepare("SELECT count(*) c FROM follows WHERE follower_id = ? AND status = 'accepted'").get(req.user.id) as { c: number }).c,
    unreadNotifications: (
      db.prepare('SELECT count(*) c FROM notifications WHERE recipient_id = ? AND is_read = 0').get(req.user.id) as { c: number }
    ).c,
    unreadMessages: (
      db
        .prepare(
          `SELECT count(*) c FROM messages m
           JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
           WHERE m.sender_id != ? AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)`
        )
        .get(req.user.id, req.user.id) as { c: number }
    ).c,
  };
  res.json({ user: req.user, counts });
});

router.patch('/me', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const displayName = str(req.body.display_name, 60) || user.display_name;
  const bio = str(req.body.bio, 600);
  const locale = ['es', 'en', 'fr', 'ja'].includes(req.body.locale) ? req.body.locale : user.locale;
  const isPrivate = req.body.is_private === undefined ? user.is_private : bool(req.body.is_private) ? 1 : 0;
  const avatar = req.body.avatar_url === undefined ? user.avatar_url : str(req.body.avatar_url, 500) || null;
  const cover = req.body.cover_url === undefined ? user.cover_url : str(req.body.cover_url, 500) || null;

  db.prepare(
    'UPDATE users SET display_name = ?, bio = ?, locale = ?, is_private = ?, avatar_url = ?, cover_url = ? WHERE id = ?'
  ).run(displayName, bio, locale, isPrivate, avatar, cover, user.id);

  res.json({ user: publicUser(userById(user.id)) });
});

router.post('/password', requireAuth, (req: AuthedRequest, res) => {
  const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
  const next = typeof req.body.new_password === 'string' ? req.body.new_password : '';
  if (next.length < 8) return res.status(400).json({ error: 'weak_password' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user!.id);
  res.json({ ok: true });
});

/**
 * Password recovery. YumEra has no email provider configured by default: when it is missing we
 * return the one-time link so the account owner can still recover access, and we say so explicitly.
 */
router.post('/forgot', (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  const row = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email) as { id: string } | undefined;
  const emailConfigured = Boolean(process.env.SMTP_URL || process.env.EMAIL_API_KEY);
  if (!row) return res.json({ ok: true, email_configured: emailConfigured, sent: emailConfigured });
  const token = newResetToken(row.id, 'reset');
  res.json({
    ok: true,
    email_configured: emailConfigured,
    sent: emailConfigured,
    reset_link: emailConfigured ? undefined : `/reset/${token}`,
    note: emailConfigured
      ? 'A recovery link was sent to your email.'
      : 'No email provider is configured on this deployment, so the one-time recovery link is returned here instead of being emailed.',
  });
});

router.post('/reset', (req, res) => {
  const token = str(req.body.token, 80);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
  const userId = consumeResetToken(token, 'reset');
  if (!userId) return res.status(400).json({ error: 'invalid_token' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
  issueSession(res, userId);
  res.json({ ok: true, user: publicUser(userById(userId)) });
});

router.post('/verify-request', requireAuth, (req: AuthedRequest, res) => {
  const token = newResetToken(req.user!.id, 'verify');
  const emailConfigured = Boolean(process.env.SMTP_URL || process.env.EMAIL_API_KEY);
  res.json({
    ok: true,
    email_configured: emailConfigured,
    verify_link: emailConfigured ? undefined : `/verify/${token}`,
    note: emailConfigured
      ? 'A verification link was sent to your email.'
      : 'No email provider is configured on this deployment, so the verification link is returned here.',
  });
});

router.post('/verify', (req, res) => {
  const token = str(req.body.token, 80);
  const userId = consumeResetToken(token, 'verify');
  if (!userId) return res.status(400).json({ error: 'invalid_token' });
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  res.json({ ok: true, user: publicUser(userById(userId)) });
});

router.delete('/me', requireAuth, (req: AuthedRequest, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
  if (!verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  if (req.user!.role === 'official') return res.status(403).json({ error: 'protected_account' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user!.id);
  clearSession(res);
  res.json({ ok: true });
});

router.get('/lookup/:username', (req, res) => {
  const u = userByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'not_found' });
  res.json({ user: u });
});

export default router;
