import { Router } from 'express';
import { db, uid, now } from '../db';
import { type AuthedRequest, requireAuth } from '../auth';
import { bool, parseJson, str } from '../util';
import { createNotification } from '../notify';

const router = Router();

const VIS = ['public', 'followers', 'private'];

function ownYumesona(id: string, userId: string) {
  return db.prepare('SELECT * FROM yumesonas WHERE id = ? AND user_id = ?').get(id, userId) as
    | Record<string, unknown>
    | undefined;
}

function serializeYumesona(row: Record<string, unknown>) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    image_url: row.image_url,
    description: row.description,
    bio: row.bio,
    personality: row.personality,
    universe: row.universe,
    story: row.story,
    relations: row.relations,
    traits: row.traits,
    visibility: row.visibility,
    created_at: row.created_at,
    gallery: db
      .prepare('SELECT id, url, caption, created_at FROM yumesona_gallery WHERE yumesona_id = ? ORDER BY created_at ASC')
      .all(row.id),
    fos: db
      .prepare('SELECT id, name, source, portrait_url, relation_type FROM fos WHERE yumesona_id = ? AND anti_double_enabled = 0')
      .all(row.id),
  };
}

/* -------------------------------- yumesonas -------------------------------- */

router.get('/yumesonas', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM yumesonas WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id) as Record<
    string,
    unknown
  >[];
  res.json({ yumesonas: rows.map(serializeYumesona) });
});

router.get('/yumesonas/public', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT y.*, u.username, u.display_name FROM yumesonas y JOIN users u ON u.id = y.user_id
       WHERE y.visibility = 'public' ORDER BY y.created_at DESC LIMIT 40`
    )
    .all() as Record<string, unknown>[];
  res.json({ yumesonas: rows.map((r) => ({ ...serializeYumesona(r), username: r.username, display_name: r.display_name })) });
});

router.get('/yumesonas/:id', (req: AuthedRequest, res) => {
  const row = db
    .prepare(
      `SELECT y.*, u.username, u.display_name, u.avatar_url FROM yumesonas y JOIN users u ON u.id = y.user_id WHERE y.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  const isOwner = req.user?.id === row.user_id;
  if (row.visibility !== 'public' && !isOwner) return res.status(403).json({ error: 'forbidden' });
  res.json({ yumesona: { ...serializeYumesona(row), username: row.username, display_name: row.display_name } });
});

router.post('/yumesonas', requireAuth, (req: AuthedRequest, res) => {
  const name = str(req.body.name, 80);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const id = uid();
  db.prepare(
    `INSERT INTO yumesonas (id, user_id, name, image_url, description, bio, personality, universe, story, relations, traits, visibility, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user!.id,
    name,
    str(req.body.image_url, 400) || null,
    str(req.body.description, 2000),
    str(req.body.bio, 4000),
    str(req.body.personality, 2000),
    str(req.body.universe, 200),
    str(req.body.story, 6000),
    str(req.body.relations, 2000),
    str(req.body.traits, 1000),
    VIS.includes(req.body.visibility) ? req.body.visibility : 'public',
    now()
  );
  const row = db.prepare('SELECT * FROM yumesonas WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ yumesona: serializeYumesona(row) });
});

router.patch('/yumesonas/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!ownYumesona(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string> = {};
  for (const key of ['name', 'description', 'bio', 'personality', 'universe', 'story', 'relations', 'traits']) {
    if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], key === 'story' || key === 'bio' ? 8000 : 2000);
  }
  if (typeof req.body.image_url === 'string') fields.image_url = str(req.body.image_url, 400);
  if (VIS.includes(req.body.visibility)) fields.visibility = req.body.visibility;
  if (!Object.keys(fields).length) return res.json({ ok: true });
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE yumesonas SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  const row = db.prepare('SELECT * FROM yumesonas WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  res.json({ yumesona: serializeYumesona(row) });
});

router.post('/yumesonas/:id/duplicate', requireAuth, (req: AuthedRequest, res) => {
  const src = ownYumesona(req.params.id, req.user!.id);
  if (!src) return res.status(404).json({ error: 'not_found' });
  const id = uid();
  db.prepare(
    `INSERT INTO yumesonas (id, user_id, name, image_url, description, bio, personality, universe, story, relations, traits, visibility, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user!.id,
    `${src.name} (copy)`,
    src.image_url as string | null,
    src.description as string,
    src.bio as string,
    src.personality as string,
    src.universe as string,
    src.story as string,
    src.relations as string,
    src.traits as string,
    'private',
    now()
  );
  const gallery = db.prepare('SELECT url, caption FROM yumesona_gallery WHERE yumesona_id = ?').all(req.params.id) as {
    url: string;
    caption: string;
  }[];
  for (const item of gallery) {
    db.prepare('INSERT INTO yumesona_gallery (id, yumesona_id, url, caption, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uid(),
      id,
      item.url,
      item.caption,
      now()
    );
  }
  const row = db.prepare('SELECT * FROM yumesonas WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ yumesona: serializeYumesona(row) });
});

router.delete('/yumesonas/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!ownYumesona(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM yumesonas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/yumesonas/:id/gallery', requireAuth, (req: AuthedRequest, res) => {
  if (!ownYumesona(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  const urls: string[] = Array.isArray(req.body.urls)
    ? req.body.urls.filter((u: unknown) => typeof u === 'string').slice(0, 12)
    : req.body.url
      ? [str(req.body.url, 400)]
      : [];
  if (!urls.length) return res.status(400).json({ error: 'no_urls' });
  for (const url of urls) {
    db.prepare('INSERT INTO yumesona_gallery (id, yumesona_id, url, caption, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uid(),
      req.params.id,
      url,
      str(req.body.caption, 300),
      now()
    );
  }
  res.status(201).json({ ok: true });
});

router.delete('/yumesonas/:id/gallery/:itemId', requireAuth, (req: AuthedRequest, res) => {
  if (!ownYumesona(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM yumesona_gallery WHERE id = ? AND yumesona_id = ?').run(req.params.itemId, req.params.id);
  res.json({ ok: true });
});

/* ------------------------------- F/O registry ------------------------------ */

function serializeFo(row: Record<string, unknown>, viewerId?: string) {
  const yumesona = row.yumesona_id
    ? (db.prepare('SELECT id, name, image_url FROM yumesonas WHERE id = ?').get(row.yumesona_id) as
        | { id: string; name: string; image_url: string | null }
        | undefined)
    : undefined;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    source: row.source,
    portrait_url: row.portrait_url,
    yumesona_id: row.yumesona_id,
    yumesona,
    relation_type: row.relation_type,
    description: row.description,
    preferences: row.preferences,
    anti_double_notes: row.user_id === viewerId ? row.anti_double_notes : '',
    anti_double_enabled: row.anti_double_enabled,
    visibility: row.visibility,
    created_at: row.created_at,
    children: db
      .prepare('SELECT id, name, image_url, traits, story, created_at FROM fo_children WHERE fo_id = ? ORDER BY created_at ASC')
      .all(row.id),
  };
}

router.get('/fos', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM fos WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id) as Record<
    string,
    unknown
  >[];
  res.json({ fos: rows.map((r) => serializeFo(r, req.user!.id)) });
});

router.get('/fos/public', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, u.username, u.display_name FROM fos f JOIN users u ON u.id = f.user_id
       WHERE f.visibility = 'public' AND f.anti_double_enabled = 0 ORDER BY f.created_at DESC LIMIT 40`
    )
    .all() as Record<string, unknown>[];
  res.json({ fos: rows.map((r) => ({ ...serializeFo(r), username: r.username, display_name: r.display_name })) });
});

router.get('/fos/:id', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM fos WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  const isOwner = req.user?.id === row.user_id;
  // Anti-Double controls visibility inside YumEra only.
  if (!isOwner && (row.anti_double_enabled === 1 || row.visibility !== 'public'))
    return res.status(404).json({ error: 'not_found' });
  res.json({ fo: serializeFo(row, req.user?.id) });
});

router.post('/fos', requireAuth, (req: AuthedRequest, res) => {
  const name = str(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const id = uid();
  db.prepare(
    `INSERT INTO fos (id, user_id, name, source, portrait_url, yumesona_id, relation_type, description, preferences, anti_double_notes, anti_double_enabled, visibility, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user!.id,
    name,
    str(req.body.source, 200),
    str(req.body.portrait_url, 400) || null,
    str(req.body.yumesona_id, 60) || null,
    str(req.body.relation_type, 40) || 'romantic',
    str(req.body.description, 3000),
    str(req.body.preferences, 2000),
    str(req.body.anti_double_notes, 2000),
    req.body.anti_double_enabled === undefined || bool(req.body.anti_double_enabled) ? 1 : 0,
    VIS.includes(req.body.visibility) ? req.body.visibility : 'private',
    now()
  );
  const row = db.prepare('SELECT * FROM fos WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ fo: serializeFo(row, req.user!.id) });
});

router.patch('/fos/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM fos WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string | number> = {};
  for (const key of ['name', 'source', 'description', 'preferences', 'anti_double_notes', 'relation_type']) {
    if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 3000);
  }
  if (typeof req.body.portrait_url === 'string') fields.portrait_url = str(req.body.portrait_url, 400);
  if (typeof req.body.yumesona_id === 'string') fields.yumesona_id = str(req.body.yumesona_id, 60);
  if (VIS.includes(req.body.visibility)) fields.visibility = req.body.visibility;
  if (req.body.anti_double_enabled !== undefined) fields.anti_double_enabled = bool(req.body.anti_double_enabled) ? 1 : 0;
  if (!Object.keys(fields).length) return res.json({ ok: true });
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE fos SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  const row = db.prepare('SELECT * FROM fos WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  res.json({ fo: serializeFo(row, req.user!.id) });
});

router.post('/fos/:id/duplicate', requireAuth, (req: AuthedRequest, res) => {
  const src = db.prepare('SELECT * FROM fos WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as
    | Record<string, unknown>
    | undefined;
  if (!src) return res.status(404).json({ error: 'not_found' });
  const id = uid();
  db.prepare(
    `INSERT INTO fos (id, user_id, name, source, portrait_url, yumesona_id, relation_type, description, preferences, anti_double_notes, anti_double_enabled, visibility, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user!.id,
    `${src.name} (copy)`,
    src.source as string,
    src.portrait_url as string | null,
    src.yumesona_id as string | null,
    src.relation_type as string,
    src.description as string,
    src.preferences as string,
    src.anti_double_notes as string,
    1,
    'private',
    now()
  );
  const row = db.prepare('SELECT * FROM fos WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ fo: serializeFo(row, req.user!.id) });
});

router.delete('/fos/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM fos WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM fos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------------------- F/O children (bond) -------------------------- */

const TRAIT_POOL = {
  eyes: ['moonlit silver', 'violet dusk', 'rose quartz', 'deep obsidian', 'sea-glass green'],
  hair: ['midnight curls', 'starlight blonde', 'rose-black waves', 'silver-lavender braid'],
  temperament: ['gentle and observant', 'bold and theatrical', 'quietly stubborn', 'warm and protective'],
  gift: ['hears echoes of old songs', 'sees the colour of feelings', 'grows crystal flowers', 'remembers dreams'],
  quirk: ['collects falling stars', 'writes letters to the moon', 'hums when nervous', 'talks to portraits'],
};

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[Math.abs(seed + offset) % arr.length];
}

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

function localChildDraft(foName: string, yumesonaName: string) {
  const seed = hashString(`${foName}:${yumesonaName}`);
  const eyes = pick(TRAIT_POOL.eyes, seed, 1);
  const hair = pick(TRAIT_POOL.hair, seed, 7);
  const temperament = pick(TRAIT_POOL.temperament, seed, 13);
  const gift = pick(TRAIT_POOL.gift, seed, 19);
  const quirk = pick(TRAIT_POOL.quirk, seed, 29);
  const surname = foName.split(' ').slice(-1)[0];
  const given = ['Aurel', 'Mireille', 'Selen', 'Noctis', 'Yuna', 'Lucien', 'Iris', 'Kaito'][Math.abs(seed) % 8];
  return {
    name: `${given} ${surname}`,
    traits: `Eyes: ${eyes}. Hair: ${hair}. Temperament: ${temperament}. Gift: ${gift}. Quirk: ${quirk}.`,
    story: `${given} is the child of ${yumesonaName} and ${foName}. Raised between two universes, they inherited ${hair} and ${eyes}, and a habit of ${quirk}. They are ${temperament}, and ${gift}.`,
  };
}

router.post('/fos/:id/children', requireAuth, (req: AuthedRequest, res) => {
  const fo = db.prepare('SELECT * FROM fos WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as
    | Record<string, unknown>
    | undefined;
  if (!fo) return res.status(404).json({ error: 'not_found' });
  const yumesonaId = str(req.body.yumesona_id, 60) || (fo.yumesona_id as string | null) || null;
  const yumesona = yumesonaId
    ? (db.prepare('SELECT name FROM yumesonas WHERE id = ? AND user_id = ?').get(yumesonaId, req.user!.id) as
        | { name: string }
        | undefined)
    : undefined;
  const draft = localChildDraft(String(fo.name), yumesona?.name || String(req.user!.display_name));
  const name = str(req.body.name, 80) || draft.name;
  const traits = str(req.body.traits, 2000) || draft.traits;
  const story = str(req.body.story, 4000) || draft.story;
  const id = uid();
  db.prepare(
    'INSERT INTO fo_children (id, user_id, fo_id, yumesona_id, name, image_url, traits, story, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.id, req.params.id, yumesonaId, name, str(req.body.image_url, 400) || null, traits, story, now());
  res.status(201).json({
    child: { id, name, traits, story, image_url: str(req.body.image_url, 400) || null, created_at: now() },
    source: 'trait_synthesis',
  });
});

router.delete('/fos/:id/children/:childId', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM fo_children WHERE id = ? AND user_id = ?').run(req.params.childId, req.user!.id);
  res.json({ ok: true });
});

/* --------------------------------- yume lore -------------------------------- */

router.get('/lore', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM yume_lore WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id) as Record<
    string,
    unknown
  >[];
  res.json({ lore: rows.map((r) => ({ ...r, tags: String(r.tags || '').split(',').filter(Boolean) })) });
});

router.get('/lore/public', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT l.*, u.username, u.display_name FROM yume_lore l JOIN users u ON u.id = l.user_id
       WHERE l.visibility = 'public' ORDER BY l.updated_at DESC LIMIT 40`
    )
    .all() as Record<string, unknown>[];
  res.json({ lore: rows.map((r) => ({ ...r, tags: String(r.tags || '').split(',').filter(Boolean) })) });
});

router.post('/lore', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 140);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = uid();
  const tags = Array.isArray(req.body.tags) ? req.body.tags.join(',') : str(req.body.tags, 300);
  db.prepare(
    'INSERT INTO yume_lore (id, user_id, title, content, tags, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    title,
    str(req.body.content, 20000),
    tags,
    VIS.includes(req.body.visibility) ? req.body.visibility : 'private',
    now(),
    now()
  );
  res.status(201).json({ lore: { id, title, content: str(req.body.content, 20000), tags: tags.split(',').filter(Boolean) } });
});

router.patch('/lore/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM yume_lore WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string> = { updated_at: now() };
  for (const key of ['title', 'content']) if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 20000);
  if (Array.isArray(req.body.tags)) fields.tags = req.body.tags.join(',');
  if (VIS.includes(req.body.visibility)) fields.visibility = req.body.visibility;
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE yume_lore SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ ok: true });
});

router.delete('/lore/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM yume_lore WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/* --------------------------- bond / relationship search -------------------- */

router.get('/bond/search', requireAuth, (req: AuthedRequest, res) => {
  const q = str(req.query.q, 80).toLowerCase();
  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.source, f.portrait_url, f.relation_type, u.username, u.display_name
       FROM fos f JOIN users u ON u.id = f.user_id
       WHERE f.visibility = 'public' AND f.anti_double_enabled = 0
         AND (lower(f.name) LIKE ? OR lower(f.source) LIKE ?)
       ORDER BY f.created_at DESC LIMIT 20`
    )
    .all(`%${q}%`, `%${q}%`);
  res.json({ results: rows, note: 'Only F/O entries whose owner disabled Anti-Double appear in bond search.' });
});

export default router;
