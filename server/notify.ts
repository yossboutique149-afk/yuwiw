import crypto from 'node:crypto';
import webpush from 'web-push';
import { db, getMeta, setMeta, uid, now, type NotificationCategory } from './db';

let vapid: { publicKey: string; privateKey: string } | null = null;

/**
 * VAPID keys come from the environment when provided, otherwise they are generated once
 * and persisted in the database so subscriptions stay valid across restarts.
 */
export function getVapid() {
  if (vapid) return vapid;
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  if (envPublic && envPrivate) {
    vapid = { publicKey: envPublic, privateKey: envPrivate };
  } else {
    let pub = getMeta('vapid_public');
    let priv = getMeta('vapid_private');
    if (!pub || !priv) {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey;
      priv = keys.privateKey;
      setMeta('vapid_public', pub);
      setMeta('vapid_private', priv);
    }
    vapid = { publicKey: pub, privateKey: priv };
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:official@yumera.app', vapid.publicKey, vapid.privateKey);
  return vapid;
}

export type NotifyInput = {
  recipientId: string;
  actorId?: string | null;
  type: string;
  category: NotificationCategory;
  title: string;
  message?: string;
  targetType?: string | null;
  targetId?: string | null;
  /** Set false to create an in-app record without an outside push. */
  push?: boolean;
};

function blockedBetween(a: string, b: string) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
      .get(a, b, b, a)
  );
}

function inQuietHours(start: string, end: string) {
  if (!start || !end) return false;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
}

export function categoryEnabled(userId: string, category: string) {
  const row = db
    .prepare('SELECT enabled FROM notification_preferences WHERE user_id = ? AND category = ?')
    .get(userId, category) as { enabled: number } | undefined;
  if (!row) return true;
  return row.enabled === 1;
}

export function getSettings(userId: string) {
  let row = db.prepare('SELECT * FROM notification_settings WHERE user_id = ?').get(userId) as
    | {
        user_id: string;
        sound: string;
        sound_enabled: number;
        quiet_start: string;
        quiet_end: string;
        email_enabled: number;
        push_enabled: number;
        muted_until: string;
        updated_at: string;
      }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO notification_settings (user_id, updated_at) VALUES (?, ?)').run(userId, now());
    row = db.prepare('SELECT * FROM notification_settings WHERE user_id = ?').get(userId) as typeof row;
  }
  return row!;
}

/** Creates the internal notification record. Returns the row id. */
export function createNotification(input: NotifyInput) {
  const id = uid();
  const created = now();
  db.prepare(
    `INSERT INTO notifications (id, recipient_id, actor_id, type, category, title, message, target_type, target_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    input.recipientId,
    input.actorId ?? null,
    input.type,
    input.category,
    input.title,
    input.message ?? '',
    input.targetType ?? null,
    input.targetId ?? null,
    created
  );

  if (input.push !== false) {
    void sendPush(input.recipientId, {
      title: input.title,
      body: input.message ?? '',
      type: input.type,
      category: input.category,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      notificationId: id,
    });
  }
  return id;
}

export type PushPayload = {
  title: string;
  body: string;
  type: string;
  category: string;
  targetType?: string | null;
  targetId?: string | null;
  notificationId?: string;
};

/** Sends a Web Push to every subscribed device of the user, honouring preferences. */
export async function sendPush(userId: string, payload: PushPayload) {
  try {
    const settings = getSettings(userId);
    if (!settings.push_enabled) return { sent: 0, reason: 'push_disabled' };
    if (settings.muted_until && new Date(settings.muted_until).getTime() > Date.now()) return { sent: 0, reason: 'muted' };
    if (inQuietHours(settings.quiet_start, settings.quiet_end)) return { sent: 0, reason: 'quiet_hours' };
    if (!categoryEnabled(userId, payload.category)) return { sent: 0, reason: 'category_disabled' };

    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as {
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }[];
    if (!subs.length) return { sent: 0, reason: 'no_subscriptions' };

    getVapid();
    const body = JSON.stringify({
      ...payload,
      sound: settings.sound_enabled ? settings.sound : 'silent',
      url: targetUrl(payload.targetType ?? null, payload.targetId ?? null),
      timestamp: Date.now(),
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          TTL: 60 * 60 * 12,
          urgency: 'normal',
        });
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    }
    return { sent };
  } catch {
    return { sent: 0, reason: 'error' };
  }
}

export function targetUrl(targetType: string | null, targetId: string | null) {
  if (!targetType || !targetId) return '/notifications';
  switch (targetType) {
    case 'post':
      return `/post/${targetId}`;
    case 'user':
      return `/u/${targetId}`;
    case 'message':
    case 'conversation':
      return `/messages/${targetId}`;
    case 'story':
      return `/stories/${targetId}`;
    case 'community':
      return `/communities/${targetId}`;
    case 'character':
      return `/characters/${targetId}`;
    case 'yumesona':
      return `/yumesonas/${targetId}`;
    case 'fo':
      return `/fo`;
    case 'gallery':
      return `/gallery/${targetId}`;
    default:
      return '/notifications';
  }
}

export const signatureTones = [
  {
    id: 'yumera-signature',
    name: 'YumEra Signature Tone',
    description: 'Crystalline celesta bell with a soft celestial tail. 1.6s.',
    file: '/sounds/yumera-signature.wav',
  },
  {
    id: 'moonlight-chime',
    name: 'Moonlight Chime',
    description: 'Two descending harp notes wrapped in silver reverb. 1.4s.',
    file: '/sounds/moonlight-chime.wav',
  },
  {
    id: 'starlit-harp',
    name: 'Starlit Harp',
    description: 'Fast arpeggio of five glassy plucks. 1.2s.',
    file: '/sounds/starlit-harp.wav',
  },
  {
    id: 'celestial-bell',
    name: 'Celestial Bell',
    description: 'Deep temple bell with a shimmering overtone. 1.8s.',
    file: '/sounds/celestial-bell.wav',
  },
  {
    id: 'velvet-echo',
    name: 'Velvet Echo',
    description: 'Warm muted marimba with a violet echo. 1.5s.',
    file: '/sounds/velvet-echo.wav',
  },
  {
    id: 'aurora-glass',
    name: 'Aurora Glass',
    description: 'Glassy triad that blooms into aurora light. 1.7s.',
    file: '/sounds/aurora-glass.wav',
  },
];

export function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}
