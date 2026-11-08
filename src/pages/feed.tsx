import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  errorLabel,
  formatDate,
  mediaUrl,
  timeAgo,
  useAuth,
  useI18n,
  useToast,
} from '../lib/core';
import {
  Avatar,
  Btn,
  Empty,
  Field,
  Icon,
  MediaUploader,
  Modal,
  PageHead,
  PostCard,
  Spinner,
  Tabs,
  type Post,
} from '../components/ui';

type FeedResponse = { posts?: Post[]; feed?: Post[] };
const readPosts = (res: FeedResponse | Post[]): Post[] =>
  Array.isArray(res) ? res : res.posts || res.feed || [];

/* ---------------------------------- home ---------------------------------- */

export function HomePage() {
  const { user, counts } = useAuth();
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [scope, setScope] = useState<'for-you' | 'following' | 'latest'>('for-you');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<FeedResponse>(`/feed?scope=${scope}`);
      setPosts(readPosts(res));
    } catch {
      setPosts([]);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<any>('/explore')
      .then((res) => setSuggested((res.users || res.creators || []).slice(0, 4)))
      .catch(() => undefined);
    api<any>('/stats')
      .then(setStats)
      .catch(() => undefined);
  }, []);

  const publish = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() && !media.length) return;
    setSending(true);
    try {
      await api('/posts', { method: 'POST', body: { content: draft.trim(), media, visibility: 'public' } });
      setDraft('');
      setMedia([]);
      setComposerOpen(false);
      push('Published in your universe ✦', 'success');
      load();
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page feed-layout">
      <div className="feed-main">
        {!user ? (
          <section className="hero">
            <div className="hero-glow" aria-hidden="true" />
            <p className="eyebrow">YumEra · Eternal Universe</p>
            <h1>
              Your characters, your love, <em>your universe</em>.
            </h1>
            <p>
              A social home for yumeshipping, selfshipping, F/O and original worlds. Build yumesonas, keep your
              registry, create portraits and share your stories.
            </p>
            <div className="hero-actions">
              <Link to="/auth" className="btn btn-primary btn-lg">
                {t('nav.register')}
              </Link>
              <Link to="/explore" className="btn btn-outline btn-lg">
                {t('nav.explore')}
              </Link>
            </div>
            <div className="hero-stats">
              <span>✦ Yumesona Studio</span>
              <span>✦ F/O Registry</span>
              <span>✦ Portrait Studio V4</span>
              <span>✦ Web Push</span>
            </div>
          </section>
        ) : (
          <section className="composer-card">
            <div className="composer-top">
              <Avatar src={user.avatar_url} name={user.display_name} size={44} ring />
              <button className="composer-fake" onClick={() => setComposerOpen(true)}>
                {t('feed.placeholder')}
              </button>
            </div>
            <div className="composer-quick">
              <button onClick={() => setComposerOpen(true)}>
                <Icon name="image" size={16} /> Photo
              </button>
              <Link to="/portrait">
                <Icon name="brush" size={16} /> Portrait
              </Link>
              <Link to="/stories">
                <Icon name="book" size={16} /> Story
              </Link>
              <Link to="/music">
                <Icon name="music" size={16} /> Music
              </Link>
            </div>
          </section>
        )}

        <div className="feed-toolbar">
          <Tabs
            value={scope}
            onChange={setScope}
            tabs={[
              { id: 'for-you', label: t('feed.recommended') },
              { id: 'following', label: t('feed.following') },
              { id: 'latest', label: 'Latest' },
            ]}
          />
        </div>

        {posts === null ? (
          <Spinner />
        ) : posts.length === 0 ? (
          <Empty
            title={t('common.empty')}
            hint={user ? 'Follow creators or publish your first post.' : 'Join YumEra to see your personalised feed.'}
            action={
              <div className="row gap">
                <Link to="/explore" className="btn btn-outline btn-sm">
                  {t('nav.explore')}
                </Link>
                {user ? (
                  <Link to="/create" className="btn btn-primary btn-sm">
                    {t('feed.publish')}
                  </Link>
                ) : null}
              </div>
            }
          />
        ) : (
          <div className="post-list">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onChanged={load} />
            ))}
          </div>
        )}
      </div>

      <aside className="feed-side">
        <section className="side-card">
          <h3>Your universe</h3>
          <div className="stat-grid">
            <Link to={user ? `/u/${user.username}` : '/auth'}>
              <strong>{counts?.posts ?? 0}</strong>
              <small>Posts</small>
            </Link>
            <Link to={user ? `/u/${user.username}` : '/auth'}>
              <strong>{counts?.followers ?? 0}</strong>
              <small>{t('common.followers')}</small>
            </Link>
            <Link to="/notifications">
              <strong>{counts?.unreadNotifications ?? 0}</strong>
              <small>Unread</small>
            </Link>
          </div>
          <div className="side-links">
            <Link to="/yumesonas">
              <Icon name="star" size={16} /> Yumesona Studio
            </Link>
            <Link to="/fo">
              <Icon name="heart" size={16} /> F/O Registry
            </Link>
            <Link to="/lore">
              <Icon name="book" size={16} /> Yume Lore
            </Link>
            <Link to="/portrait">
              <Icon name="brush" size={16} /> Portrait Studio
            </Link>
          </div>
        </section>

        {suggested.length ? (
          <section className="side-card">
            <h3>Creators to meet</h3>
            <div className="mini-list">
              {suggested.map((u) => (
                <Link key={u.id || u.username} to={`/u/${u.username}`} className="mini-row">
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size={34} />
                  <span>
                    <strong>{u.display_name || u.username}</strong>
                    <small>@{u.username}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {stats ? (
          <section className="side-card muted-card">
            <h3>Universe pulse</h3>
            <ul className="stat-lines">
              {Object.entries(stats)
                .filter(([, v]) => typeof v === 'number')
                .slice(0, 6)
                .map(([k, v]) => (
                  <li key={k}>
                    <span>{k.replace(/_/g, ' ')}</span>
                    <strong>{v as number}</strong>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <p className="side-note">
          YumEra is a space for fiction and affection. Be kind, credit creators and respect everyone&apos;s
          boundaries.
        </p>
      </aside>

      {composerOpen ? (
        <Modal title={t('feed.publish')} onClose={() => setComposerOpen(false)} wide>
          <form onSubmit={publish} className="stack">
            <textarea
              className="composer-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('feed.placeholder')}
              maxLength={4000}
              rows={6}
              autoFocus
            />
            <MediaUploader urls={media} onChange={setMedia} max={6} label="Photo or video" />
            <div className="row between">
              <small className="muted">{draft.length}/4000 · #tags and @mentions are linked</small>
              <Btn type="submit" disabled={sending || (!draft.trim() && !media.length)}>
                {sending ? t('common.loading') : t('feed.publish')}
              </Btn>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

/* --------------------------------- create --------------------------------- */

export function CreatePage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [visibility, setVisibility] = useState('public');
  const [communityId, setCommunityId] = useState('');
  const [communities, setCommunities] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any>('/communities?mine=1')
      .then((res) => setCommunities(res.communities || []))
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !media.length) return;
    setBusy(true);
    try {
      await api('/posts', {
        method: 'POST',
        body: { content: content.trim(), media, visibility, community_id: communityId || null },
      });
      push('Published ✦', 'success');
      navigate('/');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <PageHead title="Create a post" subtitle="Share a memory, a portrait or a thought with your universe." />
      <form className="card stack" onSubmit={submit}>
        <textarea
          className="composer-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What is happening in your universe?"
          rows={7}
          maxLength={4000}
        />
        <MediaUploader urls={media} onChange={setMedia} max={8} label="Add photos or video" />
        <div className="grid-2">
          <Field label={t('common.visibility')}>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="public">{t('common.public')}</option>
              <option value="followers">Followers</option>
              <option value="private">{t('common.private')}</option>
            </select>
          </Field>
          <Field label="Community" hint="Optional: post inside a community you belong to.">
            <select value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
              <option value="">—</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row between">
          <small className="muted">{content.length}/4000</small>
          <Btn type="submit" size="lg" disabled={busy || (!content.trim() && !media.length)}>
            {busy ? t('common.loading') : t('feed.publish')}
          </Btn>
        </div>
      </form>
    </div>
  );
}

/* --------------------------------- explore -------------------------------- */

type ExploreTab = 'all' | 'people' | 'yumesonas' | 'stories' | 'communities' | 'playlists' | 'posts';

export function ExplorePage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [tab, setTab] = useState<ExploreTab>('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const term = params.get('q') || '';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const url = term ? `/search?q=${encodeURIComponent(term)}` : '/explore';
    api<any>(url)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => alive && setData({}))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [term]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(query.trim() ? { q: query.trim() } : {});
  };

  const groups: { id: ExploreTab; label: string; items: any[]; render: (item: any) => React.ReactNode }[] = useMemo(() => {
    const d = data || {};
    const list = (key: string) => (Array.isArray(d[key]) ? d[key] : []);
    return [
      {
        id: 'people',
        label: 'People',
        items: list('users'),
        render: (u) => (
          <Link key={u.id || u.username} to={`/u/${u.username}`} className="tile tile-person">
            <Avatar src={u.avatar_url} name={u.display_name || u.username} size={56} ring />
            <strong>{u.display_name || u.username}</strong>
            <small>@{u.username}</small>
            {u.bio ? <p>{u.bio}</p> : null}
          </Link>
        ),
      },
      {
        id: 'yumesonas',
        label: 'Yumesonas',
        items: list('yumesonas'),
        render: (y) => (
          <Link key={y.id} to={`/yumesonas/${y.id}`} className="tile tile-cover">
            <div className="tile-cover-img" style={y.image_url ? { backgroundImage: `url(${mediaUrl(y.image_url)})` } : undefined} />
            <strong>{y.name}</strong>
            <small>{y.universe || 'Original universe'}</small>
          </Link>
        ),
      },
      {
        id: 'stories',
        label: 'Stories',
        items: list('stories'),
        render: (s) => (
          <Link key={s.id} to={`/stories/${s.id}`} className="tile tile-cover">
            <div className="tile-cover-img" style={s.cover_url ? { backgroundImage: `url(${mediaUrl(s.cover_url)})` } : undefined} />
            <strong>{s.title}</strong>
            <small>{s.description || 'Story'}</small>
          </Link>
        ),
      },
      {
        id: 'communities',
        label: 'Communities',
        items: list('communities'),
        render: (c) => (
          <Link key={c.id} to={`/communities/${c.id}`} className="tile tile-cover">
            <div className="tile-cover-img" style={c.cover_url ? { backgroundImage: `url(${mediaUrl(c.cover_url)})` } : undefined} />
            <strong>{c.name}</strong>
            <small>{c.members_count ?? ''} members {c.is_private ? '· private' : ''}</small>
          </Link>
        ),
      },
      {
        id: 'playlists',
        label: 'Playlists',
        items: list('playlists'),
        render: (p) => (
          <Link key={p.id} to="/music" className="tile tile-cover">
            <div className="tile-cover-img" style={p.cover_url ? { backgroundImage: `url(${mediaUrl(p.cover_url)})` } : undefined} />
            <strong>{p.title}</strong>
            <small>{p.description || 'Playlist'}</small>
          </Link>
        ),
      },
      {
        id: 'posts',
        label: 'Posts',
        items: list('posts'),
        render: () => null,
      },
    ];
  }, [data]);

  const active = groups.filter((g) => g.id !== 'posts' && (tab === 'all' || tab === g.id));
  const hasResults = active.some((g) => g.items.length > 0) || (data?.posts || []).length > 0;

  return (
    <div className="page">
      <PageHead
        eyebrow="Explore"
        title={term ? `Results for “${term}”` : t('explore.title')}
        subtitle={t('explore.subtitle')}
      />
      <form className="search-bar" onSubmit={submit}>
        <Icon name="search" size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="People, yumesonas, stories, #tags…" />
        <Btn type="submit" size="sm">
          {t('common.search')}
        </Btn>
      </form>

      <div className="scroll-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: t('common.all') },
            { id: 'people', label: 'People' },
            { id: 'yumesonas', label: 'Yumesonas' },
            { id: 'stories', label: 'Stories' },
            { id: 'communities', label: 'Communities' },
            { id: 'playlists', label: 'Playlists' },
            { id: 'posts', label: 'Posts' },
          ]}
        />
      </div>

      {loading ? (
        <Spinner />
      ) : !hasResults ? (
        <Empty title="Nothing found" hint="Try another name, universe or hashtag." />
      ) : (
        <div className="stack-lg">
          {active.map((g) =>
            g.items.length ? (
              <section key={g.id}>
                <div className="section-head">
                  <h2>{g.label}</h2>
                  {tab === 'all' && g.items.length > 6 ? (
                    <button className="link-btn" onClick={() => setTab(g.id)}>
                      {t('common.viewAll')}
                    </button>
                  ) : null}
                </div>
                <div className="tile-grid">{g.items.slice(0, tab === 'all' ? 6 : 48).map(g.render)}</div>
              </section>
            ) : null
          )}

          {(tab === 'all' || tab === 'posts') && (data?.posts || []).length ? (
            <section>
              <div className="section-head">
                <h2>Posts</h2>
              </div>
              <div className="post-list">
                {(data.posts as Post[]).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          ) : null}

          {data?.tags?.length ? (
            <section>
              <div className="section-head">
                <h2>Tags</h2>
              </div>
              <div className="chips">
                {data.tags.map((tag: any) => (
                  <button
                    key={typeof tag === 'string' ? tag : tag.tag}
                    className="chip"
                    onClick={() => {
                      const value = typeof tag === 'string' ? tag : tag.tag;
                      setParams({ q: value.startsWith('#') ? value : `#${value}` });
                    }}
                  >
                    {typeof tag === 'string' ? tag : `#${tag.tag}`}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- profile -------------------------------- */

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user, refresh } = useAuth();
  const { t, locale } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'posts' | 'yumesonas' | 'fo' | 'stories' | 'albums' | 'about'>('posts');
  const [collection, setCollection] = useState<Record<string, any[]>>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const isMe = user && profile && user.id === profile.user?.id;

  const load = useCallback(async () => {
    try {
      const res = await api<any>(`/users/${username}`);
      setProfile(res);
      setForm(res.user || {});
      const postsRes = await api<any>(`/users/${username}/posts`);
      setPosts(postsRes.posts || []);
    } catch {
      setProfile({ error: true });
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profile?.user) return;
    const id = profile.user.id;
    const loaders: [string, string][] = [
      ['yumesonas', `/yumesonas/public?user_id=${id}`],
      ['fo', `/fos/public?user_id=${id}`],
      ['stories', `/stories?user_id=${id}`],
      ['albums', `/albums/public?user_id=${id}`],
    ];
    loaders.forEach(([key, url]) => {
      api<any>(url)
        .then((res) => setCollection((prev) => ({ ...prev, [key]: res[key] || [] })))
        .catch(() => undefined);
    });
  }, [profile?.user?.id]);

  const follow = async () => {
    if (!user) return navigate('/auth');
    try {
      if (profile.is_following) {
        await api(`/users/${profile.user.id}/follow`, { method: 'DELETE' });
      } else {
        const res = await api<any>(`/users/${profile.user.id}/follow`, { method: 'POST' });
        push(res.status === 'pending' ? 'Follow request sent' : 'Following ✦', 'success');
      }
      load();
      refresh().catch(() => undefined);
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  const block = async () => {
    if (!user) return;
    const blocked = profile.is_blocked;
    await api(`/blocks/${profile.user.id}`, { method: blocked ? 'DELETE' : 'POST' }).catch(() => undefined);
    push(blocked ? 'Unblocked' : 'Blocked', 'info');
    load();
  };

  const report = async () => {
    await api('/reports', { method: 'POST', body: { target_type: 'user', target_id: profile.user.id, reason: 'user_report' } });
    push('Report sent to moderation', 'success');
  };

  const message = async () => {
    if (!user) return navigate('/auth');
    try {
      const res = await api<any>('/conversations', { method: 'POST', body: { user_id: profile.user.id } });
      navigate(`/messages/${res.id || res.conversation?.id}`);
    } catch {
      push('Could not open conversation', 'error');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: {
          display_name: form.display_name,
          bio: form.bio,
          is_private: form.is_private,
          avatar_url: form.avatar_url,
          cover_url: form.cover_url,
          locale: form.locale,
        },
      });
      await refresh();
      setEditing(false);
      load();
      push('Profile updated', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!profile) return <Spinner />;
  if (profile.error) return <Empty title="Profile not found" hint="This user may have left the universe." />;

  const u = profile.user;
  const counts = profile.counts || {};

  return (
    <div className="page">
      <header className="profile-head">
        <div
          className="profile-cover"
          style={u.cover_url ? { backgroundImage: `url(${mediaUrl(u.cover_url)})` } : undefined}
        >
          <span className="cover-ornament" aria-hidden="true">
            ✦
          </span>
        </div>
        <div className="profile-id">
          <Avatar src={u.avatar_url} name={u.display_name || u.username} size={112} ring />
          <div className="profile-meta">
            <h1>
              {u.display_name || u.username}
              {u.role === 'official' ? <span className="badge-official">✦ official</span> : null}
              {u.is_private ? <span className="badge-private">private</span> : null}
            </h1>
            <p className="handle">@{u.username}</p>
            {u.bio ? <p className="profile-bio">{u.bio}</p> : null}
            <div className="profile-stats">
              <span>
                <strong>{counts.posts ?? 0}</strong> posts
              </span>
              <span>
                <strong>{counts.followers ?? 0}</strong> {t('common.followers')}
              </span>
              <span>
                <strong>{counts.following ?? 0}</strong> following
              </span>
              <span className="muted">Joined {formatDate(u.created_at, locale)}</span>
            </div>
            <div className="profile-actions">
              {isMe ? (
                <>
                  <Btn variant="outline" onClick={() => setEditing(true)}>
                    <Icon name="cog" size={16} /> {t('common.edit')}
                  </Btn>
                  <Link to="/settings" className="btn btn-ghost btn-md">
                    {t('nav.settings')}
                  </Link>
                </>
              ) : user ? (
                <>
                  <Btn onClick={follow} variant={profile.is_following ? 'outline' : 'primary'}>
                    {profile.is_following ? t('common.following') : profile.pending ? 'Requested' : t('common.follow')}
                  </Btn>
                  <Btn variant="outline" onClick={message}>
                    <Icon name="chat" size={16} /> {t('common.message')}
                  </Btn>
                  <Btn variant="ghost" onClick={block}>
                    {profile.is_blocked ? t('common.unblock') : t('common.block')}
                  </Btn>
                  <Btn variant="ghost" onClick={report}>
                    {t('common.report')}
                  </Btn>
                </>
              ) : (
                <Link to="/auth" className="btn btn-primary btn-md">
                  {t('auth.signIn')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="scroll-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'posts', label: 'Posts', count: posts.length },
            { id: 'yumesonas', label: 'Yumesonas', count: (collection.yumesonas || []).length },
            { id: 'fo', label: 'F/O', count: (collection.fo || []).length },
            { id: 'stories', label: 'Stories', count: (collection.stories || []).length },
            { id: 'albums', label: 'Gallery', count: (collection.albums || []).length },
            { id: 'about', label: 'About' },
          ]}
        />
      </div>

      {tab === 'posts' ? (
        posts.length ? (
          <div className="post-list">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onChanged={load} />
            ))}
          </div>
        ) : (
          <Empty title="No posts yet" />
        )
      ) : null}

      {tab === 'yumesonas' ? (
        (collection.yumesonas || []).length ? (
          <div className="tile-grid">
            {collection.yumesonas.map((y: any) => (
              <Link key={y.id} to={`/yumesonas/${y.id}`} className="tile tile-cover">
                <div className="tile-cover-img" style={y.image_url ? { backgroundImage: `url(${mediaUrl(y.image_url)})` } : undefined} />
                <strong>{y.name}</strong>
                <small>{y.universe || 'Original universe'}</small>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No public yumesonas" />
        )
      ) : null}

      {tab === 'fo' ? (
        (collection.fo || []).length ? (
          <div className="tile-grid">
            {collection.fo.map((f: any) => (
              <Link key={f.id} to={`/fo/${f.id}`} className="tile tile-cover">
                <div className="tile-cover-img" style={f.portrait_url ? { backgroundImage: `url(${mediaUrl(f.portrait_url)})` } : undefined} />
                <strong>{f.name}</strong>
                <small>{f.source}</small>
                {f.anti_double_enabled ? <em className="tile-tag">Anti-Double</em> : null}
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No public F/O" />
        )
      ) : null}

      {tab === 'stories' ? (
        (collection.stories || []).length ? (
          <div className="tile-grid">
            {collection.stories.map((s: any) => (
              <Link key={s.id} to={`/stories/${s.id}`} className="tile tile-cover">
                <div className="tile-cover-img" style={s.cover_url ? { backgroundImage: `url(${mediaUrl(s.cover_url)})` } : undefined} />
                <strong>{s.title}</strong>
                <small>{s.status}</small>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No public stories" />
        )
      ) : null}

      {tab === 'albums' ? (
        (collection.albums || []).length ? (
          <div className="tile-grid">
            {collection.albums.map((a: any) => (
              <Link key={a.id} to={a.kind === 'memories' ? `/memories/${a.id}` : `/gallery/${a.id}`} className="tile tile-cover">
                <div className="tile-cover-img" style={a.cover_url ? { backgroundImage: `url(${mediaUrl(a.cover_url)})` } : undefined} />
                <strong>{a.title}</strong>
                <small>{a.kind}</small>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No public albums" />
        )
      ) : null}

      {tab === 'about' ? (
        <div className="card stack">
          <h2>About @{u.username}</h2>
          <p>{u.bio || 'This creator has not written a bio yet.'}</p>
          <ul className="stat-lines">
            <li>
              <span>Joined</span>
              <strong>{formatDate(u.created_at, locale)}</strong>
            </li>
            <li>
              <span>Account</span>
              <strong>{u.is_private ? 'Private' : 'Public'}</strong>
            </li>
            <li>
              <span>Language</span>
              <strong>{(u.locale || 'es').toUpperCase()}</strong>
            </li>
            <li>
              <span>Email verified</span>
              <strong>{u.email_verified ? 'Yes' : 'No'}</strong>
            </li>
          </ul>
        </div>
      ) : null}

      {editing ? (
        <Modal title="Edit profile" onClose={() => setEditing(false)} wide>
          <form className="stack" onSubmit={save}>
            <div className="grid-2">
              <Field label="Display name">
                <input value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Language">
                <select value={form.locale || 'es'} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="ja">日本語</option>
                </select>
              </Field>
            </div>
            <Field label="Bio">
              <textarea value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} maxLength={600} />
            </Field>
            <Field label="Private account" hint="Only accepted followers can see your posts.">
              <select
                value={form.is_private ? '1' : '0'}
                onChange={(e) => setForm({ ...form, is_private: e.target.value === '1' })}
              >
                <option value="0">Public</option>
                <option value="1">Private</option>
              </select>
            </Field>
            <div className="grid-2">
              <Field label="Avatar">
                <MediaUploader urls={form.avatar_url ? [form.avatar_url] : []} onChange={(urls) => setForm({ ...form, avatar_url: urls[0] || null })} max={1} accept="image/*" label="Avatar" />
              </Field>
              <Field label="Cover">
                <MediaUploader urls={form.cover_url ? [form.cover_url] : []} onChange={(urls) => setForm({ ...form, cover_url: urls[0] || null })} max={1} accept="image/*" label="Cover" />
              </Field>
            </div>
            <div className="row between">
              <Link to="/portrait" className="link-btn">
                Create a portrait instead
              </Link>
              <Btn type="submit" disabled={busy}>
                {busy ? t('common.loading') : t('common.save')}
              </Btn>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------------------------- post ---------------------------------- */

export function PostPage() {
  const { id = '' } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api<any>(`/posts/${id}`)
      .then((res) => setPost(res.post || res))
      .catch(() => setError(true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Empty title="Post not found" hint="It may be private or deleted." />;
  if (!post) return <Spinner />;

  return (
    <div className="page narrow">
      <PostCard post={post} onChanged={load} />
    </div>
  );
}
