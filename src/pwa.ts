/* PWA + Web Push helpers for YumEra */

export type PushStatus = {
  subscribed: boolean;
  devices: { id: string; user_agent: string | null; created_at: string; last_seen: string }[];
  push_enabled: boolean;
  vapid_configured: boolean;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function registerPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const isSecure = window.isSecureContext;
  if (!isSecure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Registers the service worker and subscribes this device to Web Push. */
export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const keyRes = await fetch('/api/push/public-key');
  if (!keyRes.ok) return { ok: false, reason: 'vapid_unavailable' };
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) return { ok: false, reason: 'vapid_unavailable' };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const token = localStorage.getItem('yumera.token');
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) return { ok: false, reason: 'server_error' };
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const sub = await currentSubscription();
  if (!sub) return { ok: true };
  const token = localStorage.getItem('yumera.token');
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
  return { ok: true };
}

export const TONES: { id: string; name: string; file: string; description: string }[] = [
  {
    id: 'signature',
    name: 'YumEra Signature Tone',
    file: '/assets/yumera-signature-tone.wav',
    description: 'Crystal bell, soft synth. The official YumEra chime.',
  },
  {
    id: 'moonlight',
    name: 'Moonlight Chime',
    file: '/assets/tone-moonlight.wav',
    description: 'Warm lunar bell with a long, quiet tail.',
  },
  {
    id: 'starlight',
    name: 'Starlight Sparkle',
    file: '/assets/tone-starlight.wav',
    description: 'Bright, quick sparkle for mentions and reactions.',
  },
  {
    id: 'celestial',
    name: 'Celestial Harp',
    file: '/assets/tone-celestial.wav',
    description: 'Deep harp-like tone for messages.',
  },
];

let previewAudio: HTMLAudioElement | null = null;

/** Plays a tone in-app, only on an explicit user action. */
export function playTone(id: string) {
  const tone = TONES.find((t) => t.id === id) || TONES[0];
  try {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    }
    previewAudio = new Audio(tone.file);
    previewAudio.volume = 0.9;
    void previewAudio.play().catch(() => undefined);
  } catch {
    /* autoplay blocked */
  }
}
