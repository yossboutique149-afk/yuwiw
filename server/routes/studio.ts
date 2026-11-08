import { Router } from 'express';
import { db, uid, now } from '../db';
import { type AuthedRequest, requireAuth } from '../auth';
import { str } from '../util';

const router = Router();

/* --------------------------------- folders -------------------------------- */

router.get('/portrait/folders', requireAuth, (req: AuthedRequest, res) => {
  const folders = db.prepare('SELECT * FROM portrait_folders WHERE user_id = ? ORDER BY created_at ASC').all(req.user!.id);
  res.json({ folders });
});

router.post('/portrait/folders', requireAuth, (req: AuthedRequest, res) => {
  const name = str(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const id = uid();
  db.prepare('INSERT INTO portrait_folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, req.user!.id, name, now());
  res.status(201).json({ folder: db.prepare('SELECT * FROM portrait_folders WHERE id = ?').get(id) });
});

router.delete('/portrait/folders/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM portrait_folders WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  db.prepare('UPDATE portraits SET folder_id = NULL WHERE folder_id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/* -------------------------------- portraits ------------------------------- */

function portraitOut(row: Record<string, any>) {
  return {
    ...row,
    data: safeJson(row.data),
  };
}

function safeJson(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

router.get('/portrait/projects', requireAuth, (req: AuthedRequest, res) => {
  const folder = str(req.query.folder, 80);
  const rows = folder
    ? db.prepare('SELECT * FROM portraits WHERE user_id = ? AND folder_id = ? ORDER BY updated_at DESC').all(req.user!.id, folder)
    : db.prepare('SELECT * FROM portraits WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  res.json({ projects: (rows as Record<string, any>[]).map(portraitOut) });
});

router.get('/portrait/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM portraits WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as
    | Record<string, any>
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ project: portraitOut(row) });
});

router.post('/portrait/projects', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 160) || 'Untitled portrait';
  const id = uid();
  const ts = now();
  db.prepare(
    'INSERT INTO portraits (id, user_id, folder_id, title, mode, style, data, thumb, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    str(req.body.folder_id, 80) || null,
    title,
    str(req.body.mode, 40) || 'character',
    str(req.body.style, 40) || 'anime',
    JSON.stringify(req.body.data ?? {}),
    str(req.body.thumb, 400_000) || null,
    ts,
    ts
  );
  res.status(201).json({ project: portraitOut(db.prepare('SELECT * FROM portraits WHERE id = ?').get(id) as Record<string, any>) });
});

router.patch('/portrait/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM portraits WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, unknown> = { updated_at: now() };
  if (typeof req.body.title === 'string') fields.title = str(req.body.title, 160);
  if (typeof req.body.style === 'string') fields.style = str(req.body.style, 40);
  if (typeof req.body.mode === 'string') fields.mode = str(req.body.mode, 40);
  if (req.body.folder_id !== undefined) fields.folder_id = str(req.body.folder_id, 80) || null;
  if (req.body.data !== undefined) fields.data = JSON.stringify(req.body.data);
  if (typeof req.body.thumb === 'string') fields.thumb = str(req.body.thumb, 400_000);
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE portraits SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ project: portraitOut(db.prepare('SELECT * FROM portraits WHERE id = ?').get(req.params.id) as Record<string, any>) });
});

router.post('/portrait/projects/:id/duplicate', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM portraits WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as
    | Record<string, any>
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  const id = uid();
  const ts = now();
  db.prepare(
    'INSERT INTO portraits (id, user_id, folder_id, title, mode, style, data, thumb, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.id, row.folder_id, `${row.title} (copy)`, row.mode, row.style, row.data, row.thumb, ts, ts);
  res.status(201).json({ project: portraitOut(db.prepare('SELECT * FROM portraits WHERE id = ?').get(id) as Record<string, any>) });
});

router.delete('/portrait/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM portraits WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/** Applies a saved portrait as the user's avatar or cover. */
router.post('/portrait/projects/:id/apply', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM portraits WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as
    | Record<string, any>
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  const thumb = row.thumb as string | null;
  if (!thumb) return res.status(400).json({ error: 'portrait_has_no_preview' });
  const target = req.body.target === 'cover' ? 'cover_url' : 'avatar_url';
  db.prepare(`UPDATE users SET ${target} = ? WHERE id = ?`).run(thumb, req.user!.id);
  res.json({ ok: true, target });
});

/* ------------------------------ video projects ---------------------------- */

router.get('/video/projects', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM video_projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  res.json({ projects: (rows as Record<string, any>[]).map((r) => ({ ...r, data: safeJson(r.data) })) });
});

router.get('/video/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM video_projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as
    | Record<string, any>
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ project: { ...row, data: safeJson(row.data) } });
});

router.post('/video/projects', requireAuth, (req: AuthedRequest, res) => {
  const id = uid();
  const ts = now();
  db.prepare('INSERT INTO video_projects (id, user_id, title, data, thumb, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    req.user!.id,
    str(req.body.title, 160) || 'Untitled video',
    JSON.stringify(req.body.data ?? { scenes: [] }),
    str(req.body.thumb, 400_000) || null,
    ts,
    ts
  );
  res.status(201).json({ project: db.prepare('SELECT * FROM video_projects WHERE id = ?').get(id) });
});

router.patch('/video/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM video_projects WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, unknown> = { updated_at: now() };
  if (typeof req.body.title === 'string') fields.title = str(req.body.title, 160);
  if (req.body.data !== undefined) fields.data = JSON.stringify(req.body.data);
  if (typeof req.body.thumb === 'string') fields.thumb = str(req.body.thumb, 400_000);
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE video_projects SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ project: db.prepare('SELECT * FROM video_projects WHERE id = ?').get(req.params.id) });
});

router.delete('/video/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM video_projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/* ----------------------------------- games -------------------------------- */

router.get('/games/leaderboard', (req: AuthedRequest, res) => {
  const game = str(req.query.game, 60);
  const rows = game
    ? db
        .prepare(
          `SELECT g.game, max(g.score) AS score, u.username, u.display_name, u.avatar_url
           FROM game_scores g JOIN users u ON u.id = g.user_id WHERE g.game = ?
           GROUP BY g.user_id ORDER BY score DESC LIMIT 15`
        )
        .all(game)
    : db
        .prepare(
          `SELECT g.game, max(g.score) AS score, u.username, u.display_name, u.avatar_url
           FROM game_scores g JOIN users u ON u.id = g.user_id
           GROUP BY g.game, g.user_id ORDER BY score DESC LIMIT 40`
        )
        .all();
  res.json({ leaderboard: rows });
});

router.post('/games/scores', requireAuth, (req: AuthedRequest, res) => {
  const game = str(req.body.game, 60);
  const score = Number(req.body.score);
  if (!game || !Number.isFinite(score) || score < 0 || score > 10_000_000) return res.status(400).json({ error: 'invalid_score' });
  db.prepare('INSERT INTO game_scores (id, user_id, game, score, created_at) VALUES (?, ?, ?, ?, ?)').run(
    uid(),
    req.user!.id,
    game,
    Math.round(score),
    now()
  );
  const best = db.prepare('SELECT max(score) AS best FROM game_scores WHERE user_id = ? AND game = ?').get(req.user!.id, game) as {
    best: number;
  };
  res.status(201).json({ ok: true, best: best.best });
});

router.get('/games/my-scores', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT game, max(score) AS best, count(*) AS plays FROM game_scores WHERE user_id = ? GROUP BY game')
    .all(req.user!.id);
  res.json({ scores: rows });
});

export default router;
