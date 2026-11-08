import { Router } from 'express';
import { db, now, NOTIFICATION_CATEGORIES, type NotificationCategory } from '../db';
import { type AuthedRequest, requireAuth } from '../auth';
import { clampLimit, str } from '../util';
import { createNotification, getSettings, getVapid, sendPush } from '../notify';

const router = Router();

const TONE_OPTIONS = [
  { id: 'signature', name: 'YumEra Signature Tone', description: 'Original crystal bell composed for YumEra.' },
  { id: 'moonlit', name: 'Moonlit Chime', description: 'Soft two-note chime.' },
  { id: 'rosegold', name: 'Rose Gold Bell', description: 'Warm metallic bell.' },
  { id: 'starlit', name: 'Starlit Sparkle', description: 'Quick sparkling notes.' },
  { id: 'velvet', name: 'Velvet Hush', description: 'Low discreet chime.' },
];

router.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const category = str(req.query.category, 40);
  const limit = clampLimit(req.query.limit, 30, 100);
  const onlyUnread = req.query.unread === '1';
  const params: unknown[] = [req.user!.id];
  let where = 'n.recipient_id = ?';
  if (category && category !== 'all' && NOTIFICATION_CATEGORIES.includes(category as NotificationCategory)) {
    where += ' AND n.category = ?';
    params.push(category);
  }
  if (onlyUnread) where += ' AND n.is_read = 0';
  const rows = db
    .prepare(
      `SELECT n.*, a.username AS actor_username, a.display_name AS actor_name, a.avatar_url AS actor_avatar
       FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
       WHERE ${where} ORDER BY n.created_at DESC LIMIT ?`
    )
    .all(...params, limit);
  const unread = (
    db.prepare('SELECT count(*) c FROM notifications WHERE recipient_id = ? AND is_read = 0').get(req.user!.id) as { c: number }
  ).c;
  const counts = db
    .prepare('SELECT category, count(*) c FROM notifications WHERE recipient_id = ? AND is_read = 0 GROUP BY category')
    .all(req.user!.id) as { category: string; c: number }[];
  res.json({
    notifications: rows,
    unread,
    byCategory: Object.fromEntries(counts.map((c) => [c.category, c.c])),
    categories: NOTIFICATION_CATEGORIES,
  });
});

router.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

router.delete('/notifications/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND recipient_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.delete('/notifications', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM notifications WHERE recipient_id = ? AND is_read = 1').run(req.user!.id);
  res.json({ ok: true });
});

/* -------------------------------- preferences ----------------------------- */

router.get('/notification-settings', requireAuth, (req: AuthedRequest, res) => {
  const settings = getSettings(req.user!.id);
  const prefs = db.prepare('SELECT category, enabled FROM notification_preferences WHERE user_id = ?').all(req.user!.id) as {
    category: string;
    enabled: number;
  }[];
  const map: Record<string, boolean> = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    const found = prefs.find((p) => p.category === category);
    map[category] = found ? found.enabled === 1 : true;
  }
  const devices = db
    .prepare('SELECT id, user_agent, created_at, last_seen FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id);
  res.json({
    settings: {
      sound: settings.sound,
      sound_enabled: settings.sound_enabled === 1,
      push_enabled: settings.push_enabled === 1,
      email_enabled: settings.email_enabled === 1,
      quiet_start: settings.quiet_start,
      quiet_end: settings.quiet_end,
      muted_until: settings.muted_until,
    },
    preferences: map,
    categories: NOTIFICATION_CATEGORIES,
    tones: TONE_OPTIONS,
    devices,
    email_configured: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL),
  });
});

router.patch('/notification-settings', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  getSettings(userId);
  const fields: Record<string, unknown> = { updated_at: now() };
  if (['signature', 'moonlit', 'rosegold', 'starlit', 'velvet', 'default', 'silent'].includes(req.body.sound)) fields.sound = req.body.sound;
  for (const key of ['sound_enabled', 'push_enabled', 'email_enabled']) {
    if (req.body[key] !== undefined) fields[key] = req.body[key] ? 1 : 0;
  }
  for (const key of ['quiet_start', 'quiet_end', 'muted_until']) {
    if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 40);
  }
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE notification_settings SET ${assignments} WHERE user_id = ?`).run(...Object.values(fields), userId);

  if (req.body.preferences && typeof req.body.preferences === 'object') {
    for (const [category, enabled] of Object.entries(req.body.preferences as Record<string, unknown>)) {
      if (!NOTIFICATION_CATEGORIES.includes(category as NotificationCategory)) continue;
      const existing = db
        .prepare('SELECT id FROM notification_preferences WHERE user_id = ? AND category = ?')
        .get(userId, category) as { id: string } | undefined;
      if (existing) {
        db.prepare('UPDATE notification_preferences SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, now(), existing.id);
      } else {
        db.prepare('INSERT INTO notification_preferences (id, user_id, category, enabled, updated_at) VALUES (?, ?, ?, ?, ?)').run(
          crypto.randomUUID(),
          userId,
          category,
          enabled ? 1 : 0,
          now()
        );
      }
    }
  }
  res.json({ ok: true });
});

/* --------------------------------- web push ------------------------------- */

router.get('/push/public-key', (_req, res) => {
  const keys = getVapid();
  res.json({ publicKey: keys.publicKey });
});

router.post('/push/subscribe', requireAuth, (req: AuthedRequest, res) => {
  const subscription = req.body.subscription || req.body;
  const endpoint = str(subscription?.endpoint, 600);
  const p256dh = str(subscription?.keys?.p256dh, 300);
  const auth = str(subscription?.keys?.auth, 300);
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'invalid_subscription' });
  const existing = db.prepare('SELECT id, user_id FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as
    | { id: string; user_id: string }
    | undefined;
  if (existing) {
    db.prepare('UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, last_seen = ?, user_agent = ? WHERE id = ?').run(
      req.user!.id,
      p256dh,
      auth,
      now(),
      str(req.headers['user-agent'], 300),
      existing.id
    );
    return res.json({ ok: true, updated: true });
  }
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.id, endpoint, p256dh, auth, str(req.headers['user-agent'], 300), now(), now());
  res.status(201).json({ ok: true, id });
});

router.post('/push/unsubscribe', requireAuth, (req: AuthedRequest, res) => {
  const endpoint = str(req.body.endpoint, 600);
  if (!endpoint) return res.status(400).json({ error: 'endpoint_required' });
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user!.id);
  res.json({ ok: true });
});

router.get('/push/status', requireAuth, (req: AuthedRequest, res) => {
  const devices = db
    .prepare('SELECT id, user_agent, created_at, last_seen FROM push_subscriptions WHERE user_id = ?')
    .all(req.user!.id) as Record<string, unknown>[];
  const settings = getSettings(req.user!.id);
  res.json({
    subscribed: devices.length > 0,
    devices,
    push_enabled: settings.push_enabled === 1,
    vapid_configured: Boolean(getVapid().publicKey),
  });
});

/** Sends a real push to the caller's devices so users can verify the whole chain. */
router.post('/push/test', requireAuth, async (req: AuthedRequest, res) => {
  const result = await sendPush(req.user!.id, {
    title: 'YumEra test notification',
    body: 'Outside notifications are connected to this device.',
    type: 'test',
    category: 'system',
    targetType: null,
    targetId: null,
  });
  res.json({ ok: true, ...result });
});

/** Used by the client bell to create a reminder notification for later. */
router.post('/notifications/reminder', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 120) || 'YumEra reminder';
  const message = str(req.body.message, 300);
  const id = createNotification({
    recipientId: req.user!.id,
    type: 'reminder',
    category: 'system',
    title,
    message,
    targetType: 'notifications',
    targetId: null,
  });
  res.status(201).json({ id });
});

export default router;
