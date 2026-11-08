import { CelestialArt } from './art';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  api,
  errorLabel,
  formatDateTime,
  initials,
  mediaUrl,
  timeAgo,
  uploadFiles,
  useAuth,
  useI18n,
  useToast,
} from '../lib/core';

/* ---------------------------------- icons --------------------------------- */

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m3.5 6.5-2 6-6 2 2-6z',
  chat: 'M21 12a8 8 0 0 1-8 8H8l-4 3v-6a8 8 0 1 1 17-5z',
  bell: 'M12 2a6 6 0 0 0-6 6v4l-2 4h16l-2-4V8a6 6 0 0 0-6-6m0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  heart: 'M12 21s-8-4.6-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 16.4 12 21 12 21',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4zm16 0h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4z',
  image: 'M3 5h18v14H3zm0 11 5-5 4 4 3-3 6 6',
  calendar: 'M4 5h16v16H4zm4-3v4m8-4v4M4 11h16',
  lock: 'M6 11h12v9H6zm3 0V8a3 3 0 0 1 6 0v3',
  users: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m10 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 21c0-3.3 2.7-6 6-6s6 2.7 6 6m2-6c3 0 6 2.7 6 6',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zm6 9 .9 2.3 2.3.9-2.3.9L18 18.4l-.9-2.3-2.3-.9 2.3-.9z',
  brush: 'M4 20c3 0 4-1.5 4-4l7-7 4 4-7 7c-2.5 0-4 1-4 1zm10-13 3-3 4 4-3 3z',
  music: 'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  film: 'M3 4h18v16H3zm0 4h18M3 16h18M7 4v4m10-4v4M7 16v4m10-4v4',
  game: 'M7 8h10a5 5 0 0 1 5 5 4 4 0 0 1-7 3H9a4 4 0 0 1-7-3 5 5 0 0 1 5-5m0 3v4m-2-2h4m6 0h.01M18 11h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-8 9a8 8 0 0 1 16 0',
  cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6m9 3-2 1 1 2-2 2-2-1-1 2h-4l-1-2-2 1-2-2 1-2-2-1v-2l2-1-1-2 2-2 2 1 1-2h4l1 2 2-1 2 2-1 2 2 1z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 5 5',
  logout: 'M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  download: 'M12 3v12m-5-5 5 5 5-5M4 21h16',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14',
  check: 'm4 12 5 5L20 6',
  send: 'M3 11 21 3l-8 18-2-7z',
};

export function Icon({ name, size = 20, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.star} />
    </svg>
  );
}

/* -------------------------------- primitives ------------------------------- */

function artHue(seed?: string | null) {
  const s = seed || 'yumera';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 250 + (h % 90);
}

export function Avatar({
  src,
  name,
  size = 40,
  ring = false,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const hue = artHue(name);
  return (
    <span
      className={`avatar${ring ? ' avatar-ring' : ''}${src ? '' : ' avatar-art'}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.36),
        ...(src
          ? {}
          : {
              backgroundImage: `radial-gradient(circle at 32% 24%, hsla(${hue}, 64%, 70%, 0.55), transparent 62%), linear-gradient(150deg, hsl(${hue} 46% 27%), #0d0a16 78%)`,
            }),
      }}
    >
      {src ? (
        <img src={mediaUrl(src)} alt={name || 'avatar'} loading="lazy" />
      ) : (
        <span className="avatar-initials">{initials(name)}</span>
      )}
    </span>
  );
}

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button type={type} className={`btn btn-${variant} btn-${size}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <em>*</em> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Empty({ title, hint, action }: { title?: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <CelestialArt variant="galaxy" />
      </div>
      <p>{title || 'Nothing here yet.'}</p>
      {hint ? <small>{hint}</small> : null}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <span>{label || 'Loading…'}</span>
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          className={`tab${value === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- media upload ------------------------------ */

export function MediaUploader({
  urls,
  onChange,
  accept = 'image/*,video/*',
  max = 6,
  label,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  accept?: string;
  max?: number;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const uploaded = await uploadFiles(files);
      onChange([...urls, ...uploaded].slice(0, max));
    } catch {
      push('Upload failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="uploader">
      <div className="uploader-grid">
        {urls.map((url) => (
          <div key={url} className="uploader-item">
            {/\.(mp4|webm)$/i.test(url) ? (
              <video src={mediaUrl(url)} muted playsInline />
            ) : (
              <img src={mediaUrl(url)} alt="" />
            )}
            <button
              type="button"
              className="uploader-remove"
              onClick={() => onChange(urls.filter((u) => u !== url))}
              aria-label="remove"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {urls.length < max ? (
          <button type="button" className="uploader-add" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Icon name="plus" />
            <span>{busy ? '…' : label || 'Upload'}</span>
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  );
}

/* --------------------------------- layout --------------------------------- */

const NAV_SOCIAL = [
  { to: '/', label: 'nav.home', icon: 'home', end: true },
  { to: '/explore', label: 'nav.explore', icon: 'compass' },
  { to: '/messages', label: 'nav.messages', icon: 'chat' },
  { to: '/notifications', label: 'nav.notifications', icon: 'bell' },
];

const NAV_UNIVERSE = [
  { to: '/yumesonas', label: 'nav.yumesonas', icon: 'star' },
  { to: '/fo', label: 'nav.fo', icon: 'heart' },
  { to: '/lore', label: 'nav.lore', icon: 'book' },
  { to: '/stories', label: 'nav.stories', icon: 'book' },
  { to: '/gallery', label: 'nav.gallery', icon: 'image' },
  { to: '/memories', label: 'nav.memories', icon: 'calendar' },
  { to: '/diary', label: 'nav.diary', icon: 'lock' },
  { to: '/communities', label: 'nav.communities', icon: 'users' },
  { to: '/characters', label: 'nav.characters', icon: 'sparkles' },
];

const NAV_STUDIOS = [
  { to: '/portrait', label: 'nav.portrait', icon: 'brush' },
  { to: '/music', label: 'nav.music', icon: 'music' },
  { to: '/video', label: 'nav.video', icon: 'film' },
  { to: '/games', label: 'nav.games', icon: 'game' },
];

function NavGroup({
  title,
  items,
  badges,
}: {
  title: string;
  items: { to: string; label: string; icon: string; end?: boolean }[];
  badges: Record<string, number>;
}) {
  const { t } = useI18n();
  return (
    <div className="nav-group">
      <p className="nav-group-title">{title}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <Icon name={item.icon} />
          <span>{t(item.label)}</span>
          {badges[item.to] ? <em className="nav-badge">{badges[item.to]}</em> : null}
        </NavLink>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, counts, logout, refresh } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setSheet(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      refresh().catch(() => undefined);
    }, 45000);
    return () => clearInterval(id);
  }, [user, refresh]);

  const badges: Record<string, number> = {
    '/notifications': counts?.unreadNotifications ?? 0,
    '/messages': counts?.unreadMessages ?? 0,
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    navigate(`/explore?q=${encodeURIComponent(search.trim())}`);
    setSearch('');
  };

  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <header className="mobile-top">
        <Link to="/" className="brand brand-sm">
          <span className="brand-mark">✦</span>
          <span className="brand-name">YumEra</span>
        </Link>
        <div className="mobile-top-actions">
          <Link to="/notifications" className="icon-btn" aria-label={t('nav.notifications')}>
            <Icon name="bell" />
            {badges['/notifications'] ? <em className="dot" /> : null}
          </Link>
          <Link to={user ? `/u/${user.username}` : '/auth'} className="icon-btn" aria-label={t('nav.profile')}>
            <Avatar src={user?.avatar_url} name={user?.display_name || user?.username} size={30} />
          </Link>
        </div>
      </header>

      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">✦</span>
          <span>
            <span className="brand-name">YUMERA</span>
            <span className="brand-sub">Eternal Universe</span>
          </span>
        </Link>

        <form className="side-search" onSubmit={submitSearch} role="search">
          <Icon name="search" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            aria-label={t('common.search')}
          />
        </form>

        <nav className="side-nav">
          <NavGroup title={t('nav.social')} items={NAV_SOCIAL} badges={badges} />
          <NavGroup title={t('nav.universe')} items={NAV_UNIVERSE} badges={badges} />
          <NavGroup title={t('nav.studio')} items={NAV_STUDIOS} badges={badges} />
        </nav>

        <div className="side-foot">
          <Link to={user ? `/u/${user.username}` : '/auth'} className="side-user">
            <Avatar src={user?.avatar_url} name={user?.display_name || user?.username} size={36} ring />
            <span>
              <strong>{user?.display_name || user?.username || t('nav.login')}</strong>
              <small>@{user?.username || 'guest'}</small>
            </span>
          </Link>
          <div className="side-foot-actions">
            <Link to="/settings" className="icon-btn" aria-label={t('nav.settings')}>
              <Icon name="cog" />
            </Link>
            {user ? (
              <button
                className="icon-btn"
                aria-label={t('nav.logout')}
                onClick={async () => {
                  await logout();
                  navigate('/auth');
                }}
              >
                <Icon name="logout" />
              </button>
            ) : (
              <Link to="/auth" className="btn btn-primary btn-sm">
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </aside>

      <main className="app-main">{children}</main>

      <nav className="bottom-nav" aria-label="main">
        <NavLink to="/" end className={({ isActive }) => `bottom-item${isActive ? ' active' : ''}`}>
          <Icon name="home" />
          <span>{t('nav.home')}</span>
        </NavLink>
        <NavLink to="/explore" className={({ isActive }) => `bottom-item${isActive ? ' active' : ''}`}>
          <Icon name="compass" />
          <span>{t('nav.explore')}</span>
        </NavLink>
        <Link to="/create" className="bottom-create" aria-label={t('nav.create')}>
          <Icon name="plus" size={24} />
        </Link>
        <NavLink to="/messages" className={({ isActive }) => `bottom-item${isActive ? ' active' : ''}`}>
          <Icon name="chat" />
          <span>{t('nav.messages')}</span>
          {badges['/messages'] ? <em className="dot" /> : null}
        </NavLink>
        <button className="bottom-item" onClick={() => setSheet(true)} aria-label={t('nav.more')}>
          <Icon name="menu" />
          <span>{t('nav.more')}</span>
        </button>
      </nav>

      {sheet ? (
        <div className="sheet-backdrop" onClick={() => setSheet(false)} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-locales">
              {(['es', 'en', 'fr', 'ja'] as const).map((code) => (
                <button
                  key={code}
                  className={`chip${locale === code ? ' active' : ''}`}
                  onClick={() => setLocale(code)}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="sheet-grid">
              {[...NAV_UNIVERSE, ...NAV_STUDIOS, { to: '/settings', label: 'nav.settings', icon: 'cog' }].map((item) => (
                <NavLink key={item.to} to={item.to} className="sheet-item">
                  <Icon name={item.icon} />
                  <span>{t(item.label)}</span>
                </NavLink>
              ))}
            </div>
            {user ? (
              <Btn variant="ghost" onClick={async () => { await logout(); navigate('/auth'); }}>
                {t('nav.logout')}
              </Btn>
            ) : (
              <Btn onClick={() => navigate('/auth')}>{t('nav.login')}</Btn>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate('/auth', { replace: true });
  }, [user, loading, navigate]);
  if (loading) return <Spinner />;
  if (!user) return null;
  return <>{children}</>;
}

/* ---------------------------------- posts --------------------------------- */

export type Post = {
  id: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null; role: string };
  content: string;
  media: string[];
  visibility: string;
  community_id: string | null;
  created_at: string;
  likes: number;
  comments: number;
  shares: number;
  tags: string[];
  liked: boolean;
  shared_post: null | {
    id: string;
    content: string;
    media: string[];
    created_at: string;
    author: { id: string; username: string; display_name: string; avatar_url: string | null; role: string };
  };
};

const REACTIONS = [
  { id: 'love', glyph: '♥' },
  { id: 'like', glyph: '✦' },
  { id: 'wow', glyph: '✧' },
  { id: 'cry', glyph: '❥' },
  { id: 'star', glyph: '☾' },
];

export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, i) => {
        if (/^@[a-zA-Z0-9_.]{2,30}$/.test(part)) {
          return (
            <Link key={i} to={`/u/${part.slice(1)}`} className="mention">
              {part}
            </Link>
          );
        }
        if (/^#[\p{L}\p{N}_]{1,40}$/u.test(part)) {
          return (
            <Link key={i} to={`/explore?q=${encodeURIComponent(part)}`} className="hashtag">
              {part}
            </Link>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="mention">
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function MediaGrid({ media }: { media: string[] }) {
  if (!media.length) return null;
  return (
    <div className={`media-grid media-${Math.min(media.length, 4)}`}>
      {media.map((url) =>
        /\.(mp4|webm)$/i.test(url) ? (
          <video key={url} src={mediaUrl(url)} controls playsInline preload="metadata" />
        ) : (
          <a key={url} href={mediaUrl(url)} target="_blank" rel="noreferrer noopener">
            <img src={mediaUrl(url)} alt="" loading="lazy" />
          </a>
        )
      )}
    </div>
  );
}

export function PostCard({
  post,
  onChanged,
  compact = false,
}: {
  post: Post;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const { user, refresh } = useAuth();
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [openComments, setOpenComments] = useState(false);
  const [comments, setComments] = useState<any[] | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const loadComments = useCallback(async () => {
    const res = await api<{ comments: any[] }>(`/posts/${post.id}/comments`);
    setComments(res.comments);
  }, [post.id]);

  useEffect(() => {
    if (openComments) loadComments().catch(() => setComments([]));
  }, [openComments, loadComments]);

  const react = async (reaction: string) => {
    if (!user) return navigate('/auth');
    try {
      if (post.liked) {
        await api(`/posts/${post.id}/react`, { method: 'DELETE' });
      } else {
        await api(`/posts/${post.id}/react`, { method: 'POST', body: { reaction } });
      }
      onChanged?.();
    } catch {
      push('Error', 'error');
    }
  };

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !user) return;
    setBusy(true);
    try {
      await api(`/posts/${post.id}/comments`, {
        method: 'POST',
        body: { content: draft.trim(), parent_id: replyTo },
      });
      setDraft('');
      setReplyTo(null);
      await loadComments();
      onChanged?.();
      refresh().catch(() => undefined);
    } catch {
      push('Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!user) return navigate('/auth');
    try {
      await api(`/posts/${post.id}/share`, { method: 'POST', body: {} });
      push('Shared to your universe', 'success');
      onChanged?.();
    } catch {
      const link = `${location.origin}/post/${post.id}`;
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      push('Link copied', 'info');
    }
  };

  const remove = async () => {
    if (!confirm(t('common.confirmDelete'))) return;
    await api(`/posts/${post.id}`, { method: 'DELETE' });
    onChanged?.();
  };

  const report = async () => {
    await api('/reports', { method: 'POST', body: { target_type: 'post', target_id: post.id, reason: 'user_report' } });
    push('Report sent to moderation', 'success');
  };

  const body = (
    <>
      {post.content ? (
        <p className="post-text">
          <RichText text={post.content} />
        </p>
      ) : null}
      <MediaGrid media={post.media} />
      {post.shared_post ? (
        <div className="quoted-post">
          <div className="post-head">
            <Avatar src={post.shared_post.author.avatar_url} name={post.shared_post.author.display_name} size={28} />
            <div>
              <strong>{post.shared_post.author.display_name}</strong>
              <small>@{post.shared_post.author.username}</small>
            </div>
          </div>
          <p className="post-text">
            <RichText text={post.shared_post.content} />
          </p>
          <MediaGrid media={post.shared_post.media} />
        </div>
      ) : null}
    </>
  );

  return (
    <article className={`post-card${compact ? ' compact' : ''}`}>
      <header className="post-head">
        <Link to={`/u/${post.author.username}`}>
          <Avatar src={post.author.avatar_url} name={post.author.display_name} size={42} ring />
        </Link>
        <div className="post-head-text">
          <Link to={`/u/${post.author.username}`} className="post-author">
            {post.author.display_name}
            {post.author.role === 'admin' ? <span className="badge-official">✦</span> : null}
          </Link>
          <small>
            @{post.author.username} · {timeAgo(post.created_at, locale)}
            {post.visibility !== 'public' ? ` · ${post.visibility}` : ''}
          </small>
        </div>
        {user?.id === post.author.id ? (
          <button className="icon-btn" onClick={remove} aria-label={t('common.delete')}>
            <Icon name="trash" size={16} />
          </button>
        ) : (
          <button className="icon-btn" onClick={report} aria-label={t('common.report')}>
            <Icon name="more" size={16} />
          </button>
        )}
      </header>

      <div className="post-body">{body}</div>

      <footer className="post-actions">
        <button className={`action${post.liked ? ' liked' : ''}`} onClick={() => react('love')}>
          <Icon name="heart" size={18} />
          <span>{post.likes}</span>
        </button>
        <button className="action" onClick={() => setOpenComments((v) => !v)}>
          <Icon name="chat" size={18} />
          <span>{post.comments}</span>
        </button>
        <button className="action" onClick={share}>
          <Icon name="sparkles" size={18} />
          <span>{post.shares}</span>
        </button>
        <div className="reactions">
          {REACTIONS.map((r) => (
            <button
              key={r.id}
              className="reaction"
              title={r.id}
              onClick={async () => {
                if (!user) return navigate('/auth');
                await api(`/posts/${post.id}/react`, { method: 'POST', body: { reaction: r.id } });
                onChanged?.();
              }}
            >
              {r.glyph}
            </button>
          ))}
        </div>
      </footer>

      {openComments ? (
        <div className="comments">
          {comments === null ? (
            <Spinner label={t('common.loading')} />
          ) : comments.length === 0 ? (
            <p className="muted small">{t('common.empty')}</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className={`comment${c.parent_id ? ' reply' : ''}`}>
                <Avatar src={c.author.avatar_url} name={c.author.display_name} size={30} />
                <div>
                  <Link to={`/u/${c.author.username}`} className="post-author">
                    {c.author.display_name}
                  </Link>
                  <small> · {timeAgo(c.created_at, locale)}</small>
                  <p>
                    <RichText text={c.content} />
                  </p>
                  <button className="link-btn" onClick={() => setReplyTo(c.id)}>
                    {t('common.reply')}
                  </button>
                </div>
              </div>
            ))
          )}
          {user ? (
            <form className="comment-form" onSubmit={sendComment}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={replyTo ? t('common.reply') : t('common.comments')}
                maxLength={2000}
              />
              <Btn type="submit" size="sm" disabled={busy || !draft.trim()}>
                <Icon name="send" size={16} />
              </Btn>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function useErrorText() {
  const { locale } = useI18n();
  return (err: unknown) => errorLabel(err instanceof Error ? err.message : 'error', locale);
}

export function formatWhen(iso: string) {
  const { locale } = useI18n();
  return formatDateTime(iso, locale);
}
