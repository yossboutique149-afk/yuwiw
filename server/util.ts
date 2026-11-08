import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { UPLOAD_DIR } from './db';

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
]);

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = EXT[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new Error('unsupported_file_type'));
      return;
    }
    cb(null, true);
  },
});

export function uploadedUrls(files: Express.Multer.File[] | undefined) {
  if (!files) return [];
  return files.map((f) => `/uploads/${f.filename}`);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function clampLimit(raw: unknown, fallback = 20, max = 60) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function str(value: unknown, max = 5000) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

export function bool(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export const HASHTAG_RE = /#([\p{L}\p{N}_]{1,40})/gu;
export const MENTION_RE = /@([a-zA-Z0-9_.]{2,30})/g;

export function extractTags(text: string) {
  const tags = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 20);
}

export function extractMentions(text: string) {
  const names = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) names.add(m[1].toLowerCase());
  return [...names].slice(0, 20);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function isoDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
