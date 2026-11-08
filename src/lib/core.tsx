import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/* ---------------------------------- API ----------------------------------- */

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
};

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, form, signal } = options;
  const init: RequestInit = {
    method,
    credentials: 'include',
    signal,
    headers: {},
  };
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const code = data?.error || `http_${res.status}`;
    throw new ApiError(code, res.status, data?.message || code);
  }
  return data as T;
}

export async function uploadFiles(files: FileList | File[]): Promise<string[]> {
  const form = new FormData();
  for (const file of Array.from(files)) form.append('files', file);
  const res = await api<{ urls: string[] }>('/upload', { method: 'POST', form });
  return res.urls;
}

export function mediaUrl(url?: string | null) {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

/* --------------------------------- helpers -------------------------------- */

export function initials(name?: string | null) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function timeAgo(iso?: string | null, locale = 'en') {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diff = Date.now() - date.getTime();
  const sec = Math.round(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hours = Math.round(min / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.round(months / 12), 'year');
}

export function formatDate(iso?: string | null, locale = 'en') {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(iso?: string | null, locale = 'en') {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => {
        if (alive.current) setData(value);
      })
      .catch((err: unknown) => {
        if (alive.current) setError(err instanceof ApiError ? err.code : 'error');
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1), setData };
}

/* ----------------------------------- i18n --------------------------------- */

export const LOCALES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

type Dict = Record<string, string>;

const es: Dict = {
  'app.name': 'YumEra',
  'app.tagline': 'Un universo social para quienes aman mundos ficticios.',
  'nav.home': 'Inicio',
  'nav.explore': 'Explorar',
  'nav.messages': 'Mensajes',
  'nav.notifications': 'Notificaciones',
  'nav.yumesonas': 'Yumesonas',
  'nav.fo': 'F/O Registry',
  'nav.lore': 'Lore',
  'nav.stories': 'Historias',
  'nav.gallery': 'Galería',
  'nav.memories': 'Recuerdos',
  'nav.diary': 'Diario',
  'nav.communities': 'Comunidades',
  'nav.characters': 'Character World',
  'nav.portrait': 'Portrait Studio',
  'nav.music': 'Music Studio',
  'nav.video': 'Video Studio',
  'nav.games': 'Juegos',
  'nav.profile': 'Mi perfil',
  'nav.settings': 'Ajustes',
  'nav.create': 'Crear',
  'nav.logout': 'Cerrar sesión',
  'nav.login': 'Entrar',
  'nav.register': 'Crear cuenta',
  'nav.more': 'Más',
  'nav.universe': 'Tu universo',
  'nav.studio': 'Estudios',
  'nav.social': 'Social',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'common.create': 'Crear',
  'common.close': 'Cerrar',
  'common.search': 'Buscar',
  'common.loading': 'Cargando…',
  'common.empty': 'Todavía no hay nada aquí.',
  'common.confirmDelete': '¿Eliminar de forma permanente?',
  'common.duplicate': 'Duplicar',
  'common.public': 'Público',
  'common.private': 'Privado',
  'common.followers': 'Seguidores',
  'common.follow': 'Seguir',
  'common.following': 'Siguiendo',
  'common.unfollow': 'Dejar de seguir',
  'common.message': 'Mensaje',
  'common.share': 'Compartir',
  'common.comments': 'Comentarios',
  'common.reply': 'Responder',
  'common.send': 'Enviar',
  'common.upload': 'Subir',
  'common.name': 'Nombre',
  'common.title': 'Título',
  'common.description': 'Descripción',
  'common.tags': 'Etiquetas',
  'common.visibility': 'Visibilidad',
  'common.optional': 'opcional',
  'common.required': 'obligatorio',
  'common.all': 'Todo',
  'common.viewAll': 'Ver todo',
  'common.report': 'Denunciar',
  'common.block': 'Bloquear',
  'common.unblock': 'Desbloquear',
  'common.download': 'Descargar',
  'common.preview': 'Vista previa',
  'auth.welcome': 'Bienvenida de vuelta al universo',
  'auth.join': 'Crea tu universo',
  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.username': 'Usuario',
  'auth.displayName': 'Nombre visible',
  'auth.forgot': '¿Olvidaste tu contraseña?',
  'auth.reset': 'Restablecer contraseña',
  'auth.haveAccount': '¿Ya tienes cuenta?',
  'auth.noAccount': '¿Aún no tienes cuenta?',
  'auth.signIn': 'Iniciar sesión',
  'auth.signUp': 'Registrarme',
  'feed.title': 'Tu feed',
  'feed.discover': 'Descubrir',
  'feed.following': 'Siguiendo',
  'feed.placeholder': '¿Qué está pasando en tu universo?',
  'feed.publish': 'Publicar',
  'feed.recommended': 'Recomendado para ti',
  'explore.title': 'Explorar',
  'explore.subtitle': 'Encuentra personas, personajes e historias.',
  'explore.trending': 'Tendencias',
  'explore.creators': 'Creadoras',
  'notif.title': 'Notificaciones',
  'notif.subtitle': 'Tu universo tiene algo que contarte.',
  'notif.markAll': 'Marcar todo como leído',
  'notif.empty': 'No hay notificaciones en esta categoría.',
  'notif.settings': 'Preferencias',
  'notif.push': 'Notificaciones push',
  'notif.sound': 'Sonido de notificación',
  'notif.preview': 'Escuchar',
  'notif.quiet': 'Horario de descanso',
  'settings.title': 'Ajustes',
  'settings.account': 'Cuenta',
  'settings.privacy': 'Privacidad',
  'settings.notifications': 'Notificaciones',
  'settings.language': 'Idioma',
  'settings.install': 'Instalar en iPhone',
  'portrait.title': 'YumEra Portrait Studio',
  'portrait.version': 'YumEra V4',
  'portrait.subtitle': 'Crea retratos que cuenten tu historia.',
  'portrait.export': 'Exportar',
  'portrait.library': 'Mi biblioteca',
  'music.title': 'Music Studio',
  'music.library': 'Biblioteca original',
  'music.playlists': 'Playlists',
  'music.aiPlaylist': 'Playlist con IA',
  'music.spotify': 'Buscar en Spotify',
  'video.title': 'Video Studio',
  'games.title': 'Juegos',
  'games.score': 'Puntuación',
  'games.play': 'Jugar',
};

const en: Dict = {
  'app.name': 'YumEra',
  'app.tagline': 'A social universe for people who love fictional worlds.',
  'nav.home': 'Home',
  'nav.explore': 'Explore',
  'nav.messages': 'Messages',
  'nav.notifications': 'Notifications',
  'nav.yumesonas': 'Yumesonas',
  'nav.fo': 'F/O Registry',
  'nav.lore': 'Lore',
  'nav.stories': 'Stories',
  'nav.gallery': 'Gallery',
  'nav.memories': 'Memories',
  'nav.diary': 'Diary',
  'nav.communities': 'Communities',
  'nav.characters': 'Character World',
  'nav.portrait': 'Portrait Studio',
  'nav.music': 'Music Studio',
  'nav.video': 'Video Studio',
  'nav.games': 'Games',
  'nav.profile': 'My profile',
  'nav.settings': 'Settings',
  'nav.create': 'Create',
  'nav.logout': 'Log out',
  'nav.login': 'Sign in',
  'nav.register': 'Create account',
  'nav.more': 'More',
  'nav.universe': 'Your universe',
  'nav.studio': 'Studios',
  'nav.social': 'Social',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.create': 'Create',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.loading': 'Loading…',
  'common.empty': 'Nothing here yet.',
  'common.confirmDelete': 'Delete permanently?',
  'common.duplicate': 'Duplicate',
  'common.public': 'Public',
  'common.private': 'Private',
  'common.followers': 'Followers',
  'common.follow': 'Follow',
  'common.following': 'Following',
  'common.unfollow': 'Unfollow',
  'common.message': 'Message',
  'common.share': 'Share',
  'common.comments': 'Comments',
  'common.reply': 'Reply',
  'common.send': 'Send',
  'common.upload': 'Upload',
  'common.name': 'Name',
  'common.title': 'Title',
  'common.description': 'Description',
  'common.tags': 'Tags',
  'common.visibility': 'Visibility',
  'common.optional': 'optional',
  'common.required': 'required',
  'common.all': 'All',
  'common.viewAll': 'View all',
  'common.report': 'Report',
  'common.block': 'Block',
  'common.unblock': 'Unblock',
  'common.download': 'Download',
  'common.preview': 'Preview',
  'auth.welcome': 'Welcome back to the universe',
  'auth.join': 'Create your universe',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.username': 'Username',
  'auth.displayName': 'Display name',
  'auth.forgot': 'Forgot your password?',
  'auth.reset': 'Reset password',
  'auth.haveAccount': 'Already have an account?',
  'auth.noAccount': 'No account yet?',
  'auth.signIn': 'Sign in',
  'auth.signUp': 'Sign up',
  'feed.title': 'Your feed',
  'feed.discover': 'Discover',
  'feed.following': 'Following',
  'feed.placeholder': 'What is happening in your universe?',
  'feed.publish': 'Publish',
  'feed.recommended': 'Recommended for you',
  'explore.title': 'Explore',
  'explore.subtitle': 'Find people, characters and stories.',
  'explore.trending': 'Trending',
  'explore.creators': 'Creators',
  'notif.title': 'Notifications',
  'notif.subtitle': 'Your universe has something to tell you.',
  'notif.markAll': 'Mark all as read',
  'notif.empty': 'No notifications in this category.',
  'notif.settings': 'Settings',
  'notif.push': 'Push notifications',
  'notif.sound': 'Notification sound',
  'notif.preview': 'Play preview',
  'notif.quiet': 'Quiet hours',
  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.privacy': 'Privacy',
  'settings.notifications': 'Notifications',
  'settings.language': 'Language',
  'settings.install': 'Install on iPhone',
  'portrait.title': 'YumEra Portrait Studio',
  'portrait.version': 'YumEra V4',
  'portrait.subtitle': 'Create portraits that tell your story.',
  'portrait.export': 'Export',
  'portrait.library': 'My library',
  'music.title': 'Music Studio',
  'music.library': 'Original library',
  'music.playlists': 'Playlists',
  'music.aiPlaylist': 'AI playlist',
  'music.spotify': 'Search Spotify',
  'video.title': 'Video Studio',
  'games.title': 'Games',
  'games.score': 'Score',
  'games.play': 'Play',
};

const fr: Dict = {
  'app.tagline': 'Un univers social pour ceux qui aiment les mondes fictifs.',
  'nav.home': 'Accueil',
  'nav.explore': 'Explorer',
  'nav.messages': 'Messages',
  'nav.notifications': 'Notifications',
  'nav.yumesonas': 'Yumesonas',
  'nav.fo': 'Registre F/O',
  'nav.lore': 'Lore',
  'nav.stories': 'Histoires',
  'nav.gallery': 'Galerie',
  'nav.memories': 'Souvenirs',
  'nav.diary': 'Journal',
  'nav.communities': 'Communautés',
  'nav.characters': 'Character World',
  'nav.portrait': 'Portrait Studio',
  'nav.music': 'Music Studio',
  'nav.video': 'Video Studio',
  'nav.games': 'Jeux',
  'nav.profile': 'Mon profil',
  'nav.settings': 'Réglages',
  'nav.logout': 'Déconnexion',
  'nav.login': 'Connexion',
  'nav.register': 'Créer un compte',
  'nav.universe': 'Ton univers',
  'nav.studio': 'Studios',
  'nav.social': 'Social',
  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.delete': 'Supprimer',
  'common.edit': 'Modifier',
  'common.create': 'Créer',
  'common.search': 'Rechercher',
  'common.loading': 'Chargement…',
  'common.empty': "Rien ici pour l'instant.",
  'common.follow': 'Suivre',
  'common.following': 'Abonné',
  'common.message': 'Message',
  'common.comments': 'Commentaires',
  'common.send': 'Envoyer',
  'common.visibility': 'Visibilité',
  'auth.welcome': "Bon retour dans l'univers",
  'auth.join': 'Crée ton univers',
  'auth.email': 'E-mail',
  'auth.password': 'Mot de passe',
  'auth.username': "Nom d'utilisateur",
  'auth.signIn': 'Se connecter',
  'auth.signUp': "S'inscrire",
  'feed.title': 'Ton fil',
  'notif.title': 'Notifications',
  'notif.subtitle': 'Ton univers a quelque chose à te dire.',
  'notif.markAll': 'Tout marquer comme lu',
  'portrait.subtitle': 'Crée des portraits qui racontent ton histoire.',
  'music.title': 'Music Studio',
  'video.title': 'Video Studio',
  'games.title': 'Jeux',
};

const ja: Dict = {
  'app.tagline': '架空の世界を愛する人のためのソーシャルユニバース。',
  'nav.home': 'ホーム',
  'nav.explore': '探索',
  'nav.messages': 'メッセージ',
  'nav.notifications': '通知',
  'nav.yumesonas': '夢ソナ',
  'nav.fo': 'F/O レジストリ',
  'nav.lore': 'ロア',
  'nav.stories': 'ストーリー',
  'nav.gallery': 'ギャラリー',
  'nav.memories': '思い出',
  'nav.diary': '日記',
  'nav.communities': 'コミュニティ',
  'nav.characters': 'キャラクターワールド',
  'nav.portrait': 'ポートレートスタジオ',
  'nav.music': 'ミュージックスタジオ',
  'nav.video': 'ビデオスタジオ',
  'nav.games': 'ゲーム',
  'nav.profile': 'プロフィール',
  'nav.settings': '設定',
  'nav.logout': 'ログアウト',
  'nav.login': 'ログイン',
  'nav.register': 'アカウント作成',
  'nav.universe': 'あなたの宇宙',
  'nav.studio': 'スタジオ',
  'nav.social': 'ソーシャル',
  'common.save': '保存',
  'common.cancel': 'キャンセル',
  'common.delete': '削除',
  'common.edit': '編集',
  'common.create': '作成',
  'common.search': '検索',
  'common.loading': '読み込み中…',
  'common.empty': 'まだ何もありません。',
  'common.follow': 'フォロー',
  'common.following': 'フォロー中',
  'common.message': 'メッセージ',
  'common.comments': 'コメント',
  'common.send': '送信',
  'common.visibility': '公開範囲',
  'auth.welcome': '宇宙へおかえりなさい',
  'auth.join': 'あなたの宇宙を作る',
  'auth.email': 'メール',
  'auth.password': 'パスワード',
  'auth.username': 'ユーザー名',
  'auth.signIn': 'ログイン',
  'auth.signUp': '登録',
  'feed.title': 'フィード',
  'notif.title': '通知',
  'notif.subtitle': 'あなたの宇宙からのお知らせ。',
  'notif.markAll': 'すべて既読にする',
  'portrait.subtitle': '物語を語るポートレートを作ろう。',
  'music.title': 'ミュージックスタジオ',
  'video.title': 'ビデオスタジオ',
  'games.title': 'ゲーム',
};

const DICTS: Record<Locale, Dict> = { es, en, fr, ja };

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('yumera.locale');
    if (saved && saved in DICTS) return saved as Locale;
    const nav = navigator.language.slice(0, 2);
    if (nav in DICTS) return nav as Locale;
    return 'es';
  });

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('yumera.locale', next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = DICTS[locale][key] ?? DICTS.en[key] ?? DICTS.es[key] ?? key;
      if (!vars) return raw;
      return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), raw);
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/* ---------------------------------- auth ---------------------------------- */

export type User = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  cover_url: string | null;
  locale: string;
  is_private: number;
  role: string;
  email_verified: number;
  created_at: string;
  email?: string;
};

export type Counts = {
  posts: number;
  followers: number;
  following: number;
  unreadNotifications: number;
  unreadMessages: number;
};

type AuthValue = {
  user: User | null;
  counts: Counts | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: { username: string; email: string; password: string; display_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User | null; counts?: Counts }>('/auth/me');
      setUser(res.user);
      setCounts(res.counts ?? null);
    } catch {
      setUser(null);
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api<{ user: User }>('/auth/login', { method: 'POST', body: { identifier, password } });
      setUser(res.user);
      await refresh();
    },
    [refresh]
  );

  const register = useCallback(
    async (payload: { username: string; email: string; password: string; display_name?: string }) => {
      const res = await api<{ user: User }>('/auth/register', { method: 'POST', body: payload });
      setUser(res.user);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setCounts(null);
  }, []);

  const value = useMemo(
    () => ({ user, counts, loading, refresh, login, register, logout, setUser }),
    [user, counts, loading, refresh, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/* --------------------------------- toasts --------------------------------- */

type Toast = { id: number; message: string; tone: 'info' | 'error' | 'success' };

const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export function errorLabel(code: string, locale: Locale) {
  const labels: Record<string, Record<string, string>> = {
    invalid_credentials: {
      es: 'Usuario o contraseña incorrectos.',
      en: 'Wrong username or password.',
      fr: 'Identifiants incorrects.',
      ja: 'ユーザー名またはパスワードが違います。',
    },
    username_taken: {
      es: 'Ese nombre de usuario ya existe.',
      en: 'That username is taken.',
      fr: 'Ce nom est déjà pris.',
      ja: 'そのユーザー名は使用されています。',
    },
    email_taken: {
      es: 'Ese correo ya está registrado.',
      en: 'That email is already registered.',
      fr: 'Cet e-mail est déjà utilisé.',
      ja: 'このメールは登録済みです。',
    },
    rate_limited: {
      es: 'Demasiados intentos. Espera un momento.',
      en: 'Too many attempts. Please wait.',
      fr: 'Trop de tentatives. Patiente un peu.',
      ja: '試行回数が多すぎます。少し待ってください。',
    },
    unauthorized: {
      es: 'Necesitas iniciar sesión.',
      en: 'You need to sign in.',
      fr: 'Tu dois te connecter.',
      ja: 'ログインが必要です。',
    },
    forbidden: {
      es: 'No tienes permiso para esto.',
      en: 'You are not allowed to do that.',
      fr: "Tu n'as pas la permission.",
      ja: '権限がありません。',
    },
    not_found: {
      es: 'No se encontró el contenido.',
      en: 'Content not found.',
      fr: 'Contenu introuvable.',
      ja: 'コンテンツが見つかりません。',
    },
    ai_not_configured: {
      es: 'La IA no está configurada en el servidor todavía.',
      en: 'AI is not configured on the server yet.',
      fr: "L'IA n'est pas encore configurée sur le serveur.",
      ja: 'AIはまだサーバーに設定されていません。',
    },
  };
  return labels[code]?.[locale] ?? labels[code]?.en ?? code;
}
