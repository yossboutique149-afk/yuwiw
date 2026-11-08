import { Router } from 'express';
import { db, uid, now } from '../db';
import { type AuthedRequest, isBlocked, requireAuth } from '../auth';
import { clampLimit, extractMentions, extractTags, parseJson, str, bool } from '../util';
import { createNotification } from '../notify';

const router = Router();

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  media: string;
  visibility: string;
  shared_from: string | null;
  community_id: string | null;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  likes: number;
  comments: number;
  shares: number;
};

const POST_SELECT = `
SELECT p.id, p.author_id, p.content, p.media, p.visibility, p.shared_from, p.community_id, p.created_at,
       u.username, u.display_name, u.avatar_url, u.role,
       (SELECT count(*) FROM reactions r WHERE r.target_type = 'post' AND r.target_id = p.id) AS likes,
       (SELECT count(*) FROM comments c WHERE c.post_id = p.id) AS comments,
       (SELECT count(*) FROM posts sp WHERE sp.shared_from = p.id) AS shares
FROM posts p JOIN users u ON u.id = p.author_id`;

function visibility(viewerId?: string) {
  if (!viewerId) return { sql: "p.visibility = 'public'", params: [] as string[] };
  return {
    sql: "(p.visibility = 'public' OR p.author_id = ? OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = p.author_id AND f.status = 'accepted')))",
    params: [viewerId, viewerId],
  };
}

export function serializePost(row: PostRow, viewerId?: string) {
  const shared = row.shared_from
    ? (db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(row.shared_from) as PostRow | undefined)
    : undefined;
  return {
    id: row.id,
    author: {
      id: row.author_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      role: row.role,
    },
    content: row.content,
    media: parseJson<string[]>(row.media, []),
    visibility: row.visibility,
    community_id: row.community_id,
    created_at: row.created_at,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    tags: (db.prepare('SELECT tag FROM post_tags WHERE post_id = ?').all(row.id) as { tag: string }[]).map((t) => t.tag),
    liked: viewerId
      ? Boolean(
          db
            .prepare("SELECT 1 FROM reactions WHERE user_id = ? AND target_type = 'post' AND target_id = ?")
            .get(viewerId, row.id)
        )
      : false,
    shared_post: shared
      ? {
          id: shared.id,
          content: shared.content,
          media: parseJson<string[]>(shared.media, []),
          created_at: shared.created_at,
          author: {
            id: shared.author_id,
            username: shared.username,
            display_name: shared.display_name,
            avatar_url: shared.avatar_url,
            role: shared.role,
          },
        }
      : null,
  };
}

function notifyMentions(text: string, actorId: string, actorName: string, targetType: string, targetId: string) {
  for (const name of extractMentions(text)) {
    const mentioned = db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(name) as { id: string } | undefined;
    if (!mentioned || mentioned.id === actorId) continue;
    if (isBlocked(actorId, mentioned.id)) continue;
    createNotification({
      recipientId: mentioned.id,
      actorId,
      type: 'mention',
      category: 'social',
      title: `@${actorName} mentioned you`,
      message: text.slice(0, 140),
      targetType,
      targetId,
    });
  }
}

/* ------------------------------- feed & posts ------------------------------ */

router.get('/feed', (req: AuthedRequest, res) => {
  const scope = String(req.query.scope || 'discover');
  const limit = clampLimit(req.query.limit, 20, 40);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
  const vis = visibility(req.user?.id);

  let sql = `${POST_SELECT} WHERE ${vis.sql} AND p.community_id IS NULL`;
  const params: (string | number)[] = [...vis.params];

  if (scope === 'following' && req.user) {
    sql += " AND (p.author_id = ? OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ? AND status = 'accepted'))";
    params.push(req.user.id, req.user.id);
  }
  if (scope === 'mine' && req.user) {
    sql += ' AND p.author_id = ?';
    params.push(req.user.id);
  }
  if (cursor) {
    sql += ' AND p.created_at < ?';
    params.push(cursor);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as PostRow[];
  res.json({ posts: rows.map((r) => serializePost(r, req.user?.id)), next_cursor: rows.length === limit ? rows[rows.length - 1].created_at : null });
});

router.post('/posts', requireAuth, (req: AuthedRequest, res) => {
  const content = str(req.body.content, 5000);
  const media = Array.isArray(req.body.media) ? req.body.media.filter((m: unknown) => typeof m === 'string').slice(0, 10) : [];
  const visibilityValue = ['public', 'followers', 'private'].includes(req.body.visibility) ? req.body.visibility : 'public';
  const communityId = req.body.community_id ? str(req.body.community_id, 60) : null;
  if (!content && !media.length) return res.status(400).json({ error: 'empty_post' });

  if (communityId) {
    const member = db
      .prepare("SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ? AND status = 'active'")
      .get(communityId, req.user!.id);
    if (!member) return res.status(403).json({ error: 'not_a_member' });
  }

  const id = uid();
  db.prepare('INSERT INTO posts (id, author_id, content, media, visibility, community_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    req.user!.id,
    content,
    JSON.stringify(media),
    visibilityValue,
    communityId,
    now()
  );
  for (const tag of extractTags(content)) {
    db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)').run(id, tag);
  }
  notifyMentions(content, req.user!.id, req.user!.username, 'post', id);

  if (communityId) {
    const members = db
      .prepare("SELECT user_id FROM community_members WHERE community_id = ? AND status = 'active' AND user_id != ?")
      .all(communityId, req.user!.id) as { user_id: string }[];
    for (const m of members.slice(0, 200)) {
      createNotification({
        recipientId: m.user_id,
        actorId: req.user!.id,
        type: 'community_post',
        category: 'community',
        title: 'New post in your community',
        message: `${req.user!.display_name} posted in a community you belong to.`,
        targetType: 'community',
        targetId: communityId,
      });
    }
  }

  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(id) as PostRow;
  res.status(201).json({ post: serializePost(row, req.user!.id) });
});

router.get('/posts/:id', (req: AuthedRequest, res) => {
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(req.params.id) as PostRow | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.visibility !== 'public' && row.author_id !== req.user?.id) {
    const follows =
      req.user &&
      db
        .prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? AND status = 'accepted'")
        .get(req.user.id, row.author_id);
    if (!follows || row.visibility === 'private') return res.status(403).json({ error: 'forbidden' });
  }
  res.json({ post: serializePost(row, req.user?.id) });
});

router.delete('/posts/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id) as { author_id: string } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.author_id !== req.user!.id && !['official', 'admin'].includes(req.user!.role))
    return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/posts/:id/share', requireAuth, (req: AuthedRequest, res) => {
  const original = db.prepare('SELECT id, author_id, visibility, community_id FROM posts WHERE id = ?').get(req.params.id) as
    | { id: string; author_id: string; visibility: string; community_id: string | null }
    | undefined;
  if (!original) return res.status(404).json({ error: 'not_found' });
  if (original.visibility === 'private' && original.author_id !== req.user!.id) return res.status(403).json({ error: 'forbidden' });

  const id = uid();
  db.prepare('INSERT INTO posts (id, author_id, content, media, visibility, shared_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    req.user!.id,
    str(req.body.content, 1000),
    '[]',
    'public',
    original.id,
    now()
  );
  if (original.author_id !== req.user!.id) {
    createNotification({
      recipientId: original.author_id,
      actorId: req.user!.id,
      type: 'share',
      category: 'interactions',
      title: `${req.user!.display_name} shared your post`,
      message: 'Your post is travelling across the universe.',
      targetType: 'post',
      targetId: original.id,
    });
  }
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(id) as PostRow;
  res.status(201).json({ post: serializePost(row, req.user!.id) });
});

/* --------------------------------- comments -------------------------------- */

router.get('/posts/:id/comments', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.post_id, c.author_id, c.parent_id, c.content, c.created_at,
              u.username, u.display_name, u.avatar_url, u.role
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC`
    )
    .all(req.params.id) as {
    id: string;
    post_id: string;
    author_id: string;
    parent_id: string | null;
    content: string;
    created_at: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    role: string;
  }[];
  res.json({
    comments: rows.map((c) => ({
      id: c.id,
      post_id: c.post_id,
      parent_id: c.parent_id,
      content: c.content,
      created_at: c.created_at,
      author: { id: c.author_id, username: c.username, display_name: c.display_name, avatar_url: c.avatar_url, role: c.role },
    })),
  });
});

router.post('/posts/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const content = str(req.body.content, 2000);
  if (!content) return res.status(400).json({ error: 'empty_comment' });
  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(req.params.id) as
    | { id: string; author_id: string }
    | undefined;
  if (!post) return res.status(404).json({ error: 'not_found' });

  const parentId = req.body.parent_id ? str(req.body.parent_id, 60) : null;
  const id = uid();
  db.prepare('INSERT INTO comments (id, post_id, author_id, parent_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    post.id,
    req.user!.id,
    parentId,
    content,
    now()
  );

  if (post.author_id !== req.user!.id) {
    createNotification({
      recipientId: post.author_id,
      actorId: req.user!.id,
      type: parentId ? 'reply' : 'comment',
      category: 'interactions',
      title: `${req.user!.display_name} ${parentId ? 'replied on your post' : 'commented on your post'}`,
      message: content.slice(0, 140),
      targetType: 'post',
      targetId: post.id,
    });
  }
  if (parentId) {
    const parent = db.prepare('SELECT author_id FROM comments WHERE id = ?').get(parentId) as { author_id: string } | undefined;
    if (parent && parent.author_id !== req.user!.id) {
      createNotification({
        recipientId: parent.author_id,
        actorId: req.user!.id,
        type: 'reply',
        category: 'interactions',
        title: `${req.user!.display_name} replied to your comment`,
        message: content.slice(0, 140),
        targetType: 'post',
        targetId: post.id,
      });
    }
  }
  notifyMentions(content, req.user!.id, req.user!.username, 'post', post.id);

  res.status(201).json({
    comment: {
      id,
      post_id: post.id,
      parent_id: parentId,
      content,
      created_at: now(),
      author: {
        id: req.user!.id,
        username: req.user!.username,
        display_name: req.user!.display_name,
        avatar_url: req.user!.avatar_url,
        role: req.user!.role,
      },
    },
  });
});

router.delete('/comments/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT author_id FROM comments WHERE id = ?').get(req.params.id) as { author_id: string } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.author_id !== req.user!.id && !['official', 'admin'].includes(req.user!.role))
    return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* -------------------------------- reactions -------------------------------- */

router.post('/reactions', requireAuth, (req: AuthedRequest, res) => {
  const targetType = str(req.body.target_type, 30);
  const targetId = str(req.body.target_id, 60);
  const kind = ['like', 'love', 'star', 'moon'].includes(req.body.kind) ? req.body.kind : 'like';
  if (!targetType || !targetId) return res.status(400).json({ error: 'invalid_target' });

  const existing = db
    .prepare('SELECT id, kind FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .get(req.user!.id, targetType, targetId) as { id: string; kind: string } | undefined;

  if (existing && existing.kind === kind) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    return res.json({ reacted: false });
  }
  if (existing) {
    db.prepare('UPDATE reactions SET kind = ? WHERE id = ?').run(kind, existing.id);
    return res.json({ reacted: true, kind });
  }
  db.prepare('INSERT INTO reactions (id, user_id, target_type, target_id, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uid(),
    req.user!.id,
    targetType,
    targetId,
    kind,
    now()
  );

  if (targetType === 'post') {
    const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(targetId) as { author_id: string } | undefined;
    if (post && post.author_id !== req.user!.id) {
      createNotification({
        recipientId: post.author_id,
        actorId: req.user!.id,
        type: 'reaction',
        category: 'interactions',
        title: `${req.user!.display_name} reacted to your post`,
        message: 'A new star in your universe.',
        targetType: 'post',
        targetId,
      });
    }
  }
  if (targetType === 'story') {
    const story = db.prepare('SELECT user_id, title FROM stories WHERE id = ?').get(targetId) as
      | { user_id: string; title: string }
      | undefined;
    if (story && story.user_id !== req.user!.id) {
      createNotification({
        recipientId: story.user_id,
        actorId: req.user!.id,
        type: 'story_reaction',
        category: 'my_yume',
        title: `${req.user!.display_name} reacted to your story`,
        message: story.title,
        targetType: 'story',
        targetId,
      });
    }
  }
  res.json({ reacted: true, kind });
});

/* --------------------------------- profiles -------------------------------- */

router.get('/users/:username', (req: AuthedRequest, res) => {
  const user = db
    .prepare(
      'SELECT id, username, display_name, bio, avatar_url, cover_url, locale, is_private, role, email_verified, created_at FROM users WHERE lower(username) = lower(?)'
    )
    .get(req.params.username) as
    | {
        id: string;
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
      }
    | undefined;
  if (!user) return res.status(404).json({ error: 'not_found' });

  const counts = {
    posts: (db.prepare('SELECT count(*) c FROM posts WHERE author_id = ?').get(user.id) as { c: number }).c,
    followers: (db.prepare("SELECT count(*) c FROM follows WHERE following_id = ? AND status = 'accepted'").get(user.id) as { c: number }).c,
    following: (db.prepare("SELECT count(*) c FROM follows WHERE follower_id = ? AND status = 'accepted'").get(user.id) as { c: number }).c,
    yumesonas: (db.prepare("SELECT count(*) c FROM yumesonas WHERE user_id = ? AND visibility = 'public'").get(user.id) as { c: number }).c,
    stories: (db.prepare("SELECT count(*) c FROM stories WHERE user_id = ? AND status = 'published' AND visibility = 'public'").get(user.id) as { c: number }).c,
  };

  const isSelf = req.user?.id === user.id;
  const follows = req.user
    ? db.prepare('SELECT status FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, user.id)
    : undefined;
  const blocked = req.user ? isBlocked(req.user.id, user.id) : false;
  const pendingFriend = req.user
    ? db.prepare("SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'").get(req.user.id, user.id)
    : undefined;
  const canView = isSelf || !user.is_private || Boolean(follows) || ['official', 'admin'].includes(user.role);

  res.json({
    user,
    counts,
    is_self: isSelf,
    following: Boolean(follows),
    requested: Boolean(follows && (follows as { status: string }).status === 'pending'),
    friend_request_sent: Boolean(pendingFriend),
    blocked,
    can_view_content: canView,
    yumesonas: canView
      ? db.prepare("SELECT id, name, image_url, description FROM yumesonas WHERE user_id = ? AND visibility = 'public' ORDER BY created_at DESC LIMIT 12").all(user.id)
      : [],
    fos: canView
      ? db
          .prepare(
            "SELECT id, name, source, portrait_url, relation_type, anti_double_enabled FROM fos WHERE user_id = ? AND visibility = 'public' AND anti_double_enabled = 0 ORDER BY created_at DESC LIMIT 12"
          )
          .all(user.id)
      : [],
  });
});

router.get('/users/:username/posts', (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT id, is_private FROM users WHERE lower(username) = lower(?)').get(req.params.username) as
    | { id: string; is_private: number }
    | undefined;
  if (!user) return res.status(404).json({ error: 'not_found' });
  const isSelf = req.user?.id === user.id;
  const follows = req.user
    ? db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? AND status = 'accepted'").get(req.user.id, user.id)
    : undefined;
  if (user.is_private && !isSelf && !follows) return res.json({ posts: [] });

  const rows = db
    .prepare(`${POST_SELECT} WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 30`)
    .all(user.id) as PostRow[];
  res.json({ posts: rows.map((r) => serializePost(r, req.user?.id)) });
});

/* ---------------------------------- follows -------------------------------- */

router.post('/users/:id/follow', requireAuth, (req: AuthedRequest, res) => {
  const targetId = req.params.id;
  if (targetId === req.user!.id) return res.status(400).json({ error: 'cannot_follow_self' });
  const target = db.prepare('SELECT id, is_private, display_name FROM users WHERE id = ?').get(targetId) as
    | { id: string; is_private: number; display_name: string }
    | undefined;
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (isBlocked(req.user!.id, targetId)) return res.status(403).json({ error: 'blocked' });

  const status = target.is_private ? 'pending' : 'accepted';
  db.prepare(
    'INSERT INTO follows (follower_id, following_id, status, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(follower_id, following_id) DO UPDATE SET status = excluded.status'
  ).run(req.user!.id, targetId, status, now());

  if (status === 'accepted') {
    createNotification({
      recipientId: targetId,
      actorId: req.user!.id,
      type: 'follow',
      category: 'social',
      title: `@${req.user!.username} started following you`,
      message: 'Someone new entered your universe.',
      targetType: 'user',
      targetId: req.user!.username,
    });
  } else {
    createNotification({
      recipientId: targetId,
      actorId: req.user!.id,
      type: 'follow_request',
      category: 'social',
      title: `@${req.user!.username} wants to follow you`,
      message: 'Your account is private. Accept the request to let them in.',
      targetType: 'user',
      targetId: req.user!.username,
    });
  }
  res.json({ following: status === 'accepted', status });
});

router.delete('/users/:id/follow', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user!.id, req.params.id);
  res.json({ ok: true });
});

router.get('/follow/requests', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT f.follower_id AS id, u.username, u.display_name, u.avatar_url, f.created_at
       FROM follows f JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ requests: rows });
});

router.post('/follow/requests/:id/accept', requireAuth, (req: AuthedRequest, res) => {
  db.prepare("UPDATE follows SET status = 'accepted' WHERE follower_id = ? AND following_id = ?").run(req.params.id, req.user!.id);
  const actor = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id) as { username: string } | undefined;
  if (actor) {
    createNotification({
      recipientId: req.params.id,
      actorId: req.user!.id,
      type: 'follow_accepted',
      category: 'social',
      title: `@${req.user!.username} accepted your follow request`,
      message: 'You can now see their universe.',
      targetType: 'user',
      targetId: req.user!.username,
    });
  }
  res.json({ ok: true });
});

router.post('/follow/requests/:id/decline', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/* ------------------------------ friend requests ---------------------------- */

router.post('/friends/:id/request', requireAuth, (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'invalid_target' });
  if (isBlocked(req.user!.id, req.params.id)) return res.status(403).json({ error: 'blocked' });
  const existing = db
    .prepare("SELECT id, status FROM friend_requests WHERE from_id = ? AND to_id = ?")
    .get(req.user!.id, req.params.id) as { id: string; status: string } | undefined;
  if (existing) return res.json({ ok: true, status: existing.status });

  db.prepare('INSERT INTO friend_requests (id, from_id, to_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uid(),
    req.user!.id,
    req.params.id,
    'pending',
    now()
  );
  createNotification({
    recipientId: req.params.id,
    actorId: req.user!.id,
    type: 'friend_request',
    category: 'social',
    title: `@${req.user!.username} sent you a friend request`,
    message: 'Accept it to become mutuals.',
    targetType: 'user',
    targetId: req.user!.username,
  });
  res.status(201).json({ ok: true, status: 'pending' });
});

router.get('/friends/requests', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT fr.id, fr.status, fr.created_at, u.id AS user_id, u.username, u.display_name, u.avatar_url
       FROM friend_requests fr JOIN users u ON u.id = fr.from_id
       WHERE fr.to_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ requests: rows });
});

router.post('/friends/:id/respond', requireAuth, (req: AuthedRequest, res) => {
  const accept = bool(req.body.accept);
  const row = db.prepare('SELECT id, from_id, to_id FROM friend_requests WHERE id = ? AND to_id = ?').get(req.params.id, req.user!.id) as
    | { id: string; from_id: string; to_id: string }
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run(accept ? 'accepted' : 'declined', row.id);
  if (accept) {
    db.prepare(
      'INSERT OR IGNORE INTO follows (follower_id, following_id, status, created_at) VALUES (?, ?, ?, ?)'
    ).run(row.from_id, row.to_id, 'accepted', now());
    db.prepare(
      'INSERT OR IGNORE INTO follows (follower_id, following_id, status, created_at) VALUES (?, ?, ?, ?)'
    ).run(row.to_id, row.from_id, 'accepted', now());
  }
  createNotification({
    recipientId: row.from_id,
    actorId: req.user!.id,
    type: accept ? 'friend_accepted' : 'friend_declined',
    category: 'social',
    title: accept ? `@${req.user!.username} accepted your friend request` : `@${req.user!.username} declined your friend request`,
    message: accept ? 'You are now mutuals.' : '',
    targetType: 'user',
    targetId: req.user!.username,
  });
  res.json({ ok: true, status: accept ? 'accepted' : 'declined' });
});

/* --------------------------- blocks and moderation ------------------------- */

router.get('/blocks', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      'SELECT b.blocked_id AS id, u.username, u.display_name, u.avatar_url FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?'
    )
    .all(req.user!.id);
  res.json({ blocks: rows });
});

router.post('/blocks/:id', requireAuth, (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'invalid_target' });
  db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(
    req.user!.id,
    req.params.id,
    now()
  );
  db.prepare('DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)').run(
    req.user!.id,
    req.params.id,
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

router.delete('/blocks/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user!.id, req.params.id);
  res.json({ ok: true });
});

router.post('/reports', requireAuth, (req: AuthedRequest, res) => {
  const targetType = str(req.body.target_type, 30);
  const targetId = str(req.body.target_id, 80);
  const reason = str(req.body.reason, 80);
  if (!targetType || !targetId || !reason) return res.status(400).json({ error: 'invalid_report' });
  db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    uid(),
    req.user!.id,
    targetType,
    targetId,
    reason,
    str(req.body.details, 1000),
    'open',
    now()
  );
  res.status(201).json({ ok: true });
});

/* -------------------------------- discovery -------------------------------- */

router.get('/search', (req: AuthedRequest, res) => {
  const q = str(req.query.q, 80);
  const type = String(req.query.type || 'all');
  if (q.length < 1) return res.json({ users: [], posts: [], yumesonas: [], stories: [], communities: [], playlists: [], characters: [] });
  const like = `%${q}%`;
  const viewer = req.user?.id ?? '';

  const users =
    type === 'all' || type === 'users'
      ? db
          .prepare(
            `SELECT id, username, display_name, avatar_url, bio, role FROM users
             WHERE (lower(username) LIKE lower(?) OR lower(display_name) LIKE lower(?) OR lower(bio) LIKE lower(?))
             AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
             ORDER BY (role = 'official') DESC, display_name LIMIT 12`
          )
          .all(like, like, like, viewer)
      : [];

  const posts =
    type === 'all' || type === 'posts'
      ? (db
          .prepare(`${POST_SELECT} WHERE p.content LIKE ? AND p.visibility = 'public' ORDER BY p.created_at DESC LIMIT 12`)
          .all(like) as PostRow[]).map((r) => serializePost(r, req.user?.id))
      : [];

  const yumesonas =
    type === 'all' || type === 'yumesonas'
      ? db
          .prepare(
            `SELECT y.id, y.name, y.image_url, y.description, y.universe, u.username FROM yumesonas y JOIN users u ON u.id = y.user_id
             WHERE y.visibility = 'public' AND (y.name LIKE ? OR y.universe LIKE ? OR y.description LIKE ?) LIMIT 12`
          )
          .all(like, like, like)
      : [];

  const stories =
    type === 'all' || type === 'stories'
      ? db
          .prepare(
            `SELECT s.id, s.title, s.description, s.cover_url, s.tags, u.username FROM stories s JOIN users u ON u.id = s.user_id
             WHERE s.status = 'published' AND s.visibility = 'public' AND (s.title LIKE ? OR s.description LIKE ? OR s.tags LIKE ?) LIMIT 12`
          )
          .all(like, like, like)
      : [];

  const communities =
    type === 'all' || type === 'communities'
      ? db
          .prepare(
            `SELECT c.id, c.name, c.slug, c.description, c.cover_url, c.is_private,
              (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active') members
             FROM communities c WHERE c.is_private = 0 AND (c.name LIKE ? OR c.description LIKE ?) LIMIT 12`
          )
          .all(like, like)
      : [];

  const playlists =
    type === 'all' || type === 'playlists'
      ? db
          .prepare(
            `SELECT p.id, p.title, p.description, p.cover_url, u.username,
              (SELECT count(*) FROM playlist_items i WHERE i.playlist_id = p.id) tracks
             FROM playlists p JOIN users u ON u.id = p.user_id
             WHERE p.is_public = 1 AND (p.title LIKE ? OR p.description LIKE ?) LIMIT 12`
          )
          .all(like, like)
      : [];

  const characters =
    type === 'all' || type === 'characters'
      ? db
          .prepare(
            `SELECT c.id, c.name, c.avatar_url, c.universe, u.username FROM characters c JOIN users u ON u.id = c.user_id
             WHERE c.visibility = 'public' AND (c.name LIKE ? OR c.universe LIKE ?) LIMIT 12`
          )
          .all(like, like)
      : [];

  res.json({ users, posts, yumesonas, stories, communities, playlists, characters });
});

router.get('/explore', (req: AuthedRequest, res) => {
  const tags = db
    .prepare(
      `SELECT t.tag, count(*) uses FROM post_tags t JOIN posts p ON p.id = t.post_id
       WHERE p.visibility = 'public' GROUP BY t.tag ORDER BY uses DESC LIMIT 12`
    )
    .all();
  const creators = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio,
        (SELECT count(*) FROM follows f WHERE f.following_id = u.id) followers,
        (SELECT count(*) FROM yumesonas y WHERE y.user_id = u.id) yumesonas
       FROM users u WHERE u.role != 'official' ORDER BY followers DESC, u.created_at DESC LIMIT 8`
    )
    .all();
  const yumesonas = db
    .prepare(
      `SELECT y.id, y.name, y.image_url, y.description, y.universe, u.username
       FROM yumesonas y JOIN users u ON u.id = y.user_id WHERE y.visibility = 'public' ORDER BY y.created_at DESC LIMIT 8`
    )
    .all();
  const stories = db
    .prepare(
      `SELECT s.id, s.title, s.description, s.cover_url, u.username FROM stories s JOIN users u ON u.id = s.user_id
       WHERE s.status = 'published' AND s.visibility = 'public' ORDER BY s.created_at DESC LIMIT 6`
    )
    .all();
  const communities = db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.description, c.is_private,
        (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active') members
       FROM communities c WHERE c.is_private = 0 ORDER BY members DESC LIMIT 6`
    )
    .all();
  const suggestions = req.user
    ? db
        .prepare(
          `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio FROM users u
           WHERE u.id != ? AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
           AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
           ORDER BY u.created_at DESC LIMIT 6`
        )
        .all(req.user.id, req.user.id, req.user.id)
    : [];

  res.json({ tags, creators, yumesonas, stories, communities, suggestions });
});

export default router;
