#!/usr/bin/env node
/**
 * YumEra smoke test.
 *
 * Boots the compiled server (dist-server/index.js) against a throwaway data
 * directory, then exercises the real HTTP API: accounts, social graph,
 * notifications, music library/tones/streaming, playlists, portrait and video
 * studios, games, yumesonas and F/O registry, plus auth guards and the SPA
 * shell. No mocks: every assertion reads a response from the running server.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 4399);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yumera-smoke-'));
const RUN = Date.now().toString(36);

let passed = 0;
const failures = [];

function ok(name, detail) {
  passed += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
  console.log(`  ✗ ${name} — ${detail}`);
}

function check(name, condition, detail) {
  if (condition) ok(name, detail);
  else fail(name, detail || 'assertion failed');
  return Boolean(condition);
}

async function call(pathname, { method = 'GET', body, cookie, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const text = raw ? '' : await res.text();
  let json = null;
  if (!raw && text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text, setCookie, headers: res.headers };
}

function sessionCookie(response) {
  const first = (response.setCookie || [])[0] || '';
  return first.split(';')[0];
}

async function waitForHealth(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist-server', 'index.js'))) {
    throw new Error('dist-server/index.js missing — run `npm run build` first');
  }

  const child = spawn(process.execPath, [path.join(ROOT, 'dist-server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      DATA_DIR,
      SESSION_SECRET: 'smoke-test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => {
    serverLog += d.toString();
  });
  child.stderr.on('data', (d) => {
    serverLog += d.toString();
  });

  try {
    if (!(await waitForHealth())) {
      throw new Error(`server did not become healthy on ${BASE}\n${serverLog.slice(-2000)}`);
    }

    console.log('\n[1] Health and SPA shell');
    const health = await call('/api/health');
    check('health responds 200', health.status === 200, `status ${health.status}`);
    check('health reports the app identity', health.json?.app === 'YumEra: Eternal Universe', String(health.json?.app));
    check('health exposes notification categories', Array.isArray(health.json?.notifications?.categories), 'categories present');

    const spa = await call('/', { raw: true });
    check('SPA shell is served', spa.status === 200, `status ${spa.status}`);
    const manifest = await call('/manifest.webmanifest', { raw: true });
    check('PWA manifest is served', manifest.status === 200, `status ${manifest.status}`);
    const sw = await call('/sw.js', { raw: true });
    check('service worker is served', sw.status === 200, `status ${sw.status}`);

    console.log('\n[2] Accounts and sessions');
    const a = await call('/api/auth/register', {
      method: 'POST',
      body: { email: `smoke.a.${RUN}@yumera.test`, username: `smoke_a_${RUN}`, display_name: 'Smoke A', password: 'SmokePass123', locale: 'es' },
    });
    check('register accepts a new account', a.status < 400, `status ${a.status} ${a.json?.error || ''}`);
    const cookieA = sessionCookie(a);
    check('register sets a session cookie', Boolean(cookieA), cookieA ? 'cookie issued' : 'no cookie');

    const b = await call('/api/auth/register', {
      method: 'POST',
      body: { email: `smoke.b.${RUN}@yumera.test`, username: `smoke_b_${RUN}`, display_name: 'Smoke B', password: 'SmokePass123', locale: 'en' },
    });
    check('register a second account', b.status < 400, `status ${b.status}`);
    const cookieB = sessionCookie(b);

    const me = await call('/api/auth/me', { cookie: cookieA });
    check('session resolves to the account', me.status === 200 && me.json?.user?.username === `smoke_a_${RUN}`, String(me.json?.user?.username));
    check('session returns unread counts', typeof me.json?.counts?.unreadNotifications === 'number', `notifications=${me.json?.counts?.unreadNotifications}`);
    const userA = me.json?.user;
    const userB = (await call('/api/auth/me', { cookie: cookieB })).json?.user;

    const guard = await call('/api/notifications');
    check('protected route rejects anonymous access', guard.status === 401, `status ${guard.status}`);

    console.log('\n[3] Feed, reactions, comments, follows');
    const post = await call('/api/posts', {
      method: 'POST',
      cookie: cookieA,
      body: { content: `Smoke post ${RUN} #yumera`, visibility: 'public' },
    });
    check('create post', post.status < 400 && Boolean(post.json?.post?.id), `status ${post.status}`);
    const postId = post.json?.post?.id;

    const feed = await call('/api/feed', { cookie: cookieA });
    check('feed returns the new post', Array.isArray(feed.json?.posts) && feed.json.posts.some((p) => p.id === postId), `${feed.json?.posts?.length ?? 0} posts`);

    const react = await call('/api/reactions', {
      method: 'POST',
      cookie: cookieB,
      body: { target_type: 'post', target_id: postId, kind: 'love' },
    });
    check('react to a post', react.status < 400 && react.json?.reacted === true, `status ${react.status}`);

    const comment = await call(`/api/posts/${postId}/comments`, {
      method: 'POST',
      cookie: cookieB,
      body: { content: 'Smoke comment' },
    });
    check('comment on a post', comment.status < 400, `status ${comment.status}`);

    const follow = await call(`/api/users/${userA.id}/follow`, { method: 'POST', cookie: cookieB, body: {} });
    check('follow another user', follow.status < 400, `status ${follow.status}`);

    console.log('\n[4] Notifications');
    const notifications = await call('/api/notifications', { cookie: cookieA });
    const list = notifications.json?.notifications || [];
    check('owner receives notifications for interactions', list.length > 0, `${list.length} notifications`);
    check(
      'notifications carry category, actor and read state',
      list.every((n) => n.category && 'is_read' in n),
      'shape ok'
    );
    if (list[0]) {
      const read = await call(`/api/notifications/${list[0].id}/read`, { method: 'POST', cookie: cookieA, body: {} });
      check('mark a notification as read', read.status < 400, `status ${read.status}`);
    }
    const settings = await call('/api/notification-settings', { cookie: cookieA });
    check(
      'notification settings are readable',
      settings.status === 200 &&
        typeof settings.json?.preferences === 'object' &&
        Object.keys(settings.json?.preferences || {}).length > 0,
      `${Object.keys(settings.json?.preferences || {}).length} categories`
    );
    const pushKey = await call('/api/push/public-key');
    check('VAPID public key is exposed', pushKey.status === 200 && typeof pushKey.json?.publicKey === 'string' && pushKey.json.publicKey.length > 20, 'key present');

    console.log('\n[5] Music: original library, tones, streaming, playlists');
    const library = await call('/api/music/library');
    const songs = library.json?.songs || [];
    check('library returns 20 original songs', songs.length === 20, `${songs.length} songs`);
    check(
      'songs include lyrics and a stream url',
      songs.every((s) => Array.isArray(s.lyrics) && s.lyrics.length > 0 && typeof s.stream === 'string'),
      'lyrics + stream on every song'
    );
    const tones = await call('/api/music/tones');
    const toneList = tones.json?.tones || [];
    check('signature tone is available', toneList.some((t) => t.id === 'signature'), `${toneList.length} tones`);

    const stream = await call(`/api/music/songs/${songs[0].id}/stream`, { raw: true, headers: { range: 'bytes=0-2047' } });
    check('song streams audio', [200, 206].includes(stream.status), `status ${stream.status}`);
    check('stream is audio', String(stream.headers.get('content-type') || '').startsWith('audio/'), String(stream.headers.get('content-type')));

    const playlist = await call('/api/playlists', { method: 'POST', cookie: cookieA, body: { title: `Smoke playlist ${RUN}`, visibility: 'private' } });
    check('create playlist', playlist.status < 400, `status ${playlist.status}`);
    const playlistId = playlist.json?.playlist?.id;
    if (playlistId) {
      const item = await call(`/api/playlists/${playlistId}/items`, {
        method: 'POST',
        cookie: cookieA,
        body: { song_id: songs[0].id, title: songs[0].title, artist: songs[0].artist, source: 'yumera' },
      });
      check('add a song to the playlist', item.status < 400, `status ${item.status}`);
      const detail = await call(`/api/playlists/${playlistId}`, { cookie: cookieA });
      check('playlist persists its items', (detail.json?.playlist?.items || []).length >= 1, `${(detail.json?.playlist?.items || []).length} items`);
    }
    const ai = await call('/api/playlists/ai', { method: 'POST', cookie: cookieA, body: { prompt: 'algo luminoso y nostálgico' } });
    check(
      'AI playlist either builds a playlist or reports missing credentials',
      ai.status === 201 || (ai.status === 503 && ai.json?.error === 'ai_not_configured'),
      `status ${ai.status} ${ai.json?.error || ''}`
    );
    const spotify = await call('/api/music/spotify/status', { cookie: cookieA });
    check('Spotify status is honest about configuration', spotify.status === 200 && typeof spotify.json?.configured === 'boolean', `configured=${spotify.json?.configured}`);
    const aiStatus = await call('/api/ai/status', { cookie: cookieA });
    check('AI status reports configuration', aiStatus.status === 200 && typeof aiStatus.json?.configured === 'boolean', `configured=${aiStatus.json?.configured}`);

    console.log('\n[6] Portrait and video studios');
    const portrait = await call('/api/portrait/projects', {
      method: 'POST',
      cookie: cookieA,
      body: { title: `Smoke portrait ${RUN}`, mode: 'character', style: 'gothic', data: { layers: [] }, thumb: null },
    });
    check('save a portrait project', portrait.status < 400 && Boolean(portrait.json?.project?.id), `status ${portrait.status}`);
    const portraitId = portrait.json?.project?.id;
    const portraits = await call('/api/portrait/projects', { cookie: cookieA });
    check('portrait library lists the project', (portraits.json?.projects || []).some((p) => p.id === portraitId), `${(portraits.json?.projects || []).length} projects`);
    if (portraitId) {
      const dup = await call(`/api/portrait/projects/${portraitId}/duplicate`, { method: 'POST', cookie: cookieA, body: {} });
      check('duplicate a portrait', dup.status < 400, `status ${dup.status}`);
    }
    const video = await call('/api/video/projects', {
      method: 'POST',
      cookie: cookieA,
      body: { title: `Smoke video ${RUN}`, data: { scenes: [], ratio: '16:9' }, thumb: null },
    });
    check('save a video draft', video.status < 400 && Boolean(video.json?.project?.id), `status ${video.status}`);

    console.log('\n[7] Games and leaderboard');
    const score = await call('/api/games/scores', { method: 'POST', cookie: cookieA, body: { game: 'crystal-memory', score: 420 } });
    check('submit a game score', score.status < 400 && score.json?.best >= 420, `best=${score.json?.best}`);
    const board = await call('/api/games/leaderboard?game=crystal-memory', { cookie: cookieA });
    check('leaderboard includes the score', (board.json?.leaderboard || []).some((r) => r.score >= 420), `${(board.json?.leaderboard || []).length} entries`);
    const myScores = await call('/api/games/my-scores', { cookie: cookieA });
    check('personal scores are tracked', (myScores.json?.scores || []).some((s) => s.game === 'crystal-memory'), `${(myScores.json?.scores || []).length} games`);

    console.log('\n[8] Yumesonas, F/O registry and lore');
    const yumesona = await call('/api/yumesonas', {
      method: 'POST',
      cookie: cookieA,
      body: { name: `Smoke Yumesona ${RUN}`, description: 'Test', universe: 'Smoke universe', visibility: 'private' },
    });
    check('create a yumesona', yumesona.status < 400 && Boolean(yumesona.json?.yumesona?.id), `status ${yumesona.status}`);
    const yumesonaId = yumesona.json?.yumesona?.id;
    const yumesonas = await call('/api/yumesonas', { cookie: cookieA });
    check('yumesona studio lists it', (yumesonas.json?.yumesonas || []).some((y) => y.id === yumesonaId), `${(yumesonas.json?.yumesonas || []).length} yumesonas`);
    const fo = await call('/api/fos', {
      method: 'POST',
      cookie: cookieA,
      body: { name: `Smoke F/O ${RUN}`, source: 'Original work', yumesona_id: yumesonaId, relation_type: 'romantic', anti_double_enabled: true },
    });
    check('create an F/O entry', fo.status < 400 && Boolean(fo.json?.fo?.id), `status ${fo.status}`);
    const fos = await call('/api/fos', { cookie: cookieA });
    check('F/O registry lists it', (fos.json?.fos || []).some((f) => f.id === fo.json?.fo?.id), `${(fos.json?.fos || []).length} entries`);

    console.log('\n[9] Content spaces');
    const story = await call('/api/stories', { method: 'POST', cookie: cookieA, body: { title: `Smoke story ${RUN}`, tags: ['smoke'], status: 'draft', visibility: 'private' } });
    check('create a story draft', story.status < 400, `status ${story.status}`);
    const album = await call('/api/albums', { method: 'POST', cookie: cookieA, body: { title: `Smoke album ${RUN}`, kind: 'gallery', visibility: 'private' } });
    check('create a gallery album', album.status < 400, `status ${album.status}`);
    const diary = await call('/api/diary', { method: 'POST', cookie: cookieA, body: { title: `Smoke diary ${RUN}`, content: 'private entry' } });
    check('create a diary entry', diary.status < 400, `status ${diary.status}`);
    const community = await call('/api/communities', { method: 'POST', cookie: cookieA, body: { name: `Smoke Community ${RUN}`, description: 'Test', is_private: false } });
    check('create a community', community.status < 400, `status ${community.status}`);

    const diaryGuard = await call('/api/diary');
    check('diary is never exposed anonymously', diaryGuard.status === 401, `status ${diaryGuard.status}`);
    const explore = await call('/api/explore', { cookie: cookieA });
    check('explore returns discovery buckets', explore.status === 200 && Boolean(explore.json), `status ${explore.status}`);
    const search = await call(`/api/search?q=smoke_a_${RUN}`, { cookie: cookieA });
    check('search finds the account', (search.json?.users || []).some((u) => u.username === `smoke_a_${RUN}`), `${(search.json?.users || []).length} users`);

    const logout = await call('/api/auth/logout', { method: 'POST', cookie: cookieA, body: {} });
    check('logout succeeds', logout.status < 400, `status ${logout.status}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    if (!child.killed) child.kill('SIGKILL');
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nSmoke test error: ${err.message}`);
  process.exitCode = 1;
});
