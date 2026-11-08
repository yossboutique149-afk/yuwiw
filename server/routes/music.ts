import { Router } from 'express';
import fs from 'node:fs';
import { db, uid, now } from '../db';
import { type AuthedRequest, requireAuth } from '../auth';
import { str } from '../util';
import { ensureSong, ensureTone, loadSongs, tonePath } from '../audio';

const router = Router();

const TONES = [
  { id: 'signature', name: 'YumEra Signature Tone', description: 'Crystal bell, celestial and elegant.' },
  { id: 'moonlit', name: 'Moonlit Chime', description: 'Soft descending chime with a long shimmer.' },
  { id: 'rosegold', name: 'Rose Gold Bell', description: 'Warm metallic bell with a rose tint.' },
  { id: 'starlit', name: 'Starlit Sparkle', description: 'Two quick sparkling notes.' },
  { id: 'velvet', name: 'Velvet Hush', description: 'Low, muted, discreet chime.' },
];

/* --------------------------------- library -------------------------------- */

router.get('/music/library', (req: AuthedRequest, res) => {
  const songs = loadSongs().map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    language: s.language,
    bpm: s.bpm,
    mood: s.mood,
    durationSec: s.durationSec,
    lyrics: s.lyrics,
    stream: `/api/music/songs/${s.id}/stream`,
    download: `/api/music/songs/${s.id}/render`,
  }));
  res.json({ songs, total: songs.length });
});

router.get('/music/songs/:id', (req, res) => {
  const song = loadSongs().find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'not_found' });
  res.json({ song, stream: `/api/music/songs/${song.id}/stream`, download: `/api/music/songs/${song.id}/render` });
});

/** Streams the rendered original track (rendered once, then cached on disk). */
router.get('/music/songs/:id/stream', (req, res) => {
  const file = ensureSong(req.params.id, Math.min(180, Number(req.query.seconds) || 180));
  if (!file) return res.status(404).json({ error: 'not_found' });
  const stat = fs.statSync(file);
  const range = req.headers.range;
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Accept-Ranges', 'bytes');
  if (range) {
    const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
    const start = Number(startRaw) || 0;
    const end = endRaw ? Number(endRaw) : stat.size - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Length', String(stat.size));
  fs.createReadStream(file).pipe(res);
});

router.get('/music/songs/:id/render', (req, res) => {
  const file = ensureSong(req.params.id, Math.min(180, Number(req.query.seconds) || 180));
  if (!file) return res.status(404).json({ error: 'not_found' });
  res.download(file, `${req.params.id}.wav`);
});

router.get('/music/tones', (_req, res) => {
  res.json({ tones: TONES });
});

router.get('/music/tones/:id/preview', (req, res) => {
  const tone = TONES.find((t) => t.id === req.params.id);
  if (!tone) return res.status(404).json({ error: 'not_found' });
  res.sendFile(tonePath(tone.id));
});

/* -------------------------------- playlists ------------------------------- */

function playlistDetail(id: string, viewerId: string) {
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!playlist) return null;
  if (playlist.visibility !== 'public' && playlist.user_id !== viewerId && !playlist.collaborative) return null;
  return {
    ...playlist,
    items: db.prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, created_at ASC').all(id),
  };
}

router.get('/playlists', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM playlists WHERE user_id = ? OR collaborative = 1 ORDER BY created_at DESC')
    .all(req.user!.id) as Record<string, unknown>[];
  res.json({
    playlists: rows.map((p) => ({
      ...p,
      items: db.prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC').all(p.id as string),
    })),
  });
});

router.get('/playlists/public', (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, u.username, u.display_name FROM playlists p JOIN users u ON u.id = p.user_id
       WHERE p.visibility = 'public' ORDER BY p.created_at DESC LIMIT 30`
    )
    .all();
  res.json({ playlists: rows });
});

router.get('/playlists/:id', (req: AuthedRequest, res) => {
  const detail = playlistDetail(req.params.id, req.user?.id || '');
  if (!detail) return res.status(404).json({ error: 'not_found' });
  res.json({ playlist: detail });
});

router.post('/playlists', requireAuth, (req: AuthedRequest, res) => {
  const title = str(req.body.title, 160);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = uid();
  db.prepare(
    'INSERT INTO playlists (id, user_id, title, description, cover_url, dedication, visibility, collaborative, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    title,
    str(req.body.description, 2000),
    str(req.body.cover_url, 400) || null,
    str(req.body.dedication, 500),
    ['public', 'followers', 'private'].includes(req.body.visibility) ? req.body.visibility : 'private',
    req.body.collaborative ? 1 : 0,
    now()
  );
  res.status(201).json({ playlist: playlistDetail(id, req.user!.id) });
});

router.patch('/playlists/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(req.params.id) as { user_id: string } | undefined;
  if (!existing || existing.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, string | number> = {};
  for (const key of ['title', 'description', 'dedication']) if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], 3000);
  if (typeof req.body.cover_url === 'string') fields.cover_url = str(req.body.cover_url, 400);
  if (['public', 'followers', 'private'].includes(req.body.visibility)) fields.visibility = req.body.visibility;
  if (req.body.collaborative !== undefined) fields.collaborative = req.body.collaborative ? 1 : 0;
  if (!Object.keys(fields).length) return res.json({ ok: true });
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE playlists SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ playlist: playlistDetail(req.params.id, req.user!.id) });
});

router.delete('/playlists/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.post('/playlists/:id/items', requireAuth, (req: AuthedRequest, res) => {
  const playlist = db.prepare('SELECT user_id, collaborative FROM playlists WHERE id = ?').get(req.params.id) as
    | { user_id: string; collaborative: number }
    | undefined;
  if (!playlist) return res.status(404).json({ error: 'not_found' });
  if (playlist.user_id !== req.user!.id && !playlist.collaborative) return res.status(403).json({ error: 'forbidden' });
  const title = str(req.body.title, 200);
  if (!title) return res.status(400).json({ error: 'title_required' });
  const count = (db.prepare('SELECT count(*) c FROM playlist_items WHERE playlist_id = ?').get(req.params.id) as { c: number }).c;
  const id = uid();
  const songId = str(req.body.song_id, 80) || null;
  db.prepare(
    'INSERT INTO playlist_items (id, playlist_id, song_id, track_id, title, artist, source, url, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.params.id,
    songId,
    songId,
    title,
    str(req.body.artist, 200),
    ['yumera', 'spotify', 'external'].includes(req.body.source) ? req.body.source : 'yumera',
    str(req.body.url, 500) || null,
    count,
    now()
  );
  res.status(201).json({ item: db.prepare('SELECT * FROM playlist_items WHERE id = ?').get(id) });
});

router.delete('/playlist-items/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT i.id, p.user_id, p.collaborative FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id WHERE i.id = ?')
    .get(req.params.id) as { id: string; user_id: string; collaborative: number } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.user_id !== req.user!.id && !row.collaborative) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM playlist_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/**
 * AI playlist builder. Uses the configured OpenAI-compatible provider to pick and order
 * tracks from the YumEra original library. When no provider is configured the request is
 * rejected honestly instead of pretending an AI answered.
 */
router.post('/playlists/ai', requireAuth, async (req: AuthedRequest, res) => {
  const prompt = str(req.body.prompt, 600);
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  const songs = loadSongs();
  const catalogue = songs.map((s) => `${s.id} | ${s.title} | ${s.artist} | ${s.genre} | ${s.language} | ${s.mood}`).join('\n');
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    return res.status(503).json({
      error: 'ai_not_configured',
      message:
        'AI playlist generation needs an AI provider. Add OPENAI_API_KEY (and optionally OPENAI_BASE_URL / AI_MODEL) to the app environment.',
      required_env: ['OPENAI_API_KEY'],
    });
  }
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              'You are the YumEra music curator. Choose tracks ONLY from the provided catalogue. Reply with JSON: {"title":string,"description":string,"ids":string[]}. Use 6 to 12 ids.',
          },
          { role: 'user', content: `Request: ${prompt}\n\nCatalogue:\n${catalogue}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: 'ai_provider_error', status: response.status, detail: detail.slice(0, 400) });
    }
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = payload.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as { title?: string; description?: string; ids?: string[] };
    const chosen = (parsed.ids || []).filter((id) => songs.some((s) => s.id === id)).slice(0, 12);
    if (!chosen.length) return res.status(502).json({ error: 'ai_empty_selection' });
    const id = uid();
    db.prepare(
      'INSERT INTO playlists (id, user_id, title, description, visibility, collaborative, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).run(
      id,
      req.user!.id,
      parsed.title || `AI playlist: ${prompt.slice(0, 40)}`,
      `${parsed.description || 'Generated by AI from the YumEra original library.'}\nPrompt: ${prompt}`,
      'private',
      now()
    );
    chosen.forEach((songId, index) => {
      const song = songs.find((s) => s.id === songId)!;
      db.prepare(
        'INSERT INTO playlist_items (id, playlist_id, song_id, title, artist, source, url, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(uid(), id, song.id, song.title, song.artist, 'yumera', `/api/music/songs/${song.id}/stream`, index, now());
    });
    res.status(201).json({ playlist: playlistDetail(id, req.user!.id), provider: 'ai' });
  } catch (error) {
    res.status(502).json({ error: 'ai_request_failed', detail: (error as Error).message.slice(0, 300) });
  }
});

/* --------------------------------- Spotify -------------------------------- */

function spotifyCredentials() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

let spotifyToken: { token: string; expires: number } | null = null;

async function spotifyAccessToken() {
  const creds = spotifyCredentials();
  if (!creds) return null;
  if (spotifyToken && spotifyToken.expires > Date.now() + 30_000) return spotifyToken.token;
  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token: string; expires_in: number };
  spotifyToken = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

router.get('/music/spotify/status', (_req, res) => {
  res.json({
    configured: Boolean(spotifyCredentials()),
    required_env: spotifyCredentials() ? [] : ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
    note: 'Spotify search uses the official Web API with app credentials. Playback uses the official Spotify embed player; YumEra never hosts Spotify audio.',
  });
});

router.get('/music/spotify/search', async (req, res) => {
  const q = str(req.query.q, 120);
  const type = ['track', 'artist', 'album'].includes(String(req.query.type)) ? String(req.query.type) : 'track';
  if (!q) return res.status(400).json({ error: 'query_required' });
  const token = await spotifyAccessToken();
  if (!token) {
    return res.status(503).json({
      error: 'spotify_not_configured',
      message: 'Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the app environment to search Spotify.',
      required_env: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
    });
  }
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=12`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return res.status(502).json({ error: 'spotify_error', status: response.status });
  const data = (await response.json()) as Record<string, any>;
  const items =
    type === 'track'
      ? (data.tracks?.items || []).map((t: any) => ({
          id: t.id,
          title: t.name,
          artist: (t.artists || []).map((a: any) => a.name).join(', '),
          album: t.album?.name,
          image: t.album?.images?.[0]?.url || null,
          url: t.external_urls?.spotify,
          embed: `https://open.spotify.com/embed/track/${t.id}`,
        }))
      : type === 'artist'
        ? (data.artists?.items || []).map((a: any) => ({
            id: a.id,
            title: a.name,
            image: a.images?.[0]?.url || null,
            url: a.external_urls?.spotify,
            embed: `https://open.spotify.com/embed/artist/${a.id}`,
          }))
        : (data.albums?.items || []).map((a: any) => ({
            id: a.id,
            title: a.name,
            artist: (a.artists || []).map((x: any) => x.name).join(', '),
            image: a.images?.[0]?.url || null,
            url: a.external_urls?.spotify,
            embed: `https://open.spotify.com/embed/album/${a.id}`,
          }));
  res.json({ type, results: items, source: 'spotify' });
});

/* ---------------------------- notification tones -------------------------- */

router.get('/notifications/tones/:id', (req, res) => {
  const tone = TONES.find((t) => t.id === req.params.id);
  if (!tone) return res.status(404).json({ error: 'not_found' });
  res.sendFile(ensureTone(tone.id));
});

export default router;
