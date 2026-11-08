import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_DIR, db } from './db';

const SR = 22050;

type Song = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  root: number;
  scale: 'major' | 'minor';
  progression: number[];
  durationSec: number;
  mood: string;
  language: string;
  lyrics: string[];
};

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleNote(root: number, scale: number[], degree: number, octave = 0) {
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  const oct = Math.floor(degree / scale.length) + octave;
  return root + scale[idx] + oct * 12;
}

function wavHeader(samples: number) {
  const bytes = samples * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  return header;
}

function toWav(samples: Float32Array) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  wavHeader(samples.length).copy(buffer, 0);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32000), 44 + i * 2);
  }
  return buffer;
}

/* ------------------------------ tone rendering ----------------------------- */

const TONE_PRESETS: Record<string, { partials: number[]; base: number; decay: number; shimmer: number }> = {
  signature: { partials: [1, 2.01, 3.02, 4.18, 5.4], base: 1318.5, decay: 2.4, shimmer: 0.35 },
  moonlit: { partials: [1, 1.5, 2.02, 3.4], base: 1046.5, decay: 1.9, shimmer: 0.5 },
  rosegold: { partials: [1, 2.4, 3.9, 5.2], base: 880, decay: 2.8, shimmer: 0.2 },
  starlit: { partials: [1, 2.99, 4.5], base: 1568, decay: 1.4, shimmer: 0.65 },
  velvet: { partials: [1, 1.98, 2.96], base: 587.3, decay: 1.6, shimmer: 0.12 },
};

export function renderTone(id: string): Buffer {
  const preset = TONE_PRESETS[id] || TONE_PRESETS.signature;
  const duration = id === 'starlit' ? 1.2 : id === 'moonlit' ? 1.8 : 1.6;
  const total = Math.floor(SR * duration);
  const out = new Float32Array(total);
  const notes = id === 'starlit' ? [0, 0.18] : id === 'moonlit' ? [0, 0.14] : [0];
  notes.forEach((offset, noteIndex) => {
    const start = Math.floor(offset * SR);
    const base = preset.base * (noteIndex === 0 ? 1 : 1.25);
    for (let i = start; i < total; i += 1) {
      const t = (i - start) / SR;
      let value = 0;
      preset.partials.forEach((partial, p) => {
        const amp = Math.pow(0.55, p);
        value += amp * Math.sin(2 * Math.PI * base * partial * t) * Math.exp(-t * (2.6 - p * 0.25));
      });
      const shimmer = preset.shimmer * Math.sin(2 * Math.PI * 7.5 * t) * Math.exp(-t * 2.2);
      const attack = Math.min(1, t / 0.008);
      const release = Math.min(1, (duration - t) / 0.25);
      out[i] += (value / preset.partials.length) * (1 + shimmer) * attack * Math.max(0, release) * 0.5;
    }
  });
  // gentle one-pole lowpass to keep the tone soft and clean at the end
  let prev = 0;
  for (let i = 0; i < total; i += 1) {
    prev = prev + 0.55 * (out[i] - prev);
    out[i] = prev;
  }
  return toWav(out);
}

/* ------------------------------ song rendering ----------------------------- */

export function loadSongs(): Song[] {
  const file = path.join(process.cwd(), 'shared', 'songs.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { songs: Song[] };
  return data.songs;
}

const DRUM_GENRES = new Set(['Synthwave', 'Electro rock', 'Chiptune', 'Indie pop', 'City pop', 'Alt R&B', 'Neo soul', 'Vaporwave', 'Lo-fi']);

export function renderSong(song: Song, maxSeconds = 180): Buffer {
  const scale = SCALES[song.scale] || SCALES.minor;
  const bpm = song.bpm;
  const beat = 60 / bpm;
  const bars = Math.ceil(Math.min(song.durationSec, maxSeconds) / (beat * 4));
  const total = Math.floor(SR * Math.min(song.durationSec, maxSeconds));
  const out = new Float32Array(total);
  const drums = DRUM_GENRES.has(song.genre);

  const addNote = (midi: number, startSec: number, durSec: number, amp: number, kind: 'sine' | 'tri' | 'bell' | 'pad') => {
    const start = Math.floor(startSec * SR);
    const len = Math.floor(durSec * SR);
    const freq = midiToFreq(midi);
    for (let i = 0; i < len; i += 1) {
      const idx = start + i;
      if (idx < 0 || idx >= total) continue;
      const t = i / SR;
      const env = kind === 'pad' ? Math.min(1, t / 0.35) * Math.min(1, (durSec - t) / 0.5) : Math.exp(-t * 2.6);
      let wave = 0;
      if (kind === 'sine') wave = Math.sin(2 * Math.PI * freq * t);
      else if (kind === 'tri') wave = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
      else if (kind === 'bell') {
        wave =
          Math.sin(2 * Math.PI * freq * t) * 0.7 +
          Math.sin(2 * Math.PI * freq * 2.01 * t) * 0.22 +
          Math.sin(2 * Math.PI * freq * 3.02 * t) * 0.08;
      } else {
        wave = Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 1.005 * t) * 0.4;
      }
      out[idx] += wave * env * amp;
    }
  };

  const addKick = (startSec: number) => {
    const start = Math.floor(startSec * SR);
    const len = Math.floor(0.18 * SR);
    for (let i = 0; i < len; i += 1) {
      const idx = start + i;
      if (idx >= total) break;
      const t = i / SR;
      const env = Math.exp(-t * 26);
      out[idx] += Math.sin(2 * Math.PI * (58 + 120 * Math.exp(-t * 30)) * t) * env * 0.5;
    }
  };
  const addNoise = (startSec: number, amp: number, decay: number) => {
    const start = Math.floor(startSec * SR);
    const len = Math.floor(0.22 * SR);
    for (let i = 0; i < len; i += 1) {
      const idx = start + i;
      if (idx >= total) break;
      const t = i / SR;
      out[idx] += (Math.random() * 2 - 1) * Math.exp(-t * decay) * amp;
    }
  };

  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * beat * 4;
    const degree = song.progression[bar % song.progression.length];
    const chordRoot = scaleNote(song.root, scale, degree);
    const third = scaleNote(song.root, scale, degree + 2);
    const fifth = scaleNote(song.root, scale, degree + 4);

    // pad chord across the bar
    addNote(chordRoot + 12, barStart, beat * 4, 0.11, 'pad');
    addNote(third + 12, barStart, beat * 4, 0.08, 'pad');
    addNote(fifth + 12, barStart, beat * 4, 0.07, 'pad');

    // bass
    addNote(chordRoot - 12, barStart, beat * 1.6, 0.3, 'tri');
    addNote(chordRoot - 12, barStart + beat * 2, beat * 1.4, 0.24, 'tri');

    // arpeggio
    for (let step = 0; step < 8; step += 1) {
      const arpDegrees = [0, 2, 4, 2, 0, 4, 2, 4];
      const note = scaleNote(song.root, scale, degree + arpDegrees[step], 1);
      const velocity = step % 2 === 0 ? 0.14 : 0.09;
      addNote(note, barStart + step * (beat / 2), beat * 0.45, velocity, 'bell');
    }

    // melody: deterministic pseudo-random walk inside the scale
    const seed = song.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), bar * 7);
    for (let step = 0; step < 4; step += 1) {
      const rnd = Math.abs(Math.sin(seed + step * 12.9898)) % 1;
      if (rnd < 0.28) continue;
      const deg = degree + Math.floor(rnd * 7);
      const note = scaleNote(song.root, scale, deg, 1);
      addNote(note, barStart + step * beat, beat * 0.85, 0.12, 'sine');
    }

    if (drums) {
      addKick(barStart);
      addKick(barStart + beat * 2.5);
      addNoise(barStart + beat, 0.09, 22);
      addNoise(barStart + beat * 3, 0.09, 22);
      for (let h = 0; h < 8; h += 1) addNoise(barStart + h * (beat / 2), 0.025, 60);
    }
  }

  // light echo + master fade
  const delaySamples = Math.floor(beat * 0.75 * SR);
  for (let i = delaySamples; i < total; i += 1) out[i] += out[i - delaySamples] * 0.22;
  let peak = 0;
  for (let i = 0; i < total; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.85 / peak : 1;
  const fade = Math.floor(SR * 2.5);
  for (let i = 0; i < total; i += 1) {
    let v = out[i] * gain;
    if (i < fade) v *= i / fade;
    if (i > total - fade) v *= (total - i) / fade;
    out[i] = v;
  }
  return toWav(out);
}

/* --------------------------------- caching -------------------------------- */

export function tonePath(id: string) {
  const safe = String(id).replace(/[^a-z0-9-]/gi, '');
  return path.join(AUDIO_DIR, `tone-${safe}.wav`);
}

export function ensureTone(id: string) {
  const file = tonePath(id);
  if (!fs.existsSync(file)) fs.writeFileSync(file, renderTone(id));
  return file;
}

export function songPath(id: string) {
  const safe = String(id).replace(/[^a-z0-9-]/gi, '');
  return path.join(AUDIO_DIR, `song-${safe}.wav`);
}

export function ensureSong(id: string, seconds = 180) {
  const song = loadSongs().find((s) => s.id === id);
  if (!song) return null;
  const file = songPath(id);
  if (!fs.existsSync(file)) {
    const existing = db.prepare('SELECT duration FROM rendered_audio WHERE id = ?').get(id) as { duration: number } | undefined;
    const buffer = renderSong(song, seconds);
    fs.writeFileSync(file, buffer);
    if (existing) {
      db.prepare('UPDATE rendered_audio SET duration = ? WHERE id = ?').run(seconds, id);
    } else {
      db.prepare('INSERT INTO rendered_audio (id, duration, created_at) VALUES (?, ?, ?)').run(id, seconds, new Date().toISOString());
    }
  }
  return file;
}
