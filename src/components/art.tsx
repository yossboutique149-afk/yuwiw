import React, { useId } from 'react';

/**
 * Original vector artwork for YumEra (no external or licensed assets).
 * Every variant is drawn with its own silhouette + palette so the styles are
 * visually distinct instead of being recoloured copies of one shape.
 */
export type ArtVariant =
  | 'moon'
  | 'galaxy'
  | 'wings'
  | 'rose'
  | 'crown'
  | 'tower'
  | 'constellation'
  | 'chalice';

const STARS: [number, number, number][] = [
  [42, 58, 1.6],
  [356, 74, 2.1],
  [86, 128, 1.1],
  [318, 152, 1.4],
  [64, 246, 1.3],
  [338, 268, 1.7],
  [118, 330, 1.1],
  [286, 342, 1.5],
  [196, 42, 1.2],
  [148, 372, 1.4],
  [252, 96, 1],
  [30, 176, 1.2],
];

function Starfield({ tint }: { tint: string }) {
  return (
    <g fill={tint} opacity="0.85">
      {STARS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} opacity={i % 3 === 0 ? 0.9 : 0.55} />
      ))}
    </g>
  );
}

export function CelestialArt({
  variant = 'moon',
  className = '',
  title,
}: {
  variant?: ArtVariant;
  className?: string;
  title?: string;
}) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sky = `sky${raw}`;
  const halo = `halo${raw}`;
  const gold = `gold${raw}`;
  const rose = `rose${raw}`;
  const violet = `violet${raw}`;

  return (
    <svg
      className={`celestial-art ${className}`}
      viewBox="0 0 400 400"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={sky} cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="#2a1740" />
          <stop offset="55%" stopColor="#150f22" />
          <stop offset="100%" stopColor="#07060c" />
        </radialGradient>
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f2dfae" stopOpacity="0.55" />
          <stop offset="70%" stopColor="#d8b878" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#d8b878" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2dfae" />
          <stop offset="100%" stopColor="#b08a4a" />
        </linearGradient>
        <linearGradient id={rose} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0c8d8" />
          <stop offset="100%" stopColor="#a05f7d" />
        </linearGradient>
        <linearGradient id={violet} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7b52ad" />
          <stop offset="100%" stopColor="#2a1740" />
        </linearGradient>
      </defs>

      <rect width="400" height="400" rx="26" fill={`url(#${sky})`} />
      <circle cx="200" cy="186" r="150" fill={`url(#${halo})`} />
      <Starfield tint="#f2dfae" />

      {variant === 'moon' && (
        <g>
          <circle cx="200" cy="186" r="92" fill={`url(#${gold})`} opacity="0.16" />
          <path
            d="M236 96a94 94 0 1 0 0 180 78 78 0 1 1 0-180Z"
            fill={`url(#${gold})`}
            opacity="0.95"
          />
          <circle cx="200" cy="186" r="118" fill="none" stroke={`url(#${gold})`} strokeWidth="1.2" opacity="0.55" />
          <ellipse cx="200" cy="186" rx="152" ry="46" fill="none" stroke={`url(#${rose})`} strokeWidth="1.4" opacity="0.5" transform="rotate(-18 200 186)" />
          <path d="M96 300c26-18 52-18 78 0s52 18 78 0 52-18 78 0" fill="none" stroke={`url(#${rose})`} strokeWidth="1.2" opacity="0.35" />
        </g>
      )}

      {variant === 'galaxy' && (
        <g>
          <path d="M200 186c-52-30-96-14-112 18 22-4 44 4 62 18 34 26 74 22 100-6-30 8-58-2-78-18-24-19-52-21-74-8" fill={`url(#${violet})`} opacity="0.9" />
          <path d="M200 186c52-30 96-14 112 18-22-4-44 4-62 18-34 26-74 22-100-6 30 8 58-2 78-18 24-19 52-21 74-8" fill={`url(#${violet})`} opacity="0.65" transform="rotate(180 200 186)" />
          <circle cx="200" cy="186" r="30" fill={`url(#${gold})`} opacity="0.9" />
          <circle cx="200" cy="186" r="54" fill="none" stroke={`url(#${gold})`} strokeWidth="1" opacity="0.45" />
          <circle cx="286" cy="118" r="7" fill={`url(#${rose})`} />
          <circle cx="112" cy="266" r="5" fill={`url(#${rose})`} />
        </g>
      )}

      {variant === 'wings' && (
        <g>
          <path d="M196 186c-34-46-74-62-112-54 22 10 34 26 40 44-20-8-40-6-58 4 26 4 44 16 56 32-18 0-34 8-46 20 30-2 54 6 72 20 20 15 36 22 48 22Z" fill={`url(#${gold})`} opacity="0.8" />
          <path d="M204 186c34-46 74-62 112-54-22 10-34 26-40 44 20-8 40-6 58 4-26 4-44 16-56 32 18 0 34 8 46 20-30-2-54 6-72 20-20 15-36 22-48 22Z" fill={`url(#${gold})`} opacity="0.8" />
          <circle cx="200" cy="196" r="26" fill={`url(#${rose})`} />
          <circle cx="200" cy="196" r="40" fill="none" stroke={`url(#${gold})`} strokeWidth="1.1" opacity="0.6" />
        </g>
      )}

      {variant === 'rose' && (
        <g>
          <path d="M200 236c-34 0-62-26-62-58s28-58 62-58 62 26 62 58-28 58-62 58Z" fill={`url(#${rose})`} opacity="0.9" />
          <path d="M200 214c-18 0-32-14-32-32s14-32 32-32 32 14 32 32-14 32-32 32Z" fill="#3b1f4e" opacity="0.55" />
          <path d="M200 198c-8 0-15-7-15-16s7-16 15-16 15 7 15 16-7 16-15 16Z" fill={`url(#${gold})`} opacity="0.85" />
          <path d="M200 236v66M200 268c-16-14-30-16-44-10 10 16 26 24 44 22M200 288c16-14 30-16 44-10-10 16-26 24-44 22" fill="none" stroke={`url(#${gold})`} strokeWidth="1.6" opacity="0.7" />
        </g>
      )}

      {variant === 'crown' && (
        <g>
          <path d="M118 232l-14-86 52 40 44-64 44 64 52-40-14 86Z" fill={`url(#${gold})`} opacity="0.9" />
          <rect x="118" y="232" width="164" height="18" rx="5" fill={`url(#${gold})`} opacity="0.75" />
          <circle cx="118" cy="140" r="7" fill={`url(#${rose})`} />
          <circle cx="282" cy="140" r="7" fill={`url(#${rose})`} />
          <circle cx="200" cy="116" r="8" fill={`url(#${rose})`} />
          <circle cx="160" cy="242" r="4" fill="#3b1f4e" opacity="0.7" />
          <circle cx="200" cy="242" r="4" fill="#3b1f4e" opacity="0.7" />
          <circle cx="240" cy="242" r="4" fill="#3b1f4e" opacity="0.7" />
          <path d="M96 286h208" stroke={`url(#${rose})`} strokeWidth="1.2" opacity="0.5" />
        </g>
      )}

      {variant === 'tower' && (
        <g>
          <path d="M150 300V150l50-46 50 46v150Z" fill={`url(#${violet})`} opacity="0.95" />
          <path d="M150 150l50-46 50 46Z" fill={`url(#${gold})`} opacity="0.75" />
          <rect x="182" y="214" width="36" height="52" rx="18" fill={`url(#${gold})`} opacity="0.85" />
          <circle cx="200" cy="240" r="9" fill="#f2dfae" opacity="0.9" />
          <path d="M200 104v-22M186 96l-8-12M214 96l8-12" stroke={`url(#${gold})`} strokeWidth="1.6" opacity="0.8" />
          <path d="M118 300h164" stroke={`url(#${gold})`} strokeWidth="1.6" opacity="0.6" />
        </g>
      )}

      {variant === 'constellation' && (
        <g>
          <path d="M120 268 168 196 214 222 262 138 296 172" fill="none" stroke={`url(#${gold})`} strokeWidth="1.4" opacity="0.75" />
          <circle cx="120" cy="268" r="6" fill={`url(#${rose})`} />
          <circle cx="168" cy="196" r="5" fill={`url(#${gold})`} />
          <circle cx="214" cy="222" r="4" fill={`url(#${rose})`} />
          <circle cx="262" cy="138" r="7" fill={`url(#${gold})`} />
          <circle cx="296" cy="172" r="4" fill={`url(#${rose})`} />
          <circle cx="200" cy="186" r="86" fill="none" stroke={`url(#${rose})`} strokeWidth="0.9" opacity="0.3" />
        </g>
      )}

      {variant === 'chalice' && (
        <g>
          <path d="M152 128h96c0 44-22 70-48 70s-48-26-48-70Z" fill={`url(#${gold})`} opacity="0.9" />
          <path d="M200 198v54M168 270h64" stroke={`url(#${gold})`} strokeWidth="6" strokeLinecap="round" opacity="0.85" />
          <ellipse cx="200" cy="128" rx="48" ry="10" fill="#f2dfae" opacity="0.75" />
          <circle cx="200" cy="150" r="16" fill={`url(#${rose})`} opacity="0.8" />
          <path d="M200 92v-18M188 82l-6-10M212 82l6-10" stroke={`url(#${rose})`} strokeWidth="1.4" opacity="0.7" />
        </g>
      )}

      <circle cx="200" cy="196" r="176" fill="none" stroke={`url(#${gold})`} strokeWidth="0.8" opacity="0.35" />
      <path d="M24 40c8-10 20-10 28 0M348 360c8-10 20-10 28 0" fill="none" stroke={`url(#${rose})`} strokeWidth="1.1" opacity="0.45" />
    </svg>
  );
}

export default CelestialArt;
