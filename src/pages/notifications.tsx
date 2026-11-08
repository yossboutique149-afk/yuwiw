import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorLabel, mediaUrl, timeAgo, useI18n, useToast } from '../lib/core';
import { Avatar, Btn, Empty, Field, PageHead, Spinner, Tabs, formatWhen } from '../components/ui';
import {
  TONES,
  currentSubscription,
  isIos,
  isStandalone,
  permissionState,
  playTone,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../pwa';

type Notification = {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  target_type: string | null;
  target_id: string | null;
  is_read: number;
  created_at: string;
  actor_username?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
};

const CATEGORY_LABELS: Record<string, { label: string; hint: string }> = {
  all: { label: 'All', hint: 'Everything in your universe' },
  social: { label: 'Social', hint: 'Followers, friends, mentions and messages' },
  interactions: { label: 'Interactions', hint: 'Likes, reactions, comments and shares' },
  community: { label: 'Community', hint: 'Invitations, events and announcements' },
  yume: { label: 'My Yume', hint: 'Stories, favourites, galleries and F/O' },
  character: { label: 'Character World', hint: 'AI character replies and events' },
  system: { label: 'System', hint: 'Security, updates and confirmations' },
};

const CATEGORY_GLYPH: Record<string, string> = {
  social: '❥',
  interactions: '✦',
  community: '⌘',
  yume: '☾',
  character: '✧',
  system: '⚙',
};

function targetHref(n: Notification): string | null {
  if (!n.target_id) return null;
  switch (n.target_type) {
    case 'post':
      return `/post/${n.target_id}`;
    case 'user':
      return `/u/${n.target_id}`;
    case 'conversation':
      return `/messages/${n.target_id}`;
    case 'story':
      return `/stories/${n.target_id}`;
    case 'character':
      return `/characters/${n.target_id}`;
    case 'community':
      return `/communities/${n.target_id}`;
    case 'album':
      return `/gallery/${n.target_id}`;
    case 'fo':
      return `/fo/${n.target_id}`;
    case 'yumesona':
      return `/yumesonas/${n.target_id}`;
    default:
      return null;
  }
}

export function NotificationCenterPage() {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const { push } = useToast();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [category, setCategory] = useState('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (category !== 'all') query.set('category', category);
      if (onlyUnread) query.set('unread', '1');
      const res = await api<any>(`/notifications?${query.toString()}`);
      setItems(res.notifications || []);
      setUnread(res.unread || 0);
      setByCategory(res.byCategory || {});
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
      setItems([]);
    }
  }, [category, onlyUnread, locale, push]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const markRead = async (n: Notification) => {
    if (n.is_read) return;
    try {
      await api(`/notifications/${n.id}/read`, { method: 'POST' });
      setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
      setUnread((u) => Math.max(0, u - 1));
      setByCategory((prev) => ({ ...prev, [n.category]: Math.max(0, (prev[n.category] || 1) - 1) }));
    } catch {
      /* keep the row unread */
    }
  };

  const openNotification = async (n: Notification) => {
    await markRead(n);
    const href = targetHref(n);
    if (href) navigate(href);
  };

  const remove = async (n: Notification) => {
    try {
      await api(`/notifications/${n.id}`, { method: 'DELETE' });
      setItems((prev) => (prev || []).filter((x) => x.id !== n.id));
      if (!n.is_read) setUnread((u) => Math.max(0, u - 1));
    } catch {
      push('Could not delete that notification', 'error');
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setItems((prev) => (prev || []).map((x) => ({ ...x, is_read: 1 })));
      setUnread(0);
      setByCategory({});
      push('All notifications marked as read', 'success');
    } catch {
      push('Could not mark all as read', 'error');
    } finally {
      setBusy(false);
    }
  };

  const tabs = ['all', 'social', 'interactions', 'community', 'yume', 'character', 'system'].map((id) => ({
    id,
    label: CATEGORY_LABELS[id]?.label || id,
    badge: id === 'all' ? unread : byCategory[id] || 0,
  }));

  return (
    <div className="page">
      <PageHead
        eyebrow="Notification Center"
        title="Notifications"
        subtitle="Your universe has something to tell you."
        actions={
          <div className="row tight">
            <Link to="/settings" className="btn ghost">
              Settings
            </Link>
            <Btn onClick={markAll} disabled={busy || unread === 0}>
              Mark all as read
            </Btn>
          </div>
        }
      />

      <div className="notif-toolbar">
        <Tabs tabs={tabs} value={category} onChange={setCategory} />
        <label className="toggle-line">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
          <span>Unread only</span>
        </label>
      </div>

      {category !== 'all' ? (
        <p className="muted small">{CATEGORY_LABELS[category]?.hint}</p>
      ) : (
        <p className="muted small">
          {unread > 0 ? `${unread} unread` : 'You are all caught up'} · Internal notifications are stored on your account;
          outside push arrives only where your device allowed it.
        </p>
      )}

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty
          title={onlyUnread ? 'No unread notifications' : 'Nothing here yet'}
          hint="Interactions, messages and community activity will appear in this centre."
        />
      ) : (
        <ul className="notif-list">
          {items.map((n) => {
            const href = targetHref(n);
            return (
              <li key={n.id} className={`notif-row${n.is_read ? '' : ' unread'}`}>
                <button className="notif-main" onClick={() => openNotification(n)}>
                  <span className="notif-avatar">
                    {n.actor_avatar ? (
                      <img src={mediaUrl(n.actor_avatar)} alt="" />
                    ) : (
                      <span className="notif-glyph">{CATEGORY_GLYPH[n.category] || '✦'}</span>
                    )}
                  </span>
                  <span className="notif-body">
                    <span className="notif-title">
                      {n.title}
                      <small className="notif-cat">{CATEGORY_LABELS[n.category]?.label || n.category}</small>
                    </span>
                    {n.message ? <span className="notif-msg">{n.message}</span> : null}
                    <span className="notif-time">
                      {timeAgo(n.created_at, locale)} · {formatWhen(n.created_at)}
                      {href ? ' · open' : ''}
                    </span>
                  </span>
                </button>
                <span className="notif-actions">
                  {!n.is_read ? (
                    <button className="icon-btn" title="Mark as read" onClick={() => markRead(n)}>
                      ✓
                    </button>
                  ) : null}
                  <button className="icon-btn" title="Delete" onClick={() => remove(n)}>
                    ×
                  </button>
                </span>
                {!n.is_read ? <span className="unread-dot" aria-label="Unread" /> : null}
              </li>
            );
          })}
        </ul>
      )}

      <section className="panel muted-panel">
        <h3>How YumEra notifies you</h3>
        <div className="grid-3">
          <div>
            <strong>Internal</strong>
            <p className="small muted">Stored in the database and shown here and in the bell counter.</p>
          </div>
          <div>
            <strong>Web Push</strong>
            <p className="small muted">
              Sent by the server to subscribed devices, even with YumEra closed, when the browser and OS allow it.
            </p>
          </div>
          <div>
            <strong>Email</strong>
            <p className="small muted">Requires a configured mail provider. Never shown as active when it is not.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------- settings -------------------------------- */

type Settings = {
  sound: string;
  sound_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  muted_until: string | null;
};

export function SettingsPage() {
  const { locale } = useI18n();
  const { push } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushState, setPushState] = useState<{
    permission: string;
    subscribed: boolean;
    supported: boolean;
    vapid: boolean;
  }>({ permission: 'default', subscribed: false, supported: false, vapid: false });
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api<any>('/notification-settings');
      setSettings(res.settings);
      setPrefs(res.preferences || {});
      setCategories(res.categories || []);
      setDevices(res.devices || []);
      setEmailConfigured(Boolean(res.email_configured));
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setLoading(false);
    }
  }, [locale, push]);

  const loadPush = useCallback(async () => {
    const supported = pushSupported();
    let subscribed = false;
    let vapid = false;
    try {
      const sub = await currentSubscription();
      subscribed = Boolean(sub);
    } catch {
      subscribed = false;
    }
    try {
      const res = await api<any>('/push/status');
      vapid = Boolean(res.vapid_configured);
      if (res.devices) setDevices(res.devices);
    } catch {
      vapid = false;
    }
    setPushState({ permission: permissionState(), subscribed, supported, vapid });
  }, []);

  useEffect(() => {
    loadSettings();
    loadPush();
  }, [loadSettings, loadPush]);

  const save = async (patch: Record<string, unknown>, quiet = true) => {
    setSaving(true);
    try {
      await api('/notification-settings', { method: 'PATCH', body: patch });
      if (!quiet) push('Notification settings saved', 'success');
    } catch {
      push('Could not save your settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const update = (changes: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...changes } : prev));
    save(changes);
  };

  const toggleCategory = (cat: string) => {
    const next = { ...prefs, [cat]: !prefs[cat] };
    setPrefs(next);
    save({ preferences: { [cat]: next[cat] } });
  };

  const enablePush = async () => {
    setPushMsg(null);
    const res = await subscribeToPush();
    if (!res.ok) {
      setPushMsg(
        res.reason === 'permission_denied'
          ? 'Permission was blocked. Allow notifications for YumEra in your browser or system settings, then try again.'
          : res.reason === 'unsupported'
            ? 'This browser does not support Web Push. On iPhone or iPad, install YumEra to the Home Screen first (iOS 16.4+).'
            : res.reason === 'vapid_missing'
              ? 'The server has no VAPID keys configured, so outside notifications cannot be sent yet.'
              : 'Push could not be enabled on this device.'
      );
      await loadPush();
      return;
    }
    await save({ push_enabled: true });
    await loadPush();
    setPushMsg('This device is now subscribed to YumEra outside notifications.');
  };

  const disablePush = async () => {
    setPushMsg(null);
    await unsubscribeFromPush();
    await loadPush();
    setPushMsg('This device will no longer receive YumEra push notifications.');
  };

  const sendTest = async () => {
    setPushMsg(null);
    try {
      const res = await api<any>('/push/test', { method: 'POST' });
      setPushMsg(
        res.sent
          ? `Test sent to ${res.sent} device(s)${res.failed ? `, ${res.failed} failed` : ''}.`
          : 'No subscribed device received the test. Enable push on this device first.'
      );
    } catch {
      setPushMsg('The test notification could not be sent.');
    }
  };

  const preview = (id: string) => {
    if (id === 'silent') {
      setPushMsg('Silent mode selected: YumEra will not request sound for its notifications.');
      return;
    }
    if (id === 'default') {
      setPushMsg('The device default sound is controlled by your system; browsers cannot preview it.');
      return;
    }
    playTone(id);
  };

  const toneList = useMemo(() => {
    const extra = [
      { id: 'default', name: 'Default device sound', description: 'Uses the sound your system assigns.' },
      { id: 'silent', name: 'Silent notifications', description: 'No sound requested.' },
    ];
    const known = TONES.map((tone) => ({ id: tone.id, name: tone.name, description: tone.description }));
    const merged = [...known];
    for (const e of extra) if (!merged.some((m) => m.id === e.id)) merged.push(e);
    return merged;
  }, []);

  if (loading || !settings) return <Spinner />;

  const iosGuide = isIos() && !isStandalone();

  return (
    <div className="page">
      <PageHead
        eyebrow="Notification Settings"
        title="Notification Settings"
        subtitle="Decide what reaches you inside YumEra, on your device, and by email."
        actions={
          <Link to="/notifications" className="btn ghost">
            Notification centre
          </Link>
        }
      />

      <section className="panel">
        <h3>Outside notifications</h3>
        <p className="small muted">
          Web Push is sent by the YumEra server to this device. It can arrive while the app is closed, but only if your
          browser, operating system and permissions allow it.
        </p>
        <div className="push-status">
          <span className={`pill ${pushState.subscribed ? 'ok' : ''}`}>
            {pushState.subscribed ? 'This device is subscribed' : 'This device is not subscribed'}
          </span>
          <span className="pill">Permission: {pushState.permission}</span>
          <span className={`pill ${pushState.vapid ? 'ok' : 'warn'}`}>
            {pushState.vapid ? 'Server push keys ready' : 'Server push keys missing'}
          </span>
          <span className="pill">{devices.length} device(s)</span>
        </div>

        {!pushState.supported ? (
          <p className="form-note small">
            This browser does not expose the Web Push API. You can still use every internal notification. On iPhone and
            iPad, Web Push requires iOS/iPadOS 16.4 or later and YumEra added to the Home Screen.
          </p>
        ) : null}

        <div className="row tight wrap">
          <Btn onClick={enablePush} disabled={!pushState.supported}>
            Enable push on this device
          </Btn>
          <Btn variant="ghost" onClick={disablePush} disabled={!pushState.subscribed}>
            Disable on this device
          </Btn>
          <Btn variant="ghost" onClick={sendTest} disabled={!pushState.subscribed}>
            Send test notification
          </Btn>
        </div>
        {pushMsg ? <p className="form-note small">{pushMsg}</p> : null}

        {devices.length ? (
          <div className="device-list">
            {devices.map((d) => (
              <div key={d.id} className="device-row">
                <span className="small">{String(d.user_agent || 'Unknown device').slice(0, 90)}</span>
                <small className="muted">{formatWhen(d.last_seen || d.created_at)}</small>
              </div>
            ))}
          </div>
        ) : null}

        <label className="toggle-line">
          <input
            type="checkbox"
            checked={settings.push_enabled}
            onChange={(e) => update({ push_enabled: e.target.checked })}
          />
          <span>Allow YumEra to send push notifications to my subscribed devices</span>
        </label>
      </section>

      <section className="panel">
        <h3>Install YumEra on your iPhone</h3>
        <ol className="guide">
          <li>Open YumEra in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Choose “Add to Home Screen”.</li>
          <li>Confirm the installation.</li>
          <li>Open YumEra from its new icon.</li>
          <li>Return to Notification Settings.</li>
          <li>Enable Push Notifications.</li>
          <li>Accept the system permission when it appears.</li>
        </ol>
        <p className="small muted">
          iOS/iPadOS 16.4 or later is required for Web Push in web apps added to the Home Screen. Notifications are only
          marked active after you grant the permission — YumEra never assumes it.
        </p>
        {iosGuide ? (
          <p className="form-note small">
            You are on iOS Safari and YumEra is not installed yet. Add it to the Home Screen before enabling push.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h3>Notification sound</h3>
        <p className="small muted">
          Browsers and operating systems control the sound of push notifications. YumEra Signature Tone is used where the
          platform supports a custom sound; on many platforms the system sound is used instead. Sound never plays from
          the page in the background.
        </p>
        <div className="tone-list">
          {toneList.map((tone) => (
            <div key={tone.id} className={`tone-row${settings.sound === tone.id ? ' on' : ''}`}>
              <button className="tone-pick" onClick={() => update({ sound: tone.id })}>
                <strong>{tone.name}</strong>
                <small className="muted block">{tone.description}</small>
              </button>
              <Btn variant="ghost" onClick={() => preview(tone.id)}>
                Play preview
              </Btn>
            </div>
          ))}
        </div>
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={settings.sound_enabled}
            onChange={(e) => update({ sound_enabled: e.target.checked })}
          />
          <span>Play a sound with notifications</span>
        </label>
      </section>

      <section className="panel">
        <h3>Categories</h3>
        <p className="small muted">These choices are stored on your account and persist after signing out.</p>
        <div className="pref-grid">
          {(categories.length ? categories : Object.keys(prefs)).map((cat) => (
            <label key={cat} className="toggle-line">
              <input type="checkbox" checked={prefs[cat] !== false} onChange={() => toggleCategory(cat)} />
              <span>{CATEGORY_LABELS[cat]?.label || cat}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Quiet hours and email</h3>
        <div className="grid-2">
          <Field label="Quiet hours start">
            <input
              type="time"
              value={settings.quiet_start || ''}
              onChange={(e) => update({ quiet_start: e.target.value })}
            />
          </Field>
          <Field label="Quiet hours end">
            <input type="time" value={settings.quiet_end || ''} onChange={(e) => update({ quiet_end: e.target.value })} />
          </Field>
          <Field label="Mute until">
            <input
              type="datetime-local"
              value={settings.muted_until ? settings.muted_until.slice(0, 16) : ''}
              onChange={(e) => update({ muted_until: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            />
          </Field>
          <div className="stack tight">
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={settings.email_enabled}
                onChange={(e) => update({ email_enabled: e.target.checked })}
              />
              <span>Email notifications</span>
            </label>
            <p className="small muted">
              {emailConfigured
                ? 'A mail provider is configured on the server.'
                : 'No mail provider is configured (RESEND_API_KEY or SMTP_URL). Email will not be sent until one is added.'}
            </p>
          </div>
        </div>
      </section>

      <div className="row end">
        <span className="muted small">{saving ? 'Saving…' : 'Changes save automatically'}</span>
      </div>
    </div>
  );
}
