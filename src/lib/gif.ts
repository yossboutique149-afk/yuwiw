/**
 * Minimal, dependency-free GIF89a encoder used by Portrait Studio to export
 * animated portraits. Frames are quantised to a 6·6·6 colour cube, so no
 * external service or generative model is involved.
 */

const CUBE = 6;

let PALETTE: Uint8Array | null = null;

function palette(): Uint8Array {
  if (PALETTE) return PALETTE;
  const pal = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < CUBE; r++) {
    for (let g = 0; g < CUBE; g++) {
      for (let b = 0; b < CUBE; b++) {
        pal[i * 3] = Math.round((r * 255) / (CUBE - 1));
        pal[i * 3 + 1] = Math.round((g * 255) / (CUBE - 1));
        pal[i * 3 + 2] = Math.round((b * 255) / (CUBE - 1));
        i++;
      }
    }
  }
  for (let k = 0; i < 256; k++) {
    const v = Math.round((k * 255) / 39);
    pal[i * 3] = v;
    pal[i * 3 + 1] = v;
    pal[i * 3 + 2] = v;
    i++;
  }
  PALETTE = pal;
  return pal;
}

function quantize(rgba: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  for (let p = 0, j = 0; j < pixelCount; p += 4, j++) {
    const r = Math.round((rgba[p] / 255) * (CUBE - 1));
    const g = Math.round((rgba[p + 1] / 255) * (CUBE - 1));
    const b = Math.round((rgba[p + 2] / 255) * (CUBE - 1));
    out[j] = r * CUBE * CUBE + g * CUBE + b;
  }
  return out;
}

function lzw(indices: Uint8Array): number[] {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  const bytes: number[] = [];
  let acc = 0;
  let accBits = 0;

  const emit = (code: number) => {
    acc |= code << accBits;
    accBits += codeSize;
    while (accBits >= 8) {
      bytes.push(acc & 0xff);
      acc >>>= 8;
      accBits -= 8;
    }
  };

  const dict = new Map<string, number>();
  emit(clearCode);

  let prefix = '';
  let prefixCode = -1;

  for (let i = 0; i < indices.length; i++) {
    const k = indices[i];
    if (prefix === '') {
      prefix = String(k);
      prefixCode = k;
      continue;
    }
    const key = `${prefix},${k}`;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = key;
      prefixCode = found;
      continue;
    }
    emit(prefixCode);
    if (nextCode < 4096) {
      dict.set(key, nextCode++);
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clearCode);
      dict.clear();
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    }
    prefix = String(k);
    prefixCode = k;
  }

  if (prefix !== '') emit(prefixCode);
  emit(eoiCode);
  if (accBits > 0) bytes.push(acc & 0xff);
  return bytes;
}

function pushSubBlocks(out: number[], data: number[]) {
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
}

export type GifOptions = {
  width: number;
  height: number;
  /** RGBA pixel buffers, one per frame. */
  frames: Uint8ClampedArray[];
  /** Delay per frame in milliseconds. */
  delayMs: number;
  loop?: boolean;
};

/** Encodes RGBA frames into a looping animated GIF (Uint8Array). */
export function encodeGif({ width, height, frames, delayMs, loop = true }: GifOptions): Uint8Array {
  const out: number[] = [];
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  // Header + logical screen descriptor
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  out.push(w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff);
  out.push(0xf7, 0x00, 0x00); // global colour table, 256 colours
  out.push(...Array.from(palette()));

  if (loop) {
    out.push(0x21, 0xff, 0x0b, ...Array.from(new TextEncoder().encode('NETSCAPE2.0')));
    out.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  const delay = Math.max(2, Math.round(delayMs / 10));
  const pixelCount = w * h;

  for (const frame of frames) {
    out.push(0x21, 0xf9, 0x04, 0x04, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00);
    out.push(0x2c, 0x00, 0x00, 0x00, 0x00, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0x00);
    out.push(0x08);
    pushSubBlocks(out, lzw(quantize(frame, pixelCount)));
  }

  out.push(0x3b);
  return Uint8Array.from(out);
}
