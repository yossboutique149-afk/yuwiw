import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');

for (const dir of [DATA_DIR, UPLOAD_DIR, AUDIO_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(path.join(DATA_DIR, 'yumera.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  cover_url TEXT,
  locale TEXT DEFAULT 'es',
  is_private INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user',
  email_verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  kind TEXT DEFAULT 'reset'
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'accepted',
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  media TEXT DEFAULT '[]',
  visibility TEXT DEFAULT 'public',
  shared_from TEXT,
  community_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT DEFAULT 'like',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT DEFAULT 'dm',
  title TEXT,
  avatar_url TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  last_read_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT DEFAULT '',
  media TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS yumesonas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  description TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  personality TEXT DEFAULT '',
  universe TEXT DEFAULT '',
  story TEXT DEFAULT '',
  relations TEXT DEFAULT '',
  traits TEXT DEFAULT '',
  visibility TEXT DEFAULT 'public',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yumesona_gallery (
  id TEXT PRIMARY KEY,
  yumesona_id TEXT NOT NULL REFERENCES yumesonas(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT DEFAULT '',
  portrait_url TEXT,
  yumesona_id TEXT,
  relation_type TEXT DEFAULT 'romantic',
  description TEXT DEFAULT '',
  preferences TEXT DEFAULT '',
  anti_double_notes TEXT DEFAULT '',
  anti_double_enabled INTEGER DEFAULT 1,
  visibility TEXT DEFAULT 'public',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fo_children (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fo_id TEXT NOT NULL REFERENCES fos(id) ON DELETE CASCADE,
  yumesona_id TEXT,
  name TEXT NOT NULL,
  image_url TEXT,
  traits TEXT DEFAULT '',
  story TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yume_lore (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  visibility TEXT DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  personality TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  universe TEXT DEFAULT '',
  story TEXT DEFAULT '',
  speech_style TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  greeting TEXT DEFAULT '',
  visibility TEXT DEFAULT 'private',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_messages (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_url TEXT,
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  visibility TEXT DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_url TEXT,
  kind TEXT DEFAULT 'gallery',
  description TEXT DEFAULT '',
  visibility TEXT DEFAULT 'private',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS album_items (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  kind TEXT DEFAULT 'image',
  url TEXT,
  caption TEXT DEFAULT '',
  body TEXT DEFAULT '',
  memory_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  mood TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  entry_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT,
  is_private INTEGER DEFAULT 0,
  rules TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_members (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_events (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_url TEXT,
  description TEXT DEFAULT '',
  is_public INTEGER DEFAULT 1,
  visibility TEXT DEFAULT 'private',
  dedication TEXT DEFAULT '',
  collaborative INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT DEFAULT '',
  url TEXT,
  source TEXT DEFAULT 'yumera',
  dedication TEXT DEFAULT '',
  added_by TEXT,
  position INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portrait_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portraits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id TEXT,
  title TEXT NOT NULL,
  mode TEXT DEFAULT 'character',
  style TEXT DEFAULT 'anime',
  data TEXT NOT NULL,
  thumb TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  thumb TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  target_type TEXT,
  target_id TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, category)
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sound TEXT DEFAULT 'yumera-signature',
  sound_enabled INTEGER DEFAULT 1,
  quiet_start TEXT DEFAULT '',
  quiet_end TEXT DEFAULT '',
  email_enabled INTEGER DEFAULT 0,
  push_enabled INTEGER DEFAULT 1,
  muted_until TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_seen TEXT
);

CREATE TABLE IF NOT EXISTS game_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const NOTIFICATION_CATEGORIES = [
  'social',
  'interactions',
  'community',
  'my_yume',
  'character_world',
  'system',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Creates the official YumEra account and platform content (no fake user activity). */
export function seed() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('yumera') as { id: string } | undefined;
  if (existing) return;

  const id = uid();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, username, display_name, password_hash, bio, avatar_url, cover_url, locale, role, email_verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'en', 'official', 1, ?)`
  ).run(
    id,
    'official@yumera.app',
    'yumera',
    'YumEra',
    // Random unusable password: the official account is not a login account.
    crypto.randomBytes(32).toString('hex'),
    'Official account of YumEra: Eternal Universe. Announcements, updates and the celestial guide to the platform.',
    '/icons/icon-192.png',
    null,
    ts
  );

  const post = (content: string) => {
    db.prepare('INSERT INTO posts (id, author_id, content, media, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uid(),
      id,
      content,
      '[]',
      'public',
      now()
    );
  };

  post(
    'Welcome to YumEra: Eternal Universe ✦\n\nThis is a home for yumeshipping, selfshipping, F/O, yumesonas and original characters. Build your universe, keep your memories and create portraits that tell your story — all in one place.'
  );
  post(
    'YumEra V4 Portrait Studio is open. Eight visual styles, photo portraits, character portraits, couple and group compositions — made with real graphic tools, no generative AI. Your face. Your character. Your universe.'
  );
  post(
    'Outside notifications are live: install YumEra on your phone and your universe can reach you even when the app is closed. Read the iPhone guide in Settings → Notification Center → Install.'
  );

  const communityId = uid();
  db.prepare(
    'INSERT INTO communities (id, owner_id, name, slug, description, is_private, rules, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).run(
    communityId,
    id,
    'Celestial Court',
    'celestial-court',
    'The official YumEra community: introductions, portrait challenges, writing prompts and seasonal events.',
    '1. Be kind to every ship and every universe.\n2. Respect Anti-Double boundaries.\n3. Credit artists and writers.\n4. No harassment, spam or adult content involving minors.',
    now()
  );
  db.prepare('INSERT INTO community_members (community_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    communityId,
    id,
    'owner',
    'active',
    now()
  );
  db.prepare('INSERT INTO community_events (id, community_id, title, description, event_date, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uid(),
    communityId,
    'Portrait Season: Celestial Gothic',
    'Share a portrait made in the Gothic & Fantasy style. Every participant gets a feature on the official feed.',
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    now()
  );

  const storyId = uid();
  db.prepare(
    'INSERT INTO stories (id, user_id, title, description, tags, status, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    storyId,
    id,
    'A Guide to the Eternal Universe',
    'How YumEra works: yumesonas, F/O registry, Anti-Double, Portrait Studio and memories.',
    'guide, welcome, yumeshipping',
    'published',
    'public',
    now(),
    now()
  );
  db.prepare('INSERT INTO chapters (id, story_id, title, content, position, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
    uid(),
    storyId,
    'Chapter I — Your universe begins',
    'A yumesona is your presence inside your universe. Create as many as you need in Yumesona Studio: name, portrait, personality, universe and story.\n\nThe F/O Registry keeps the characters you love. Anti-Double is a visibility preference: it hides your F/O from search and public profiles so your space stays yours. It cannot stop other people from independently loving the same character — it only controls how your registry is shown inside YumEra.',
    now()
  );
  db.prepare('INSERT INTO chapters (id, story_id, title, content, position, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(
    uid(),
    storyId,
    'Chapter II — Make it visible',
    'Portrait Studio exports PNG, JPG and animated GIF. Use your portraits as avatars, covers, post images, story illustrations and memory covers. Nothing is published until you decide it is.',
    now()
  );

  for (const category of NOTIFICATION_CATEGORIES) {
    db.prepare(
      'INSERT OR IGNORE INTO notification_preferences (id, user_id, category, enabled, updated_at) VALUES (?, ?, ?, 1, ?)'
    ).run(uid(), id, category, now());
  }
  db.prepare('INSERT OR IGNORE INTO notification_settings (user_id, updated_at) VALUES (?, ?)').run(id, now());
}

seed();
