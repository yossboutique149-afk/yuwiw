import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorLabel, mediaUrl, useI18n, useToast, uploadFiles } from '../lib/core';
import { Btn, Empty, Field, Icon, Modal, PageHead, Spinner, Tabs } from '../components/ui';
import { encodeGif } from '../lib/gif';

/* ------------------------------------------------------------------------- */
/* Scene model                                                               */
/* ------------------------------------------------------------------------- */

export type LayerKind = 'image' | 'text' | 'ornament';

export type Layer = {
  id: string;
  kind: LayerKind;
  x: number;
  y: number;
  size: number;
  rot: number;
  opacity: number;
  color?: string;
  text?: string;
  font?: string;
  url?: string;
  ornament?: string;
  filter?: string;
  flip?: boolean;
};

export type CharacterCfg = {
  skin: string;
  hair: string;
  hairStyle: string;
  eye: string;
  eyeStyle: string;
  mouth: string;
  outfit: string;
  outfitColor: string;
  accessory: string;
  pose: string;
  blush: boolean;
};

export type Scene = {
  v: 2;
  w: number;
  h: number;
  style: string;
  mode: 'photo' | 'character' | 'couple' | 'group';
  bg: { c1: string; c2: string; texture: string; vignette: number };
  characters: CharacterCfg[];
  layers: Layer[];
  caption: string;
  captionSub: string;
  brightness: number;
  contrast: number;
  saturation: number;
};

export const SIZE_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'profile', label: 'Profile · square', w: 800, h: 800 },
  { id: 'post', label: 'Post · square', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait · vertical', w: 1080, h: 1350 },
  { id: 'cover', label: 'Cover · horizontal', w: 1500, h: 500 },
];

export const STYLES: {
  id: string;
  name: string;
  tagline: string;
  c1: string;
  c2: string;
  ink: string;
  accent: string;
  texture: string;
  frame: string;
  ornaments: string[];
}[] = [
  {
    id: 'anime',
    name: 'Anime & Manga',
    tagline: 'Clean lines, expressive eyes, speed lines',
    c1: '#f7e7f2',
    c2: '#b9c7f0',
    ink: '#2a1b3d',
    accent: '#ff7fb2',
    texture: 'speedlines',
    frame: 'manga',
    ornaments: ['sparkle', 'sakura', 'speedlines', 'halo'],
  },
  {
    id: 'gacha',
    name: 'Gacha & Chibi',
    tagline: 'Big heads, candy palette, stickers',
    c1: '#ffe9f6',
    c2: '#c9b6ff',
    ink: '#3b1f4e',
    accent: '#ffd166',
    texture: 'dots',
    frame: 'sticker',
    ornaments: ['star', 'heart', 'bow', 'confetti'],
  },
  {
    id: 'webtoon',
    name: 'Webtoon & Comic',
    tagline: 'Halftone, panels and speech bubbles',
    c1: '#eef1f7',
    c2: '#9fb3d1',
    ink: '#111827',
    accent: '#e85d75',
    texture: 'halftone',
    frame: 'panel',
    ornaments: ['bubble', 'burst', 'sweat', 'sparkle'],
  },
  {
    id: 'gothic',
    name: 'Gothic & Fantasy',
    tagline: 'Victorian frames, wings, candlelight',
    c1: '#241033',
    c2: '#07030c',
    ink: '#f3e8d6',
    accent: '#d9b26a',
    texture: 'stars',
    frame: 'victorian',
    ornaments: ['wings', 'halo', 'roses', 'moon', 'candle'],
  },
  {
    id: 'pixel',
    name: 'Pixel Art',
    tagline: 'Chunky pixels and limited palettes',
    c1: '#1b1030',
    c2: '#3a1f4d',
    ink: '#ffe9b8',
    accent: '#6ee7d7',
    texture: 'pixels',
    frame: 'pixel',
    ornaments: ['pixelstar', 'pixelheart', 'pixelcrown'],
  },
  {
    id: 'watercolor',
    name: 'Watercolor & Painting',
    tagline: 'Soft washes and paper grain',
    c1: '#fdf6ef',
    c2: '#e6cfe2',
    ink: '#3a2b3f',
    accent: '#a06aa8',
    texture: 'wash',
    frame: 'brush',
    ornaments: ['petals', 'wash', 'butterfly'],
  },
  {
    id: 'cartoon3d',
    name: 'Cartoon & 3D',
    tagline: 'Rounded shapes, soft studio light',
    c1: '#dff3ff',
    c2: '#a9c7f5',
    ink: '#1b2b4b',
    accent: '#ff9f6e',
    texture: 'bokeh',
    frame: 'rounded',
    ornaments: ['balloon', 'star', 'cloud'],
  },
  {
    id: 'photo',
    name: 'Photography Styles',
    tagline: 'Cinematic filters, light leaks, frames',
    c1: '#20242e',
    c2: '#0b0d12',
    ink: '#f6f2ea',
    accent: '#e0b678',
    texture: 'leak',
    frame: 'film',
    ornaments: ['lightleak', 'grain', 'moon'],
  },
];

export const ORNAMENTS = [
  'halo',
  'wings',
  'roses',
  'moon',
  'sparkle',
  'sakura',
  'star',
  'heart',
  'bow',
  'confetti',
  'bubble',
  'burst',
  'candle',
  'pixelstar',
  'pixelheart',
  'pixelcrown',
  'petals',
  'butterfly',
  'balloon',
  'cloud',
  'lightleak',
  'grain',
  'speedlines',
  'sweat',
  'wash',
];

const HAIR_STYLES = ['long', 'short', 'twin', 'bun', 'wavy', 'braid', 'bob'];
const EYE_STYLES = ['soft', 'sharp', 'sleepy', 'star', 'wide'];
const MOUTHS = ['smile', 'soft', 'pout', 'open', 'smirk'];
const OUTFITS = ['dress', 'suit', 'hoodie', 'armor', 'robe', 'uniform'];
const ACCESSORIES = ['none', 'halo', 'crown', 'flowers', 'glasses', 'earrings', 'veil'];
const POSES = ['front', 'tilt', 'three-quarter'];

const PALETTES = {
  skin: ['#f7dcc8', '#eec2a4', '#d9a179', '#b57a55', '#8a5638', '#5e3a26'],
  hair: ['#2b1b2f', '#6b3f2a', '#d9b26a', '#f2d7e6', '#7d5ba6', '#3f6d8c', '#b23a5b', '#e8e6f2'],
  eyes: ['#7b4fa8', '#2f6f8f', '#4a8a5c', '#a8452f', '#c9a227', '#3d3d52', '#c76b98'],
  outfit: ['#2a1038', '#4b2359', '#8e2f52', '#d9b26a', '#e8e6f2', '#1f3a5f', '#6d2f3a'],
};

function styleOf(id: string) {
  return STYLES.find((s) => s.id === id) || STYLES[0];
}

export function emptyCharacter(styleId: string): CharacterCfg {
  const s = styleOf(styleId);
  return {
    skin: PALETTES.skin[0],
    hair: s.id === 'gothic' ? '#2b1b2f' : PALETTES.hair[3],
    hairStyle: 'long',
    eye: s.accent,
    eyeStyle: 'soft',
    mouth: 'smile',
    outfit: 'dress',
    outfitColor: s.ink,
    accessory: s.id === 'gothic' ? 'halo' : 'none',
    pose: 'front',
    blush: true,
  };
}

export function newScene(styleId: string, mode: Scene['mode'], w = 1080, h = 1350): Scene {
  const s = styleOf(styleId);
  return {
    v: 2,
    w,
    h,
    style: s.id,
    mode,
    bg: { c1: s.c1, c2: s.c2, texture: s.texture, vignette: 0.35 },
    characters: mode === 'couple' ? [emptyCharacter(s.id), emptyCharacter(s.id)] : [emptyCharacter(s.id)],
    layers: [],
    caption: '',
    captionSub: '',
    brightness: 100,
    contrast: 100,
    saturation: 100,
  };
}

/* ------------------------------------------------------------------------- */
/* Procedural artwork — original vector resources drawn on canvas             */
/* ------------------------------------------------------------------------- */

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth) return cached;
  if (cached) return cached.naturalWidth ? cached : null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  imageCache.set(src, img);
  img.onload = () => {
    imageCache.set(src, img);
    window.dispatchEvent(new CustomEvent('yumera:image'));
  };
  return img.complete && img.naturalWidth ? img : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, scene: Scene, t: number) {
  const { w, h } = scene;
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, scene.bg.c1);
  g.addColorStop(1, scene.bg.c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rnd = seeded(7);
  const texture = scene.bg.texture;

  if (texture === 'stars') {
    for (let i = 0; i < 190; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = rnd() * 2.4 + 0.6;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + i));
      ctx.fillStyle = rgba('#f7ecd4', 0.25 + tw * 0.65);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba('#d9b26a', 0.18);
    ctx.lineWidth = Math.max(1, w / 900);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(w * (0.15 + rnd() * 0.7), h * (0.15 + rnd() * 0.7), (rnd() * 0.2 + 0.06) * w, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (texture === 'halftone') {
    const step = Math.max(8, w / 46);
    ctx.fillStyle = rgba('#111827', 0.1);
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const d = Math.hypot(x - w * 0.5, y - h * 0.35) / (w * 0.7);
        const r = Math.max(0, (1 - d) * step * 0.42);
        if (r > 0.4) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (texture === 'pixels') {
    const step = Math.max(10, Math.round(w / 54));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (rnd() > 0.86) {
          ctx.fillStyle = rgba(scene.bg.c1, 0.4);
          ctx.fillRect(x, y, step, step);
        }
        if (rnd() > 0.93) {
          ctx.fillStyle = rgba('#6ee7d7', 0.25);
          ctx.fillRect(x + step / 4, y + step / 4, step / 2, step / 2);
        }
      }
    }
  } else if (texture === 'dots') {
    const step = Math.max(12, w / 34);
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.fillStyle = rgba('#ffffff', 0.18);
        ctx.beginPath();
        ctx.arc(x, y, step * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (texture === 'speedlines') {
    ctx.save();
    ctx.translate(w / 2, h * 0.42);
    ctx.strokeStyle = rgba(scene.ink || '#2a1b3d', 0.12);
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * w * 0.28, Math.sin(a) * h * 0.24);
      ctx.lineTo(Math.cos(a) * w * 0.95, Math.sin(a) * h * 0.95);
      ctx.stroke();
    }
    ctx.restore();
  } else if (texture === 'wash') {
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = (0.06 + rnd() * 0.2) * w;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(scene.bg.c2 === '#e6cfe2' ? '#a06aa8' : scene.bg.c2, 0.16));
      grd.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (texture === 'bokeh') {
    for (let i = 0; i < 30; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = (0.03 + rnd() * 0.11) * w;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba('#ffffff', 0.22));
      grd.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (texture === 'leak') {
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, rgba('#e0b678', 0.22));
    grd.addColorStop(0.4, rgba('#e0b678', 0));
    grd.addColorStop(1, rgba('#8a3b6b', 0.22));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  if (scene.bg.vignette > 0) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${scene.bg.vignette})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawOrnament(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, size: number, color: string, t: number) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 100;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, 3 * s);

  switch (kind) {
    case 'halo': {
      ctx.beginPath();
      ctx.ellipse(0, 0, 60 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(0, 0, 70 * s, 26 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'wings': {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 0; i < 4; i++) {
          ctx.quadraticCurveTo(dir * (26 + i * 22) * s, (-18 - i * 12) * s, dir * (34 + i * 26) * s, (10 + i * 8) * s);
        }
        ctx.stroke();
      }
      break;
    }
    case 'roses': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + t * 0.2;
        const x = Math.cos(a) * 44 * s;
        const y = Math.sin(a) * 30 * s;
        for (let k = 3; k >= 1; k--) {
          ctx.globalAlpha = 0.3 + k * 0.2;
          ctx.beginPath();
          ctx.arc(x, y, k * 7 * s, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'moon': {
      ctx.beginPath();
      ctx.arc(0, 0, 46 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(20 * s, -12 * s, 38 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'sparkle':
    case 'pixelstar':
    case 'star': {
      const pts = kind === 'pixelstar' ? 4 : 4;
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const r = i % 2 === 0 ? 42 * s : 12 * s;
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart':
    case 'pixelheart': {
      ctx.beginPath();
      ctx.moveTo(0, 26 * s);
      ctx.bezierCurveTo(-52 * s, -8 * s, -20 * s, -44 * s, 0, -18 * s);
      ctx.bezierCurveTo(20 * s, -44 * s, 52 * s, -8 * s, 0, 26 * s);
      ctx.fill();
      break;
    }
    case 'sakura':
    case 'petals':
    case 'flowers': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, -26 * s, 14 * s, 26 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'bow': {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(dir * 26 * s, 0, 24 * s, 15 * s, dir * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'confetti': {
      const rnd = seeded(31);
      for (let i = 0; i < 22; i++) {
        ctx.save();
        ctx.rotate(rnd() * Math.PI);
        ctx.fillRect((rnd() - 0.5) * 130 * s, (rnd() - 0.5) * 130 * s, 9 * s, 4 * s);
        ctx.restore();
      }
      break;
    }
    case 'bubble': {
      ctx.beginPath();
      ctx.ellipse(0, 0, 62 * s, 40 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-24 * s, 34 * s);
      ctx.lineTo(-40 * s, 62 * s);
      ctx.lineTo(-2 * s, 38 * s);
      ctx.stroke();
      break;
    }
    case 'burst': {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? 58 * s : 30 * s;
        const a = (i / 16) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'candle': {
      ctx.fillRect(-6 * s, -18 * s, 12 * s, 40 * s);
      ctx.beginPath();
      ctx.moveTo(0, -46 * s);
      ctx.quadraticCurveTo(12 * s, -30 * s, 0, -18 * s);
      ctx.quadraticCurveTo(-12 * s, -30 * s, 0, -46 * s);
      ctx.fill();
      break;
    }
    case 'pixelcrown': {
      ctx.beginPath();
      ctx.moveTo(-40 * s, 18 * s);
      ctx.lineTo(-40 * s, -16 * s);
      ctx.lineTo(-16 * s, 4 * s);
      ctx.lineTo(0, -26 * s);
      ctx.lineTo(16 * s, 4 * s);
      ctx.lineTo(40 * s, -16 * s);
      ctx.lineTo(40 * s, 18 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'butterfly': {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(dir * 22 * s, -12 * s, 22 * s, 18 * s, dir * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(dir * 16 * s, 14 * s, 15 * s, 13 * s, dir * -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'balloon': {
      ctx.beginPath();
      ctx.ellipse(0, -14 * s, 30 * s, 36 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 22 * s);
      ctx.quadraticCurveTo(10 * s, 46 * s, 0, 66 * s);
      ctx.stroke();
      break;
    }
    case 'cloud': {
      ctx.beginPath();
      ctx.arc(-28 * s, 6 * s, 20 * s, 0, Math.PI * 2);
      ctx.arc(0, -6 * s, 26 * s, 0, Math.PI * 2);
      ctx.arc(28 * s, 6 * s, 20 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'lightleak': {
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 90 * s);
      grd.addColorStop(0, rgba('#ffd9a0', 0.85));
      grd.addColorStop(1, rgba('#ffd9a0', 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, 90 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'grain': {
      const rnd = seeded(11);
      for (let i = 0; i < 220; i++) {
        ctx.globalAlpha = 0.05 + rnd() * 0.1;
        ctx.fillRect((rnd() - 0.5) * 200 * s, (rnd() - 0.5) * 200 * s, 2 * s, 2 * s);
      }
      break;
    }
    case 'speedlines': {
      for (let i = 0; i < 14; i++) {
        ctx.rotate((Math.PI * 2) / 14);
        ctx.beginPath();
        ctx.moveTo(20 * s, 0);
        ctx.lineTo(95 * s, 0);
        ctx.stroke();
      }
      break;
    }
    case 'sweat': {
      ctx.beginPath();
      ctx.moveTo(0, -34 * s);
      ctx.quadraticCurveTo(22 * s, 4 * s, 0, 22 * s);
      ctx.quadraticCurveTo(-22 * s, 4 * s, 0, -34 * s);
      ctx.fill();
      break;
    }
    case 'wash': {
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 80 * s);
      grd.addColorStop(0, rgba('#a06aa8', 0.5));
      grd.addColorStop(1, rgba('#a06aa8', 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, 80 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, 34 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  c: CharacterCfg,
  cx: number,
  cy: number,
  scale: number,
  t: number,
  outfitPalette: string
) {
  const S = scale;
  ctx.save();
  ctx.translate(cx, cy);

  // shoulders / outfit
  ctx.fillStyle = c.outfitColor || outfitPalette;
  ctx.beginPath();
  if (c.outfit === 'dress') {
    ctx.moveTo(-95 * S, 175 * S);
    ctx.quadraticCurveTo(-120 * S, 330 * S, -150 * S, 430 * S);
    ctx.lineTo(150 * S, 430 * S);
    ctx.quadraticCurveTo(120 * S, 330 * S, 95 * S, 175 * S);
    ctx.quadraticCurveTo(0, 130 * S, -95 * S, 175 * S);
  } else if (c.outfit === 'suit') {
    ctx.moveTo(-110 * S, 160 * S);
    ctx.lineTo(-120 * S, 430 * S);
    ctx.lineTo(120 * S, 430 * S);
    ctx.lineTo(110 * S, 160 * S);
    ctx.quadraticCurveTo(0, 120 * S, -110 * S, 160 * S);
  } else if (c.outfit === 'armor') {
    ctx.moveTo(-125 * S, 165 * S);
    ctx.lineTo(-140 * S, 420 * S);
    ctx.lineTo(140 * S, 420 * S);
    ctx.lineTo(125 * S, 165 * S);
    ctx.quadraticCurveTo(0, 115 * S, -125 * S, 165 * S);
  } else {
    ctx.moveTo(-105 * S, 165 * S);
    ctx.quadraticCurveTo(-112 * S, 330 * S, -100 * S, 430 * S);
    ctx.lineTo(100 * S, 430 * S);
    ctx.quadraticCurveTo(112 * S, 330 * S, 105 * S, 165 * S);
    ctx.quadraticCurveTo(0, 125 * S, -105 * S, 165 * S);
  }
  ctx.closePath();
  ctx.fill();

  if (c.outfit === 'suit' || c.outfit === 'uniform') {
    ctx.strokeStyle = rgba('#ffffff', 0.35);
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.moveTo(-30 * S, 150 * S);
    ctx.lineTo(0, 300 * S);
    ctx.lineTo(30 * S, 150 * S);
    ctx.stroke();
  }
  if (c.outfit === 'robe' || c.outfit === 'dress') {
    ctx.fillStyle = rgba('#ffffff', 0.18);
    ctx.beginPath();
    ctx.moveTo(-95 * S, 180 * S);
    ctx.quadraticCurveTo(-60 * S, 300 * S, -30 * S, 430 * S);
    ctx.lineTo(10 * S, 430 * S);
    ctx.quadraticCurveTo(-20 * S, 280 * S, -20 * S, 180 * S);
    ctx.fill();
  }

  // neck
  ctx.fillStyle = c.skin;
  ctx.fillRect(-22 * S, 90 * S, 44 * S, 70 * S);

  // head
  const tilt = c.pose === 'tilt' ? -0.06 : 0;
  ctx.save();
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.ellipse(0, 10 * S, 78 * S, 92 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // hair back
  ctx.fillStyle = c.hair;
  ctx.beginPath();
  if (c.hairStyle === 'long') {
    ctx.ellipse(0, 30 * S, 96 * S, 118 * S, 0, Math.PI, Math.PI * 2);
    ctx.rect(-96 * S, 30 * S, 192 * S, 130 * S);
  } else if (c.hairStyle === 'wavy') {
    ctx.ellipse(0, 20 * S, 100 * S, 108 * S, 0, Math.PI, Math.PI * 2);
    ctx.rect(-100 * S, 20 * S, 200 * S, 120 * S);
  } else if (c.hairStyle === 'twin') {
    ctx.ellipse(0, 20 * S, 88 * S, 100 * S, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(-104 * S, 96 * S, 26 * S, 62 * S, 0.2, 0, Math.PI * 2);
    ctx.ellipse(104 * S, 96 * S, 26 * S, 62 * S, -0.2, 0, Math.PI * 2);
  } else if (c.hairStyle === 'bun') {
    ctx.ellipse(0, 18 * S, 86 * S, 96 * S, 0, Math.PI, Math.PI * 2);
    ctx.beginPath();
    ctx.arc(0, -104 * S, 40 * S, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, 18 * S, 88 * S, 98 * S, 0, Math.PI, Math.PI * 2);
  }
  ctx.fill();

  // fringe
  ctx.beginPath();
  ctx.moveTo(-80 * S, -20 * S);
  ctx.quadraticCurveTo(-30 * S, -105 * S, 20 * S, -84 * S);
  ctx.quadraticCurveTo(64 * S, -66 * S, 80 * S, -14 * S);
  ctx.quadraticCurveTo(40 * S, -52 * S, -6 * S, -40 * S);
  ctx.quadraticCurveTo(-46 * S, -30 * S, -80 * S, -20 * S);
  ctx.fill();

  // ears
  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.ellipse(-78 * S, 18 * S, 12 * S, 20 * S, 0, 0, Math.PI * 2);
  ctx.ellipse(78 * S, 18 * S, 12 * S, 20 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  const eyeY = 18 * S;
  const eyeDx = 32 * S;
  const blink = Math.sin(t * 1.6) > 0.985 ? 0.12 : 1;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * eyeDx, eyeY);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (c.eyeStyle === 'sharp') ctx.ellipse(0, 0, 22 * S, 15 * S * blink, dir * 0.12, 0, Math.PI * 2);
    else if (c.eyeStyle === 'sleepy') ctx.ellipse(0, 0, 21 * S, 11 * S * blink, 0, 0, Math.PI * 2);
    else if (c.eyeStyle === 'wide') ctx.ellipse(0, 0, 24 * S, 21 * S * blink, 0, 0, Math.PI * 2);
    else ctx.ellipse(0, 0, 22 * S, 18 * S * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13 * S, 15 * S * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a1020';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6 * S, 9 * S * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    if (c.eyeStyle === 'star') {
      ctx.fillStyle = '#ffffff';
      drawOrnament(ctx, 'star', 0, 0, 16 * S * 3, '#ffffff', t);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-4 * S, -6 * S, 4.5 * S * blink, 0, Math.PI * 2);
      ctx.fill();
    }

    // lash line
    ctx.strokeStyle = '#241629';
    ctx.lineWidth = 3.4 * S;
    ctx.beginPath();
    ctx.moveTo(-22 * S, -13 * S * blink);
    ctx.quadraticCurveTo(0, -22 * S * blink, 22 * S, -12 * S * blink);
    ctx.stroke();
    ctx.restore();
  }

  // brows
  ctx.strokeStyle = rgba(c.hair, 0.9);
  ctx.lineWidth = 4 * S;
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 46 * S, -20 * S);
    ctx.quadraticCurveTo(dir * 32 * S, -30 * S, dir * 18 * S, -22 * S);
    ctx.stroke();
  }

  // nose
  ctx.strokeStyle = rgba(c.skin, 0.9);
  ctx.lineWidth = 2.4 * S;
  ctx.beginPath();
  ctx.moveTo(2 * S, 30 * S);
  ctx.lineTo(-2 * S, 42 * S);
  ctx.stroke();

  // mouth
  ctx.strokeStyle = '#a3425c';
  ctx.fillStyle = '#c25470';
  ctx.lineWidth = 3 * S;
  const my = 62 * S;
  if (c.mouth === 'smile') {
    ctx.beginPath();
    ctx.arc(0, my - 8 * S, 18 * S, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  } else if (c.mouth === 'soft') {
    ctx.beginPath();
    ctx.moveTo(-11 * S, my);
    ctx.quadraticCurveTo(0, my + 5 * S, 11 * S, my);
    ctx.stroke();
  } else if (c.mouth === 'pout') {
    ctx.beginPath();
    ctx.ellipse(0, my + 2 * S, 9 * S, 7 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.mouth === 'open') {
    ctx.beginPath();
    ctx.ellipse(0, my + 4 * S, 11 * S, 13 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-13 * S, my);
    ctx.quadraticCurveTo(2 * S, my + 8 * S, 14 * S, my - 4 * S);
    ctx.stroke();
  }

  // blush
  if (c.blush) {
    for (const dir of [-1, 1]) {
      const grd = ctx.createRadialGradient(dir * 48 * S, 46 * S, 0, dir * 48 * S, 46 * S, 24 * S);
      grd.addColorStop(0, 'rgba(233,120,150,0.4)');
      grd.addColorStop(1, 'rgba(233,120,150,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(dir * 48 * S, 46 * S, 24 * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // accessories on head
  if (c.accessory === 'halo') drawOrnament(ctx, 'halo', 0, -128 * S, 190 * S, '#f4e3a8', t);
  if (c.accessory === 'crown') drawOrnament(ctx, 'pixelcrown', 0, -112 * S, 130 * S, '#e6c37a', t);
  if (c.accessory === 'flowers') drawOrnament(ctx, 'flowers', 58 * S, -70 * S, 110 * S, '#f7b7cd', t);
  if (c.accessory === 'veil') {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.moveTo(-90 * S, -60 * S);
    ctx.quadraticCurveTo(-130 * S, 120 * S, -70 * S, 220 * S);
    ctx.moveTo(90 * S, -60 * S);
    ctx.quadraticCurveTo(130 * S, 120 * S, 70 * S, 220 * S);
    ctx.stroke();
  }
  if (c.accessory === 'earrings') {
    ctx.fillStyle = '#e6c37a';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(dir * 80 * S, 48 * S, 7 * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (c.accessory === 'glasses') {
    ctx.strokeStyle = 'rgba(30,20,40,0.75)';
    ctx.lineWidth = 3 * S;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(dir * 32 * S, 18 * S, 30 * S, 24 * S, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-2 * S, 18 * S);
    ctx.lineTo(2 * S, 18 * S);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { w, h } = scene;
  const st = styleOf(scene.style);
  ctx.save();
  ctx.strokeStyle = st.accent;
  ctx.fillStyle = st.accent;

  if (st.frame === 'victorian') {
    const m = Math.min(w, h) * 0.045;
    ctx.lineWidth = Math.max(2, w * 0.006);
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.lineWidth = Math.max(1, w * 0.0022);
    ctx.strokeRect(m * 1.6, m * 1.6, w - m * 3.2, h - m * 3.2);
    for (const [x, y] of [
      [m, m],
      [w - m, m],
      [m, h - m],
      [w - m, h - m],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, m * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, m * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // arch ornaments
    ctx.lineWidth = Math.max(1, w * 0.0022);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(w / 2, m * 1.2, w * (0.12 + i * 0.05), 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  } else if (st.frame === 'manga') {
    ctx.lineWidth = Math.max(3, w * 0.008);
    ctx.strokeStyle = '#1b1226';
    ctx.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
    ctx.strokeStyle = rgba(st.accent, 0.9);
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.beginPath();
    ctx.moveTo(w * 0.03, h * 0.12);
    ctx.lineTo(w * 0.03, h * 0.03);
    ctx.lineTo(w * 0.18, h * 0.03);
    ctx.moveTo(w * 0.97, h * 0.88);
    ctx.lineTo(w * 0.97, h * 0.97);
    ctx.lineTo(w * 0.82, h * 0.97);
    ctx.stroke();
  } else if (st.frame === 'panel') {
    ctx.lineWidth = Math.max(4, w * 0.009);
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(w * 0.035, h * 0.035, w * 0.93, h * 0.93);
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.strokeStyle = rgba('#0f172a', 0.55);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.035);
    ctx.lineTo(w * 0.5, h * 0.2);
    ctx.stroke();
  } else if (st.frame === 'pixel') {
    const u = Math.max(6, Math.round(w / 60));
    ctx.fillStyle = st.accent;
    for (let x = 0; x < w; x += u * 2) {
      ctx.fillRect(x, 0, u, u);
      ctx.fillRect(x, h - u, u, u);
    }
    for (let y = 0; y < h; y += u * 2) {
      ctx.fillRect(0, y, u, u);
      ctx.fillRect(w - u, y, u, u);
    }
  } else if (st.frame === 'film') {
    const u = Math.max(10, Math.round(h * 0.035));
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, w, u);
    ctx.fillRect(0, h - u, w, u);
    ctx.fillStyle = 'rgba(240,236,226,0.85)';
    for (let x = u * 0.6; x < w; x += u * 1.6) {
      ctx.fillRect(x, u * 0.25, u * 0.6, u * 0.5);
      ctx.fillRect(x, h - u * 0.75, u * 0.6, u * 0.5);
    }
  } else if (st.frame === 'rounded') {
    ctx.lineWidth = Math.max(6, w * 0.014);
    ctx.strokeStyle = rgba('#ffffff', 0.75);
    const r = Math.min(w, h) * 0.06;
    ctx.beginPath();
    ctx.moveTo(r, w * 0.02);
    ctx.lineTo(w - r, w * 0.02);
    ctx.quadraticCurveTo(w - w * 0.02, w * 0.02, w - w * 0.02, r);
    ctx.lineTo(w - w * 0.02, h - r);
    ctx.quadraticCurveTo(w - w * 0.02, h - w * 0.02, w - r, h - w * 0.02);
    ctx.lineTo(r, h - w * 0.02);
    ctx.quadraticCurveTo(w * 0.02, h - w * 0.02, w * 0.02, h - r);
    ctx.lineTo(w * 0.02, r);
    ctx.quadraticCurveTo(w * 0.02, w * 0.02, r, w * 0.02);
    ctx.stroke();
  } else if (st.frame === 'brush') {
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = Math.max(3, w * (0.01 - i * 0.002));
      ctx.strokeStyle = rgba(st.accent, 0.5 - i * 0.1);
      ctx.strokeRect(w * (0.02 + i * 0.012), h * (0.02 + i * 0.012), w * (0.96 - i * 0.024), h * (0.96 - i * 0.024));
    }
  } else {
    ctx.lineWidth = Math.max(4, w * 0.008);
    ctx.strokeStyle = rgba(st.accent, 0.85);
    ctx.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
  }
  ctx.restore();
}

/** Renders a scene at full resolution. `t` drives the gentle animations. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  t = 0,
  opts: { frame?: boolean; caption?: boolean } = {}
) {
  const { w, h } = scene;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.filter = `brightness(${scene.brightness}%) contrast(${scene.contrast}%) saturate(${scene.saturation}%)`;
  drawBackground(ctx, scene, t);
  ctx.filter = 'none';

  // characters
  const chars = scene.characters.length ? scene.characters : [];
  const st = styleOf(scene.style);
  if (scene.mode === 'couple' && chars.length >= 2) {
    drawCharacter(ctx, chars[0], w * 0.34, h * 0.5, Math.min(w, h) / 900, t, st.ink);
    drawCharacter(ctx, chars[1], w * 0.66, h * 0.52, Math.min(w, h) / 900, t + 0.7, st.ink);
  } else if (scene.mode === 'group') {
    const n = Math.max(1, chars.length);
    chars.forEach((c, i) => {
      const x = w * (0.5 + (i - (n - 1) / 2) * (n > 2 ? 0.26 : 0.32));
      drawCharacter(ctx, c, x, h * (0.56 + (i % 2 === 0 ? 0 : 0.04)), Math.min(w, h) / 1100, t + i * 0.4, st.ink);
    });
  } else if (chars.length) {
    drawCharacter(ctx, chars[0], w * 0.5, h * 0.52, Math.min(w, h) / 820, t, st.ink);
  }

  // layers
  for (const layer of scene.layers) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x * w, layer.y * h);
    ctx.rotate((layer.rot * Math.PI) / 180);
    if (layer.flip) ctx.scale(-1, 1);
    if (layer.kind === 'image' && layer.url) {
      const img = loadImage(mediaUrl(layer.url));
      if (img && img.naturalWidth) {
        const width = layer.size * w;
        const height = (img.naturalHeight / img.naturalWidth) * width;
        ctx.filter = layer.filter || 'none';
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        ctx.filter = 'none';
      }
    } else if (layer.kind === 'text') {
      const size = layer.size * w;
      ctx.fillStyle = layer.color || '#ffffff';
      ctx.font = `${layer.font === 'serif' ? '600' : '700'} ${size}px ${
        layer.font === 'serif' ? 'Georgia, "Times New Roman", serif' : '"Inter", system-ui, sans-serif'
      }`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = size * 0.35;
      (layer.text || '').split('\n').forEach((line, i, all) => {
        ctx.fillText(line, 0, (i - (all.length - 1) / 2) * size * 1.25);
      });
    } else if (layer.kind === 'ornament') {
      drawOrnament(ctx, layer.ornament || 'star', 0, 0, layer.size * w, layer.color || st.accent, t);
    }
    ctx.restore();
  }

  if (opts.frame !== false) drawFrame(ctx, scene);

  if (opts.caption !== false && (scene.caption || scene.captionSub)) {
    ctx.save();
    const base = h * 0.88;
    if (scene.caption) {
      ctx.fillStyle = st.ink;
      ctx.font = `600 ${w * 0.045}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'center';
      ctx.fillText(scene.caption, w / 2, base);
    }
    if (scene.captionSub) {
      ctx.fillStyle = rgba(st.accent, 0.95);
      ctx.font = `500 ${w * 0.024}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(scene.captionSub, w / 2, base + w * 0.045);
    }
    ctx.restore();
  }
  ctx.restore();
}

function thumbnail(scene: Scene, width = 320): string {
  const ratio = scene.h / scene.w;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  renderScene(ctx, scene, 0);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function sceneCanvas(scene: Scene): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = scene.w;
  canvas.height = scene.h;
  const ctx = canvas.getContext('2d');
  if (ctx) renderScene(ctx, scene, 0);
  return canvas;
}

/* ------------------------------------------------------------------------- */
/* Editor                                                                    */
/* ------------------------------------------------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);

export function PortraitStudioPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { locale } = useI18n();
  const { push } = useToast();

  const [scene, setScene] = useState<Scene>(() => newScene('gothic', 'character'));
  const [projectId, setProjectId] = useState<string | null>(id || null);
  const [title, setTitle] = useState('Untitled portrait');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<any[]>([]);
  const [tab, setTab] = useState('style');
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [useOpen, setUseOpen] = useState(false);
  const [, forceImage] = useState(0);
  const [ready, setReady] = useState(!id);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<Scene[]>([]);
  const future = useRef<Scene[]>([]);
  const saveTimer = useRef<number | null>(null);
  const skipSave = useRef(true);

  const style = styleOf(scene.style);
  const selectedLayer = scene.layers.find((l) => l.id === selected) || null;

  useEffect(() => {
    const onImage = () => forceImage((n) => n + 1);
    window.addEventListener('yumera:image', onImage);
    return () => window.removeEventListener('yumera:image', onImage);
  }, []);

  useEffect(() => {
    api<any>('/portrait/folders')
      .then((res) => setFolders(res.folders || []))
      .catch(() => setFolders([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<any>(`/portrait/projects/${id}`)
      .then((res) => {
        if (!alive) return;
        const p = res.project;
        setProjectId(p.id);
        setTitle(p.title);
        setFolderId(p.folder_id || null);
        if (p.data && typeof p.data === 'object' && p.data.layers) setScene({ ...newScene(p.style, p.mode), ...p.data });
        setReady(true);
        skipSave.current = true;
      })
      .catch(() => {
        if (alive) setReady(true);
        push('Portrait not found', 'error');
      });
    return () => {
      alive = false;
    };
  }, [id, push]);

  const commit = useCallback((next: Scene) => {
    setScene((prev) => {
      history.current = [...history.current.slice(-40), prev];
      future.current = [];
      return next;
    });
  }, []);

  const patch = useCallback(
    (changes: Partial<Scene>) => {
      commit({ ...scene, ...changes });
    },
    [commit, scene]
  );

  // render preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const loop = () => {
      renderScene(ctx, scene, t);
      t += 0.02;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  // autosave
  useEffect(() => {
    if (!ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const thumb = thumbnail(scene);
        if (projectId) {
          await api(`/portrait/projects/${projectId}`, {
            method: 'PATCH',
            body: { title, data: scene, thumb, folder_id: folderId },
          });
        } else {
          const res = await api<any>('/portrait/projects', {
            method: 'POST',
            body: { title, mode: scene.mode, style: scene.style, data: scene, thumb, folder_id: folderId },
          });
          if (res.project?.id) {
            setProjectId(res.project.id);
            window.history.replaceState(null, '', `/portrait/${res.project.id}`);
          }
        }
        setSaved(new Date().toLocaleTimeString(locale));
      } catch {
        setSaved('not saved');
      }
    }, 1200);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [scene, title, folderId, projectId, ready, locale]);

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current = [scene, ...future.current].slice(0, 40);
    setScene(prev);
  };
  const redo = () => {
    const next = future.current.shift();
    if (!next) return;
    history.current = [...history.current, scene];
    setScene(next);
  };

  const applyStyle = (styleId: string) => {
    const st = styleOf(styleId);
    commit({
      ...scene,
      style: styleId,
      bg: { ...scene.bg, c1: st.c1, c2: st.c2, texture: st.texture },
      characters: scene.characters.map((c) => ({
        ...c,
        eye: st.accent,
        accessory: styleId === 'gothic' ? 'halo' : c.accessory,
      })),
    });
  };

  const addLayer = (layer: Partial<Layer> & { kind: LayerKind }) => {
    const next: Layer = {
      id: uid(),
      kind: layer.kind,
      x: 0.5,
      y: 0.35,
      size: 0.3,
      rot: 0,
      opacity: 1,
      color: style.accent,
      ...layer,
    };
    commit({ ...scene, layers: [...scene.layers, next] });
    setSelected(next.id);
    setTab('layers');
  };

  const updateLayer = (patchLayer: Partial<Layer>) => {
    if (!selected) return;
    commit({ ...scene, layers: scene.layers.map((l) => (l.id === selected ? { ...l, ...patchLayer } : l)) });
  };

  const uploadPhoto = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const urls = await uploadFiles(Array.from(files).slice(0, 6));
      const layers: Layer[] = urls.map((url, i) => ({
        id: uid(),
        kind: 'image',
        url,
        x: 0.5,
        y: 0.45,
        size: i === 0 ? 0.86 : 0.3,
        rot: 0,
        opacity: 1,
        filter: scene.style === 'photo' ? 'contrast(1.05) saturate(1.05)' : 'none',
      }));
      commit({ ...scene, layers: [...scene.layers, ...layers] });
      setSelected(layers[0].id);
      setTab('layers');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'upload_failed', locale), 'error');
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: 'png' | 'jpg' | 'gif') => {
    setBusy(true);
    try {
      if (format === 'gif') {
        const small = { ...scene, w: Math.min(480, scene.w), h: Math.round((Math.min(480, scene.w) * scene.h) / scene.w) };
        const frames: Uint8ClampedArray[] = [];
        const canvas = document.createElement('canvas');
        canvas.width = small.w;
        canvas.height = small.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas_unavailable');
        for (let i = 0; i < 12; i++) {
          renderScene(ctx, small, i * 0.45);
          frames.push(ctx.getImageData(0, 0, small.w, small.h).data);
        }
        const bytes = encodeGif({ width: small.w, height: small.h, frames, delayMs: 90 });
        const blob = new Blob([bytes], { type: 'image/gif' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase()}.gif`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const canvas = sceneCanvas(scene);
        const type = format === 'png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
        if (!blob) throw new Error('export_failed');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase()}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      push('Exported', 'success');
    } catch {
      push('Could not export in this browser', 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyTarget = async (target: string, itemId?: string) => {
    setBusy(true);
    try {
      const canvas = sceneCanvas(scene);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('export_failed');
      const file = new File([blob], `portrait-${Date.now()}.jpg`, { type: 'image/jpeg' });

      if (target === 'avatar' || target === 'cover') {
        if (!projectId) throw new Error('save_first');
        await api(`/portrait/projects/${projectId}/apply`, { method: 'POST', body: { target } });
        push(target === 'avatar' ? 'Profile picture updated' : 'Cover updated', 'success');
      } else {
        const [url] = await uploadFiles([file]);
        if (target === 'post') {
          await api('/posts', { method: 'POST', body: { content: title, media: [url], visibility: 'public' } });
          push('Published to the Yume Feed', 'success');
        } else if (target === 'fo' && itemId) {
          await api(`/fos/${itemId}`, { method: 'PATCH', body: { portrait_url: url } });
          push('F/O portrait updated', 'success');
        } else if (target === 'yumesona' && itemId) {
          await api(`/yumesonas/${itemId}`, { method: 'PATCH', body: { image_url: url } });
          push('Yumesona image updated', 'success');
        } else if (target === 'album' && itemId) {
          await api(`/albums/${itemId}/items`, { method: 'POST', body: { kind: 'image', url, caption: title } });
          push('Added to gallery album', 'success');
        } else if (target === 'story' && itemId) {
          await api(`/stories/${itemId}`, { method: 'PATCH', body: { cover_url: url } });
          push('Story cover updated', 'success');
        }
      }
      setUseOpen(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error';
      push(code === 'save_first' ? 'Save the project before applying it' : errorLabel(code, locale), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <Spinner />;

  return (
    <div className="page portrait-page">
      <PageHead
        eyebrow="YumEra V4"
        title="Portrait Studio"
        subtitle="Your face. Your character. Your universe. Built with graphic tools — no generative AI."
        actions={
          <div className="row tight">
            <Btn variant="ghost" onClick={() => navigate('/portrait')}>
              Library
            </Btn>
            <Btn onClick={() => setUseOpen(true)} disabled={busy}>
              Use portrait
            </Btn>
          </div>
        }
      />

      <div className="studio-grid">
        <aside className="studio-panel">
          <div className="stack tight">
            <Field label="Project title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Folder">
              <select value={folderId || ''} onChange={(e) => setFolderId(e.target.value || null)}>
                <option value="">No folder</option>
                {folders.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="tiny muted">{saved ? `Autosaved ${saved}` : 'Autosave active'}</p>
          </div>

          <Tabs
            tabs={[
              { id: 'style', label: 'Styles' },
              { id: 'create', label: 'Create' },
              { id: 'decor', label: 'Decorate' },
              { id: 'layers', label: 'Layers' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'style' ? (
            <div className="stack">
              <div className="style-list">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    className={`style-chip${scene.style === s.id ? ' on' : ''}`}
                    onClick={() => applyStyle(s.id)}
                  >
                    <span className="style-dot" style={{ background: `linear-gradient(135deg, ${s.c1}, ${s.accent})` }} />
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.tagline}</small>
                    </span>
                  </button>
                ))}
              </div>
              <Field label="Canvas size">
                <select
                  value={`${scene.w}x${scene.h}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    commit({ ...scene, w, h });
                  }}
                >
                  {SIZE_PRESETS.map((p) => (
                    <option key={p.id} value={`${p.w}x${p.h}`}>
                      {p.label}
                    </option>
                  ))}
                  <option value={`${scene.w}x${scene.h}`}>Custom {scene.w}×{scene.h}</option>
                </select>
              </Field>
              <div className="grid-2">
                <Field label="Background">
                  <input
                    type="color"
                    value={scene.bg.c1}
                    onChange={(e) => patch({ bg: { ...scene.bg, c1: e.target.value } })}
                  />
                </Field>
                <Field label="Second colour">
                  <input
                    type="color"
                    value={scene.bg.c2}
                    onChange={(e) => patch({ bg: { ...scene.bg, c2: e.target.value } })}
                  />
                </Field>
              </div>
              <Field label="Texture">
                <select
                  value={scene.bg.texture}
                  onChange={(e) => patch({ bg: { ...scene.bg, texture: e.target.value } })}
                >
                  {['stars', 'halftone', 'pixels', 'dots', 'speedlines', 'wash', 'bokeh', 'leak'].map((tx) => (
                    <option key={tx} value={tx}>
                      {tx}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Vignette ${Math.round(scene.bg.vignette * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={Math.round(scene.bg.vignette * 100)}
                  onChange={(e) => patch({ bg: { ...scene.bg, vignette: Number(e.target.value) / 100 } })}
                />
              </Field>
            </div>
          ) : null}

          {tab === 'create' ? (
            <div className="stack">
              <Field label="Creation mode">
                <select
                  value={scene.mode}
                  onChange={(e) => {
                    const mode = e.target.value as Scene['mode'];
                    const count = mode === 'group' ? Math.max(3, scene.characters.length) : mode === 'couple' ? 2 : 1;
                    const chars = [...scene.characters];
                    while (chars.length < count) chars.push(emptyCharacter(scene.style));
                    commit({ ...scene, mode, characters: chars.slice(0, count) });
                  }}
                >
                  <option value="photo">Photo portrait</option>
                  <option value="character">Character portrait</option>
                  <option value="couple">Yume couple</option>
                  <option value="group">Group portrait</option>
                </select>
              </Field>

              <div className="upload-box">
                <label className="btn ghost block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => uploadPhoto(e.target.files)}
                  />
                  Upload photo(s)
                </label>
                <small className="muted">Your own images only. They stay private to this project.</small>
              </div>

              <div className="grid-2">
                <Field label="Brightness">
                  <input
                    type="range"
                    min={40}
                    max={160}
                    value={scene.brightness}
                    onChange={(e) => patch({ brightness: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Contrast">
                  <input
                    type="range"
                    min={40}
                    max={180}
                    value={scene.contrast}
                    onChange={(e) => patch({ contrast: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Saturation">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={scene.saturation}
                    onChange={(e) => patch({ saturation: Number(e.target.value) })}
                  />
                </Field>
              </div>

              {scene.mode !== 'photo'
                ? scene.characters.map((c, i) => (
                    <details key={i} className="panel tight" open={i === 0}>
                      <summary>Character {i + 1}</summary>
                      <div className="stack tight">
                        <div className="grid-2">
                          <Field label="Skin">
                            <select
                              value={c.skin}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, skin: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {PALETTES.skin.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Hair colour">
                            <select
                              value={c.hair}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, hair: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {PALETTES.hair.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Hair style">
                            <select
                              value={c.hairStyle}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, hairStyle: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {HAIR_STYLES.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Eyes">
                            <select
                              value={c.eyeStyle}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, eyeStyle: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {EYE_STYLES.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Eye colour">
                            <select
                              value={c.eye}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, eye: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {PALETTES.eyes.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Mouth">
                            <select
                              value={c.mouth}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, mouth: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {MOUTHS.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Outfit">
                            <select
                              value={c.outfit}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, outfit: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {OUTFITS.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Outfit colour">
                            <select
                              value={c.outfitColor}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, outfitColor: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {PALETTES.outfit.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Accessory">
                            <select
                              value={c.accessory}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, accessory: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {ACCESSORIES.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Pose">
                            <select
                              value={c.pose}
                              onChange={(e) => {
                                const characters = [...scene.characters];
                                characters[i] = { ...c, pose: e.target.value };
                                commit({ ...scene, characters });
                              }}
                            >
                              {POSES.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <label className="row tight small">
                          <input
                            type="checkbox"
                            checked={c.blush}
                            onChange={(e) => {
                              const characters = [...scene.characters];
                              characters[i] = { ...c, blush: e.target.checked };
                              commit({ ...scene, characters });
                            }}
                          />
                          Blush
                        </label>
                      </div>
                    </details>
                  ))
                : null}
            </div>
          ) : null}

          {tab === 'decor' ? (
            <div className="stack">
              <Field label="Ornaments">
                <div className="ornament-grid">
                  {ORNAMENTS.map((o) => (
                    <button
                      key={o}
                      className="ornament-btn"
                      title={o}
                      onClick={() => addLayer({ kind: 'ornament', ornament: o, size: 0.26, y: 0.3 })}
                    >
                      <OrnamentPreview kind={o} color={style.accent} />
                    </button>
                  ))}
                </div>
              </Field>
              <Btn variant="ghost" onClick={() => addLayer({ kind: 'text', text: 'Our universe', size: 0.05, y: 0.85, font: 'serif' })}>
                Add text
              </Btn>
              <Field label="Caption">
                <input value={scene.caption} onChange={(e) => patch({ caption: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Caption subtitle">
                <input value={scene.captionSub} onChange={(e) => patch({ captionSub: e.target.value })} maxLength={80} />
              </Field>
            </div>
          ) : null}

          {tab === 'layers' ? (
            <div className="stack tight">
              {scene.layers.length === 0 ? (
                <p className="muted small">No layers yet. Add ornaments, text or photos.</p>
              ) : (
                scene.layers.map((l) => (
                  <div key={l.id} className={`layer-row${selected === l.id ? ' on' : ''}`}>
                    <button className="layer-name" onClick={() => setSelected(l.id)}>
                      {l.kind === 'image' ? 'Photo' : l.kind === 'text' ? l.text || 'Text' : l.ornament}
                    </button>
                    <div className="row tight">
                      <button
                        className="icon-btn"
                        title="Move up"
                        onClick={() =>
                          commit({
                            ...scene,
                            layers: scene.layers.map((x, i, all) =>
                              i === all.indexOf(l) && i < all.length - 1
                                ? all[i + 1]
                                : i === all.indexOf(l) + 1
                                ? l
                                : x
                            ),
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => {
                          commit({ ...scene, layers: scene.layers.filter((x) => x.id !== l.id) });
                          if (selected === l.id) setSelected(null);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}

              {selectedLayer ? (
                <div className="stack tight layer-controls">
                  <Field label="Size">
                    <input
                      type="range"
                      min={4}
                      max={120}
                      value={Math.round(selectedLayer.size * 100)}
                      onChange={(e) => updateLayer({ size: Number(e.target.value) / 100 })}
                    />
                  </Field>
                  <div className="grid-2">
                    <Field label="X">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(selectedLayer.x * 100)}
                        onChange={(e) => updateLayer({ x: Number(e.target.value) / 100 })}
                      />
                    </Field>
                    <Field label="Y">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(selectedLayer.y * 100)}
                        onChange={(e) => updateLayer({ y: Number(e.target.value) / 100 })}
                      />
                    </Field>
                  </div>
                  <Field label="Rotation">
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selectedLayer.rot}
                      onChange={(e) => updateLayer({ rot: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Opacity">
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(selectedLayer.opacity * 100)}
                      onChange={(e) => updateLayer({ opacity: Number(e.target.value) / 100 })}
                    />
                  </Field>
                  {selectedLayer.kind !== 'image' ? (
                    <Field label="Colour">
                      <input
                        type="color"
                        value={selectedLayer.color || style.accent}
                        onChange={(e) => updateLayer({ color: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  {selectedLayer.kind === 'text' ? (
                    <>
                      <Field label="Text">
                        <textarea
                          rows={2}
                          value={selectedLayer.text || ''}
                          onChange={(e) => updateLayer({ text: e.target.value })}
                        />
                      </Field>
                      <Field label="Font">
                        <select value={selectedLayer.font || 'sans'} onChange={(e) => updateLayer({ font: e.target.value })}>
                          <option value="sans">Sans</option>
                          <option value="serif">Serif</option>
                        </select>
                      </Field>
                    </>
                  ) : null}
                  {selectedLayer.kind === 'image' ? (
                    <Field label="Filter">
                      <select
                        value={selectedLayer.filter || 'none'}
                        onChange={(e) => updateLayer({ filter: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="grayscale(1)">Monochrome</option>
                        <option value="sepia(0.7)">Sepia</option>
                        <option value="contrast(1.15) saturate(1.2)">Cinematic</option>
                        <option value="blur(1.4px)">Soft focus</option>
                        <option value="hue-rotate(300deg) saturate(1.4)">Dream</option>
                      </select>
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section className="studio-stage">
          <div className="stage-toolbar">
            <button className="icon-btn" onClick={undo} title="Undo">
              ↶
            </button>
            <button className="icon-btn" onClick={redo} title="Redo">
              ↷
            </button>
            <span className="chip">{style.name}</span>
            <span className="chip">
              {scene.w}×{scene.h}
            </span>
            <div className="row tight push-right">
              <Btn variant="ghost" onClick={() => download('png')} disabled={busy}>
                PNG
              </Btn>
              <Btn variant="ghost" onClick={() => download('jpg')} disabled={busy}>
                JPG
              </Btn>
              <Btn variant="ghost" onClick={() => download('gif')} disabled={busy}>
                GIF
              </Btn>
            </div>
          </div>

          <div className="canvas-wrap" style={{ aspectRatio: `${scene.w} / ${scene.h}` }}>
            <canvas ref={canvasRef} width={scene.w} height={scene.h} className="studio-canvas" />
          </div>

          <p className="tiny muted center">
            GIF export renders a 12-frame animated preview (glow, particles, blinking) at 480 px.
          </p>
        </section>
      </div>

      {useOpen ? <UsePortraitModal onClose={() => setUseOpen(false)} onApply={applyTarget} busy={busy} /> : null}
    </div>
  );
}

function OrnamentPreview({ kind, color }: { kind: string; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 56, 56);
    ctx.translate(28, 28);
    drawOrnament(ctx, kind, 0, 0, 44, color, 0);
  }, [kind, color]);
  return <canvas ref={ref} width={56} height={56} />;
}

function UsePortraitModal({
  onClose,
  onApply,
  busy,
}: {
  onClose: () => void;
  onApply: (target: string, itemId?: string) => void;
  busy: boolean;
}) {
  const [target, setTarget] = useState('avatar');
  const [items, setItems] = useState<any[]>([]);
  const [itemId, setItemId] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (target === 'fo') {
          const res = await api<any>('/fos');
          if (alive) setItems(res.fos || []);
        } else if (target === 'yumesona') {
          const res = await api<any>('/yumesonas');
          if (alive) setItems(res.yumesonas || []);
        } else if (target === 'album') {
          const res = await api<any>('/albums');
          if (alive) setItems(res.albums || []);
        } else if (target === 'story') {
          const res = await api<any>('/stories/mine').catch(() => ({ stories: [] }));
          if (alive) setItems(res.stories || []);
        } else {
          setItems([]);
        }
      } catch {
        if (alive) setItems([]);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [target]);

  return (
    <Modal title="Use this portrait" onClose={onClose}>
      <div className="stack">
        <Field label="Where">
          <select value={target} onChange={(e) => { setTarget(e.target.value); setItemId(''); }}>
            <option value="avatar">Profile picture</option>
            <option value="cover">Profile cover</option>
            <option value="post">Publish to the Yume Feed</option>
            <option value="fo">F/O portrait</option>
            <option value="yumesona">Yumesona image</option>
            <option value="album">Gallery album</option>
            <option value="story">Story cover</option>
          </select>
        </Field>
        {['fo', 'yumesona', 'album', 'story'].includes(target) ? (
          <Field label="Choose">
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Select…</option>
              {items.map((it: any) => (
                <option key={it.id} value={it.id}>
                  {it.name || it.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <p className="tiny muted">
          Exporting uploads a copy to your own storage. Projects stay private until you publish them.
        </p>
        <div className="row between">
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={busy || (['fo', 'yumesona', 'album', 'story'].includes(target) && !itemId)}
            onClick={() => onApply(target, itemId)}
          >
            Apply
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- */
/* Welcome screen + library                                                  */
/* ------------------------------------------------------------------------- */

export function PortraitHomePage() {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const { push } = useToast();
  const [folders, setFolders] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[] | null>(null);
  const [folder, setFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');

  const load = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([
        api<any>('/portrait/folders').catch(() => ({ folders: [] })),
        api<any>(`/portrait/projects${folder ? `?folder=${folder}` : ''}`).catch(() => ({ projects: [] })),
      ]);
      setFolders(f.folders || []);
      setProjects(p.projects || []);
    } catch {
      setProjects([]);
    }
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  const start = (styleId: string, mode: Scene['mode']) => {
    const scene = newScene(styleId, mode);
    navigate(`/portrait/new?style=${styleId}&mode=${mode}`, { state: { scene } });
  };

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    try {
      await api('/portrait/folders', { method: 'POST', body: { name: newFolder.trim() } });
      setNewFolder('');
      load();
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="YumEra V4"
        title="Portrait Studio"
        subtitle="Create portraits that tell your story. Your characters, your memories, your universe — without generative AI."
        actions={<Btn onClick={() => start('gothic', 'character')}>Start creating</Btn>}
      />

      <div className="portrait-hero">
        <div>
          <h2>Your face. Your character. Your universe.</h2>
          <p className="muted">
            Eight independent visual systems, layered editing, photo tools and animated exports. Every asset is drawn by
            the studio itself — no image model, no external generator.
          </p>
          <div className="row tight wrap">
            <Btn onClick={() => start('gothic', 'couple')}>Yume couple</Btn>
            <Btn variant="ghost" onClick={() => start('anime', 'photo')}>
              Photo portrait
            </Btn>
            <Btn variant="ghost" onClick={() => start('pixel', 'group')}>
              Group portrait
            </Btn>
          </div>
        </div>
        <div className="hero-mosaic">
          {STYLES.slice(0, 4).map((s) => (
            <StyleThumb key={s.id} styleId={s.id} />
          ))}
        </div>
      </div>

      <h2 className="section-title">Eight visual styles</h2>
      <div className="style-cards">
        {STYLES.map((s) => (
          <button key={s.id} className="style-card" onClick={() => start(s.id, 'character')}>
            <StyleThumb styleId={s.id} tall />
            <div className="style-card-body">
              <strong>{s.name}</strong>
              <small>{s.tagline}</small>
            </div>
          </button>
        ))}
      </div>

      <h2 className="section-title">My Portrait Library</h2>
      <div className="row between wrap">
        <div className="row tight wrap">
          <button className={`chip${folder === '' ? ' on' : ''}`} onClick={() => setFolder('')}>
            All
          </button>
          {folders.map((f: any) => (
            <button key={f.id} className={`chip${folder === f.id ? ' on' : ''}`} onClick={() => setFolder(f.id)}>
              {f.name}
            </button>
          ))}
        </div>
        <div className="row tight">
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="New folder"
            className="inline-input"
          />
          <Btn variant="ghost" onClick={createFolder}>
            Add
          </Btn>
        </div>
      </div>

      {projects === null ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <Empty title="No portraits yet" hint="Start with a style above — your work saves automatically." />
      ) : (
        <div className="portrait-grid">
          {projects.map((p: any) => (
            <article key={p.id} className="portrait-card">
              <Link to={`/portrait/${p.id}`} className="portrait-thumb">
                {p.thumb ? <img src={p.thumb} alt={p.title} /> : <div className="thumb-fallback" />}
              </Link>
              <div className="row between tight">
                <div>
                  <strong className="small">{p.title}</strong>
                  <small className="muted block">{p.style} · {p.mode}</small>
                </div>
                <div className="row tight">
                  <button
                    className="icon-btn"
                    title="Duplicate"
                    onClick={async () => {
                      await api(`/portrait/projects/${p.id}/duplicate`, { method: 'POST' }).catch(() => undefined);
                      load();
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    onClick={async () => {
                      if (!confirm(`Delete "${p.title}"?`)) return;
                      await api(`/portrait/projects/${p.id}`, { method: 'DELETE' }).catch(() => undefined);
                      load();
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {p.thumb ? (
                <a className="tiny link" href={p.thumb} download={`${p.title}.jpg`}>
                  Download
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StyleThumb({ styleId, tall = false }: { styleId: string; tall?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scene = newScene(styleId, 'character', 300, tall ? 340 : 220);
    scene.caption = '';
    renderScene(ctx, scene, 0.6);
  }, [styleId, tall]);
  return <canvas ref={ref} width={300} height={tall ? 340 : 220} className="style-thumb-canvas" />;
}
