import { Router } from 'express';
import { db, uid, now } from '../db';
import { type AuthedRequest, requireAuth } from '../auth';
import { clampLimit, isoDay, slugify, str } from '../util';
import { createNotification } from '../notify';

const router = Router();
const VIS = ['public', 'followers', 'private'];

/* ---------------------------------- stories -------------------------------- */

function storyWithChapters(id: string): Record<string, unknown> | null {
  const story = db
    .prepare(
      `SELECT s.*, u.username, u.display_name, u.avatar_url FROM stories s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!story) return null;
  return {
    ...story,
    tags: String(story.tags || '').split(',').filter(Boolean),
    chapters: db.prepare('SELECT id, title, content, position, created_at FROM chapters WHERE story_id = ? ORDER BY position ASC').all(id),
    favorites: (db.prepare("SELECT count(*) c FROM favorites WHERE target_type = 'story' AND target_id = ?").get(id) as { c: number }).c,
    comments: db
      .prepare(
        `SELECT c.id, c.content, c.created_at, u.username, u.display_name, u.avatar_url
         FROM story_comments c JOIN users u ON u.id = c.author_id WHERE c.story_id = ? ORDER BY c.created_at ASC`
      )
      .all(id),
  };
}

router.get('/stories', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT s.id, s.title, s.description, s.cover_url, s.tags, s.created_at, u.username, u.display_name, u.avatar_url,
        (SELECT count(*) FROM chapters c WHERE c.story_id = s.id) chapters,
        (SELECT count(*) FROM favorites f WHERE f.target_type = 'story' AND f.target_id = s.id) favorites
       FROM stories s JOIN users u ON u.id = s.user_id
       WHERE s.status = 'published' AND s.visibility = 'public'
       ORDER BY s.created_at DESC LIMIT 30`
    )
    .all();
  res.json({ stories: rows.map((r) => ({ ...(r as object), tags: String((r as { tags: string }).tags || '').split(',').filter(Boolean) })) });
});

router.get('/stories/mine', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, (SELECT count(*) FROM chapters c WHERE c.story_id = s.id) chapters FROM stories s
       WHERE s.user_id = ? ORDER BY s.updated_at DESC`
    )
    .all(req.user!.id) as Record<string, unknown>[];
  res.json({ stories: rows.map((r) => ({ ...r, tags: String(r.tags || '').split(',').filter(Boolean) })) });
});

router.get('/stories/:id', (req: AuthedRequest, res) => {
  const story = storyWithChapters(req.params.id);
  if (!story) return res.status(404).json({ error: 'not_found' });
  const isOwner = req.user?.id === story.user_id;
  if (!isOwner && (story.status !== 'published' || story.visibility === 'private')) return res.status(403).json({ error: 'forbidden' });
  res.json({ story, is_owner: isOwner });
});

router.post('/stories', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 160);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = uid();
  const tags = Array.isArray(req.body.tags) ? req.body.tags.join(',') : str(req.body.tags, 300);
  db.prepare(
    `INSERT INTO stories (id, user_id, title, cover_url, description, tags, status, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user!.id,
    title,
    str(req.body.cover_url, 400) || null,
    str(req.body.description, 3000),
    tags,
    req.body.status === 'published' ? 'published' : 'draft',
    VIS.includes(req.body.visibility) ? req.body.visibility : 'public',
    now(),
    now()
  );
  if (str(req.body.content, 40000)) {
    db.prepare('INSERT INTO chapters (id, story_id, title, content, position, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
      uid(),
      id,
      'Chapter I',
      str(req.body.content, 40000),
      now()
    );
  }
  res.status(201).json({ story: storyWithChapters(id) });
});

router.patch('/stories/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string> = { updated_at: now() };
  for (const key of ['title', 'description']) if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 4000);
  if (typeof req.body.cover_url === 'string') fields.cover_url = str(req.body.cover_url, 400);
  if (Array.isArray(req.body.tags)) fields.tags = req.body.tags.join(',');
  if (req.body.status === 'published' || req.body.status === 'draft') fields.status = req.body.status;
  if (VIS.includes(req.body.visibility)) fields.visibility = req.body.visibility;
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE stories SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ story: storyWithChapters(req.params.id) });
});

router.delete('/stories/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM stories WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.post('/stories/:id/chapters', requireAuth, (req: AuthedRequest, res) => {
  const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!story || story.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const count = (db.prepare('SELECT count(*) c FROM chapters WHERE story_id = ?').get(req.params.id) as { c: number }).c;
  const id = uid();
  db.prepare('INSERT INTO chapters (id, story_id, title, content, position, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    req.params.id,
    str(req.body.title, 160) || `Chapter ${count + 1}`,
    str(req.body.content, 40000),
    count,
    now()
  );
  db.prepare('UPDATE stories SET updated_at = ? WHERE id = ?').run(now(), req.params.id);
  res.status(201).json({ chapter: db.prepare('SELECT * FROM chapters WHERE id = ?').get(id) });
});

router.patch('/chapters/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT c.id, s.user_id FROM chapters c JOIN stories s ON s.id = c.story_id WHERE c.id = ?')
    .get(req.params.id) as { id: string; user_id: string } | undefined;
  if (!row || row.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string | number> = {};
  if (typeof req.body.title === 'string') fields.title = str(req.body.title, 160);
  if (typeof req.body.content === 'string') fields.content = str(req.body.content, 40000);
  if (typeof req.body.position === 'number') fields.position = req.body.position;
  if (!Object.keys(fields).length) return res.json({ ok: true });
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE chapters SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ ok: true });
});

router.delete('/chapters/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT c.id, s.user_id FROM chapters c JOIN stories s ON s.id = c.story_id WHERE c.id = ?')
    .get(req.params.id) as { id: string; user_id: string } | undefined;
  if (!row || row.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/stories/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const story = db.prepare('SELECT user_id, title FROM stories WHERE id = ?').get(req.params.id) as
    | { user_id: string; title: string }
    | undefined;
  if (!story) return res.status(404).json({ error: 'not_found' });
  const content = str(req.body.content, 2000);
  if (!content) return res.status(400).json({ error: 'empty_comment' });
  db.prepare('INSERT INTO story_comments (id, story_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uid(),
    req.params.id,
    req.user!.id,
    content,
    now()
  );
  if (story.user_id !== req.user!.id) {
    createNotification({
      recipientId: story.user_id,
      actorId: req.user!.id,
      type: 'story_comment',
      category: 'my_yume',
      title: `${req.user!.display_name} commented on your story`,
      message: `${story.title}: ${content.slice(0, 120)}`,
      targetType: 'story',
      targetId: req.params.id,
    });
  }
  res.status(201).json({ ok: true });
});

/* --------------------------------- favorites ------------------------------- */

router.get('/favorites', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare("SELECT target_type, target_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id) as { target_type: string; target_id: string; created_at: string }[];
  const enriched = rows.map((r) => {
    let title = r.target_id;
    let cover: string | null = null;
    if (r.target_type === 'story') {
      const s = db.prepare('SELECT title, cover_url FROM stories WHERE id = ?').get(r.target_id) as
        | { title: string; cover_url: string | null }
        | undefined;
      if (s) {
        title = s.title;
        cover = s.cover_url;
      }
    }
    if (r.target_type === 'track') {
      const t = db.prepare('SELECT title, artist FROM playlist_items WHERE id = ?').get(r.target_id) as
        | { title: string; artist: string }
        | undefined;
      if (t) title = `${t.title} — ${t.artist}`;
    }
    return { ...r, title, cover };
  });
  res.json({ favorites: enriched });
});

router.post('/favorites', requireAuth, (req: AuthedRequest, res) => {
  const targetType = str(req.body.target_type, 30);
  const targetId = str(req.body.target_id, 80);
  if (!targetType || !targetId) return res.status(400).json({ error: 'invalid_target' });
  const existing = db
    .prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .get(req.user!.id, targetType, targetId) as { id: string } | undefined;
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
    return res.json({ favorited: false });
  }
  db.prepare('INSERT INTO favorites (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uid(),
    req.user!.id,
    targetType,
    targetId,
    now()
  );
  if (targetType === 'story') {
    const story = db.prepare('SELECT user_id, title FROM stories WHERE id = ?').get(targetId) as
      | { user_id: string; title: string }
      | undefined;
    if (story && story.user_id !== req.user!.id) {
      createNotification({
        recipientId: story.user_id,
        actorId: req.user!.id,
        type: 'favorite',
        category: 'my_yume',
        title: `${req.user!.display_name} saved your story`,
        message: story.title,
        targetType: 'story',
        targetId,
      });
    }
  }
  res.json({ favorited: true });
});

/* --------------------------- albums: gallery/memories ---------------------- */

router.get('/albums', (req: AuthedRequest, res) => {
  const kind = String(req.query.kind || 'gallery');
  const owner = String(req.query.user || '');
  let rows: Record<string, unknown>[];
  if (owner) {
    const target = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(owner) as { id: string } | undefined;
    if (!target) return res.json({ albums: [] });
    rows = db
      .prepare("SELECT * FROM albums WHERE user_id = ? AND kind = ? AND visibility = 'public' ORDER BY created_at DESC")
      .all(target.id, kind) as Record<string, unknown>[];
  } else if (req.user) {
    rows = db.prepare('SELECT * FROM albums WHERE user_id = ? AND kind = ? ORDER BY created_at DESC').all(req.user.id, kind) as Record<
      string,
      unknown
    >[];
  } else {
    rows = db.prepare("SELECT * FROM albums WHERE kind = ? AND visibility = 'public' ORDER BY created_at DESC LIMIT 24").all(kind) as Record<
      string,
      unknown
    >[];
  }
  res.json({
    albums: rows.map((a) => ({
      ...a,
      items: db.prepare('SELECT * FROM album_items WHERE album_id = ? ORDER BY memory_date ASC, created_at ASC').all(a.id as string),
    })),
  });
});

router.get('/albums/public', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, u.username, u.display_name FROM albums a JOIN users u ON u.id = a.user_id
       WHERE a.visibility = 'public' ORDER BY a.created_at DESC LIMIT 30`
    )
    .all() as Record<string, unknown>[];
  res.json({
    albums: rows.map((a) => ({
      ...a,
      items: db.prepare('SELECT * FROM album_items WHERE album_id = ? ORDER BY created_at ASC').all(a.id as string),
    })),
  });
});

router.get('/albums/:id', (req: AuthedRequest, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!album) return res.status(404).json({ error: 'not_found' });
  if (album.visibility !== 'public' && album.user_id !== req.user?.id) return res.status(403).json({ error: 'forbidden' });
  res.json({
    album: {
      ...album,
      items: db.prepare('SELECT * FROM album_items WHERE album_id = ? ORDER BY memory_date ASC, created_at ASC').all(req.params.id),
    },
  });
});

router.post('/albums', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 160);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const kind = req.body.kind === 'memory' ? 'memory' : req.body.kind === 'gallery' ? 'gallery' : 'gallery';
  const id = uid();
  db.prepare(
    'INSERT INTO albums (id, user_id, title, cover_url, kind, description, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    title,
    str(req.body.cover_url, 400) || null,
    kind,
    str(req.body.description, 2000),
    VIS.includes(req.body.visibility) ? req.body.visibility : 'private',
    now()
  );
  res.status(201).json({ album: db.prepare('SELECT * FROM albums WHERE id = ?').get(id) });
});

router.patch('/albums/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM albums WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string> = {};
  for (const key of ['title', 'description']) if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 3000);
  if (typeof req.body.cover_url === 'string') fields.cover_url = str(req.body.cover_url, 400);
  if (VIS.includes(req.body.visibility)) fields.visibility = req.body.visibility;
  if (!Object.keys(fields).length) return res.json({ ok: true });
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE albums SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ ok: true });
});

router.delete('/albums/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM albums WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.post('/albums/:id/items', requireAuth, (req: AuthedRequest, res) => {
  const album = db.prepare('SELECT user_id, kind FROM albums WHERE id = ?').get(req.params.id) as
    | { user_id: string; kind: string }
    | undefined;
  if (!album || album.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const id = uid();
  db.prepare(
    'INSERT INTO album_items (id, album_id, kind, url, caption, body, memory_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.params.id,
    ['image', 'video', 'letter', 'memory'].includes(req.body.kind) ? req.body.kind : 'image',
    str(req.body.url, 400) || null,
    str(req.body.caption, 500),
    str(req.body.body, 8000),
    str(req.body.memory_date, 40) || isoDay(),
    now()
  );
  res.status(201).json({ item: db.prepare('SELECT * FROM album_items WHERE id = ?').get(id) });
});

router.delete('/album-items/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT i.id, a.user_id FROM album_items i JOIN albums a ON a.id = i.album_id WHERE i.id = ?')
    .get(req.params.id) as { id: string; user_id: string } | undefined;
  if (!row || row.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM album_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------------------------- diary ---------------------------------- */

router.get('/diary', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY entry_date DESC, created_at DESC').all(req.user!.id);
  res.json({ entries: rows });
});

router.post('/diary', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 160);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = uid();
  db.prepare(
    'INSERT INTO diary_entries (id, user_id, title, content, mood, tags, entry_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    title,
    str(req.body.content, 20000),
    str(req.body.mood, 40),
    Array.isArray(req.body.tags) ? req.body.tags.join(',') : str(req.body.tags, 300),
    str(req.body.entry_date, 40) || isoDay(),
    now(),
    now()
  );
  res.status(201).json({ entry: db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(id) });
});

router.patch('/diary/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM diary_entries WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string> = { updated_at: now() };
  for (const key of ['title', 'content', 'mood', 'entry_date']) if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 20000);
  if (Array.isArray(req.body.tags)) fields.tags = req.body.tags.join(',');
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE diary_entries SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ ok: true });
});

router.delete('/diary/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM diary_entries WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/* -------------------------------- communities ------------------------------ */

function communityDetail(id: string, viewerId?: string): Record<string, unknown> | null {
  const community = db
    .prepare(
      `SELECT c.*, u.username AS owner_username, u.display_name AS owner_name,
        (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active') members
       FROM communities c JOIN users u ON u.id = c.owner_id WHERE c.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!community) return null;
  const membership = viewerId
    ? (db.prepare('SELECT role, status FROM community_members WHERE community_id = ? AND user_id = ?').get(id, viewerId) as
        | { role: string; status: string }
        | undefined)
    : undefined;
  const isMember = membership?.status === 'active';
  const canView = !community.is_private || isMember;
  return {
    ...community,
    membership: membership ?? null,
    is_member: Boolean(isMember),
    is_admin: Boolean(membership && ['owner', 'admin', 'moderator'].includes(membership.role)),
    members_list: canView
      ? db
          .prepare(
            `SELECT u.id, u.username, u.display_name, u.avatar_url, m.role FROM community_members m JOIN users u ON u.id = m.user_id
             WHERE m.community_id = ? AND m.status = 'active' ORDER BY (m.role = 'owner') DESC, u.display_name LIMIT 100`
          )
          .all(id)
      : [],
    pending: canView && membership && ['owner', 'admin', 'moderator'].includes(membership.role)
      ? db
          .prepare(
            `SELECT u.id, u.username, u.display_name, u.avatar_url FROM community_members m JOIN users u ON u.id = m.user_id
             WHERE m.community_id = ? AND m.status = 'pending'`
          )
          .all(id)
      : [],
    events: canView ? db.prepare('SELECT * FROM community_events WHERE community_id = ? ORDER BY event_date ASC').all(id) : [],
    posts: canView
      ? db
          .prepare(
            `SELECT p.*, u.username, u.display_name, u.avatar_url FROM community_posts p JOIN users u ON u.id = p.author_id
             WHERE p.community_id = ? ORDER BY p.created_at DESC LIMIT 40`
          )
          .all(id)
      : [],
  };
}

router.get('/communities', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.description, c.cover_url, c.is_private,
        (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active') members
       FROM communities c ORDER BY members DESC, c.created_at DESC LIMIT 40`
    )
    .all();
  res.json({ communities: rows });
});

router.get('/communities/:id', (req: AuthedRequest, res) => {
  const detail = communityDetail(req.params.id, req.user?.id);
  if (!detail) return res.status(404).json({ error: 'not_found' });
  if (detail.is_private && !detail.is_member && !detail.is_admin) {
    return res.json({ community: { ...detail, posts: [], events: [], members_list: [] } });
  }
  res.json({ community: detail });
});

router.post('/communities', requireAuth, (req: AuthedRequest, res) => {
  const name = str(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'name_required' });
  let slug = slugify(name) || `community-${Date.now()}`;
  if (db.prepare('SELECT 1 FROM communities WHERE slug = ?').get(slug)) slug = `${slug}-${Math.floor(Math.random() * 9999)}`;
  const id = uid();
  db.prepare(
    'INSERT INTO communities (id, owner_id, name, slug, description, cover_url, is_private, rules, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    name,
    slug,
    str(req.body.description, 2000),
    str(req.body.cover_url, 400) || null,
    req.body.is_private ? 1 : 0,
    str(req.body.rules, 4000),
    now()
  );
  db.prepare('INSERT INTO community_members (community_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    req.user!.id,
    'owner',
    'active',
    now()
  );
  res.status(201).json({ community: communityDetail(id, req.user!.id) });
});

router.post('/communities/:id/join', requireAuth, (req: AuthedRequest, res) => {
  const community = db.prepare('SELECT id, is_private, owner_id, name FROM communities WHERE id = ?').get(req.params.id) as
    | { id: string; is_private: number; owner_id: string; name: string }
    | undefined;
  if (!community) return res.status(404).json({ error: 'not_found' });
  const status = community.is_private ? 'pending' : 'active';
  db.prepare(
    'INSERT INTO community_members (community_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(community_id, user_id) DO UPDATE SET status = excluded.status'
  ).run(community.id, req.user!.id, 'member', status, now());
  if (community.owner_id !== req.user!.id) {
    createNotification({
      recipientId: community.owner_id,
      actorId: req.user!.id,
      type: status === 'pending' ? 'community_request' : 'community_join',
      category: 'community',
      title:
        status === 'pending'
          ? `${req.user!.display_name} requested to join ${community.name}`
          : `${req.user!.display_name} joined ${community.name}`,
      message: 'Community activity in your universe.',
      targetType: 'community',
      targetId: community.id,
    });
  }
  res.json({ status });
});

router.post('/communities/:id/leave', requireAuth, (req: AuthedRequest, res) => {
  db.prepare("DELETE FROM community_members WHERE community_id = ? AND user_id = ? AND role != 'owner'").run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

router.post('/communities/:id/approve', requireAuth, (req: AuthedRequest, res) => {
  const membership = db
    .prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
    .get(req.params.id, req.user!.id, 'active') as { role: string } | undefined;
  if (!membership || !['owner', 'admin', 'moderator'].includes(membership.role)) return res.status(403).json({ error: 'forbidden' });
  const userId = str(req.body.user_id, 60);
  const accept = req.body.accept !== false;
  if (accept) {
    db.prepare("UPDATE community_members SET status = 'active' WHERE community_id = ? AND user_id = ?").run(req.params.id, userId);
  } else {
    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(req.params.id, userId);
  }
  res.json({ ok: true });
});

router.post('/communities/:id/posts', requireAuth, (req: AuthedRequest, res) => {
  const membership = db
    .prepare("SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = 'active'")
    .get(req.params.id, req.user!.id) as { role: string } | undefined;
  if (!membership) return res.status(403).json({ error: 'not_a_member' });
  const content = str(req.body.content, 5000);
  if (!content) return res.status(400).json({ error: 'empty_post' });
  const id = uid();
  db.prepare('INSERT INTO community_posts (id, community_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    req.params.id,
    req.user!.id,
    content,
    now()
  );
  res.status(201).json({ post: db.prepare('SELECT * FROM community_posts WHERE id = ?').get(id) });
});

router.post('/communities/:id/events', requireAuth, (req: AuthedRequest, res) => {
  const membership = db
    .prepare("SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = 'active'")
    .get(req.params.id, req.user!.id) as { role: string } | undefined;
  if (!membership || !['owner', 'admin', 'moderator'].includes(membership.role)) return res.status(403).json({ error: 'forbidden' });
  const title = str(req.body.title, 160);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = uid();
  db.prepare('INSERT INTO community_events (id, community_id, title, description, event_date, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    req.params.id,
    title,
    str(req.body.description, 2000),
    str(req.body.event_date, 40) || isoDay(),
    now()
  );
  const members = db
    .prepare("SELECT user_id FROM community_members WHERE community_id = ? AND status = 'active' AND user_id != ?")
    .all(req.params.id, req.user!.id) as { user_id: string }[];
  for (const m of members.slice(0, 200)) {
    createNotification({
      recipientId: m.user_id,
      actorId: req.user!.id,
      type: 'community_event',
      category: 'community',
      title: `New event: ${title}`,
      message: 'A new community event is on the calendar.',
      targetType: 'community',
      targetId: req.params.id,
    });
  }
  res.status(201).json({ ok: true });
});

/* ------------------------------ official notices --------------------------- */

router.get('/notices', (req: AuthedRequest, res) => {
  const official = db.prepare("SELECT id FROM users WHERE role = 'official'").get() as { id: string } | undefined;
  const posts = official
    ? db
        .prepare(
          `SELECT p.id, p.content, p.created_at, u.username, u.display_name, u.avatar_url FROM posts p JOIN users u ON u.id = p.author_id
           WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 10`
        )
        .all(official.id)
    : [];
  res.json({ notices: posts });
});

router.get('/stats', (req: AuthedRequest, res) => {
  const one = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  res.json({
    users: one('SELECT count(*) c FROM users'),
    posts: one('SELECT count(*) c FROM posts'),
    yumesonas: one('SELECT count(*) c FROM yumesonas'),
    fos: one('SELECT count(*) c FROM fos'),
    stories: one('SELECT count(*) c FROM stories'),
    portraits: one('SELECT count(*) c FROM portraits'),
    communities: one('SELECT count(*) c FROM communities'),
  });
});

router.get('/leaderboard', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT g.game, u.username, u.display_name, u.avatar_url, max(g.score) best
       FROM game_scores g JOIN users u ON u.id = g.user_id GROUP BY g.game, g.user_id ORDER BY g.game, best DESC`
    )
    .all();
  const grouped: Record<string, unknown[]> = {};
  for (const row of rows as { game: string }[]) {
    grouped[row.game] = grouped[row.game] || [];
    if (grouped[row.game].length < 5) grouped[row.game].push(row);
  }
  res.json({ leaderboard: grouped });
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, time: now(), limits: clampLimit(5, 5, 10) });
});

export default router;
