import { Router } from 'express';
import { db, uid, now } from '../db';
import { type AuthedRequest, isBlocked, requireAuth } from '../auth';
import { clampLimit, parseJson, str } from '../util';
import { createNotification } from '../notify';

const router = Router();

function memberOf(conversationId: string, userId: string) {
  return db
    .prepare('SELECT role, last_read_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId) as { role: string; last_read_at: string | null } | undefined;
}

function conversationSummary(id: string, userId: string) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | { id: string; kind: string; title: string | null; avatar_url: string | null; created_by: string; created_at: string }
    | undefined;
  if (!conv) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url FROM conversation_members m JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ?`
    )
    .all(id) as { id: string; username: string; display_name: string; avatar_url: string | null }[];
  const last = db
    .prepare('SELECT id, sender_id, body, media, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(id) as { id: string; sender_id: string; body: string; media: string | null; created_at: string } | undefined;
  const mine = memberOf(id, userId);
  const unread = (
    db
      .prepare(
        'SELECT count(*) c FROM messages WHERE conversation_id = ? AND sender_id != ? AND (? IS NULL OR created_at > ?)'
      )
      .get(id, userId, mine?.last_read_at ?? null, mine?.last_read_at ?? '') as { c: number }
  ).c;
  const others = members.filter((m) => m.id !== userId);
  return {
    id: conv.id,
    kind: conv.kind,
    title: conv.title || others.map((o) => o.display_name).join(', ') || 'Conversation',
    avatar_url: conv.avatar_url || others[0]?.avatar_url || null,
    created_at: conv.created_at,
    members,
    unread,
    last_message: last
      ? { id: last.id, sender_id: last.sender_id, body: last.body, media: parseJson<string[]>(last.media, []), created_at: last.created_at }
      : null,
  };
}

router.get('/conversations', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
       WHERE m.user_id = ? ORDER BY c.created_at DESC`
    )
    .all(req.user!.id) as { id: string }[];
  const conversations = rows.map((r) => conversationSummary(r.id, req.user!.id)).filter(Boolean);
  conversations.sort((a, b) => {
    const at = a!.last_message?.created_at || a!.created_at;
    const bt = b!.last_message?.created_at || b!.created_at;
    return bt.localeCompare(at);
  });
  res.json({ conversations });
});

router.post('/conversations', requireAuth, (req: AuthedRequest, res) => {
  const kind = req.body.kind === 'group' ? 'group' : 'dm';
  const userIds: string[] = Array.isArray(req.body.user_ids)
    ? req.body.user_ids.filter((v: unknown) => typeof v === 'string')
    : req.body.user_id
      ? [str(req.body.user_id, 60)]
      : [];
  if (!userIds.length) return res.status(400).json({ error: 'no_recipients' });
  for (const id of userIds) {
    if (isBlocked(req.user!.id, id)) return res.status(403).json({ error: 'blocked' });
  }

  if (kind === 'dm' && userIds.length === 1) {
    const existing = db
      .prepare(
        `SELECT c.id FROM conversations c
         JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
         JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
         WHERE c.kind = 'dm' LIMIT 1`
      )
      .get(req.user!.id, userIds[0]) as { id: string } | undefined;
    if (existing) return res.json({ conversation: conversationSummary(existing.id, req.user!.id) });
  }

  const id = uid();
  db.prepare('INSERT INTO conversations (id, kind, title, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    kind,
    kind === 'group' ? str(req.body.title, 80) || 'YumEra group' : null,
    req.user!.id,
    now()
  );
  const insertMember = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at) VALUES (?, ?, ?, ?)');
  insertMember.run(id, req.user!.id, 'owner', now());
  for (const uidToAdd of userIds) insertMember.run(id, uidToAdd, 'member', null);

  for (const target of userIds) {
    createNotification({
      recipientId: target,
      actorId: req.user!.id,
      type: 'message_new',
      category: 'social',
      title: `New message from @${req.user!.username}`,
      message: kind === 'group' ? 'You were added to a group conversation.' : 'You have a new message on YumEra.',
      targetType: 'conversation',
      targetId: id,
    });
  }
  res.status(201).json({ conversation: conversationSummary(id, req.user!.id) });
});

router.get('/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  if (!memberOf(req.params.id, req.user!.id)) return res.status(403).json({ error: 'forbidden' });
  const limit = clampLimit(req.query.limit, 40, 100);
  const before = typeof req.query.before === 'string' ? req.query.before : '';
  const rows = db
    .prepare(
      `SELECT m.id, m.sender_id, m.body, m.media, m.created_at, u.username, u.display_name, u.avatar_url
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? ${before ? 'AND m.created_at < ?' : ''}
       ORDER BY m.created_at DESC LIMIT ?`
    )
    .all(...(before ? [req.params.id, before, limit] : [req.params.id, limit])) as {
    id: string;
    sender_id: string;
    body: string;
    media: string | null;
    created_at: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  }[];
  const messages = rows
    .map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      body: m.body,
      media: parseJson<string[]>(m.media, []),
      created_at: m.created_at,
      sender: { username: m.username, display_name: m.display_name, avatar_url: m.avatar_url },
    }))
    .reverse();
  res.json({ messages, conversation: conversationSummary(req.params.id, req.user!.id) });
});

router.post('/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const member = memberOf(req.params.id, req.user!.id);
  if (!member) return res.status(403).json({ error: 'forbidden' });
  const body = str(req.body.body, 4000);
  const media = Array.isArray(req.body.media) ? req.body.media.filter((m: unknown) => typeof m === 'string').slice(0, 6) : [];
  if (!body && !media.length) return res.status(400).json({ error: 'empty_message' });

  const id = uid();
  const createdAt = now();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, media, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    req.params.id,
    req.user!.id,
    body,
    JSON.stringify(media),
    createdAt
  );
  db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
    createdAt,
    req.params.id,
    req.user!.id
  );

  const others = db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?')
    .all(req.params.id, req.user!.id) as { user_id: string }[];
  for (const other of others) {
    if (isBlocked(req.user!.id, other.user_id)) continue;
    createNotification({
      recipientId: other.user_id,
      actorId: req.user!.id,
      type: 'message_new',
      category: 'social',
      title: `New message from @${req.user!.username}`,
      // Private message bodies are never included in the outside notification.
      message: 'You have a new message on YumEra.',
      targetType: 'conversation',
      targetId: req.params.id,
    });
  }

  res.status(201).json({
    message: {
      id,
      sender_id: req.user!.id,
      body,
      media,
      created_at: createdAt,
      sender: { username: req.user!.username, display_name: req.user!.display_name, avatar_url: req.user!.avatar_url },
    },
  });
});

router.post('/conversations/:id/read', requireAuth, (req: AuthedRequest, res) => {
  if (!memberOf(req.params.id, req.user!.id)) return res.status(403).json({ error: 'forbidden' });
  db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
    now(),
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

router.post('/conversations/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const member = memberOf(req.params.id, req.user!.id);
  if (!member || !['owner', 'admin'].includes(member.role)) return res.status(403).json({ error: 'forbidden' });
  const userId = str(req.body.user_id, 60);
  if (!userId) return res.status(400).json({ error: 'invalid_user' });
  db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(
    req.params.id,
    userId,
    'member'
  );
  createNotification({
    recipientId: userId,
    actorId: req.user!.id,
    type: 'message_new',
    category: 'social',
    title: `@${req.user!.username} added you to a conversation`,
    message: 'You have a new group conversation on YumEra.',
    targetType: 'conversation',
    targetId: req.params.id,
  });
  res.json({ conversation: conversationSummary(req.params.id, req.user!.id) });
});

router.delete('/conversations/:id/leave', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.get('/messages/unread-count', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare(
      `SELECT count(*) c FROM messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
       WHERE m.sender_id != ? AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)`
    )
    .get(req.user!.id, req.user!.id) as { c: number };
  res.json({ unread: row.c });
});

export default router;
