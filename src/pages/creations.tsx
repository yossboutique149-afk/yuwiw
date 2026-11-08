import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorLabel, formatDate, mediaUrl, timeAgo, useAuth, useI18n, useToast } from '../lib/core';
import {
  Avatar,
  Btn,
  Empty,
  Field,
  Icon,
  MediaUploader,
  Modal,
  PageHead,
  Spinner,
  Tabs,
} from '../components/ui';

const splitTags = (value: any): string[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const parseList = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/* -------------------------------- stories --------------------------------- */

export function StoriesPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [items, setItems] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async (which: 'all' | 'mine') => {
    setItems(null);
    try {
      const res = await api<any>(which === 'mine' ? '/stories/mine' : '/stories');
      setItems(res.stories || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const save = async () => {
    if (!draft?.title?.trim()) return;
    try {
      const body = {
        title: draft.title,
        cover_url: draft.cover_url || null,
        description: draft.description || '',
        tags: splitTags(draft.tags).join(','),
        status: draft.status || 'draft',
        visibility: draft.visibility || 'public',
      };
      if (draft.id) await api(`/stories/${draft.id}`, { method: 'PATCH', body });
      else await api('/stories', { method: 'POST', body });
      setDraft(null);
      load(tab);
      push('Story saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Yume Stories"
        title="Stories"
        subtitle="Serialised stories, chapters and the worlds you write for your characters."
        actions={
          user ? (
            <Btn onClick={() => setDraft({ title: '', cover_url: '', description: '', tags: '', status: 'draft', visibility: 'public' })}>
              <Icon name="plus" size={16} /> New story
            </Btn>
          ) : null
        }
      />

      {user ? (
        <Tabs
          tabs={[
            { id: 'all', label: 'All stories' },
            { id: 'mine', label: 'My stories' },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="No stories yet" hint={tab === 'mine' ? 'Write your first chapter.' : 'Be the first to publish one.'} />
      ) : (
        <div className="card-grid story-grid">
          {items.map((s) => (
            <Link key={s.id} to={`/stories/${s.id}`} className="story-card">
              <div className="story-cover">
                {s.cover_url ? <img src={mediaUrl(s.cover_url)} alt={s.title} loading="lazy" /> : <span>✦</span>}
                <em className={`chip tiny ${s.status === 'published' ? 'gold' : ''}`}>{s.status || 'draft'}</em>
              </div>
              <div className="story-body">
                <h3>{s.title}</h3>
                <p className="muted small clamp-2">{s.description || 'No description yet.'}</p>
                <div className="row wrap tight">
                  {splitTags(s.tags)
                    .slice(0, 3)
                    .map((tag) => (
                      <span key={tag} className="chip rose tiny">
                        {tag}
                      </span>
                    ))}
                </div>
                <small className="muted">
                  {s.chapter_count ?? s.chapters?.length ?? 0} chapters · {timeAgo(s.updated_at || s.created_at, locale)}
                </small>
              </div>
            </Link>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit story' : 'New story'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Title" required>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Cover">
              <MediaUploader
                urls={draft.cover_url ? [draft.cover_url] : []}
                onChange={(urls) => setDraft({ ...draft, cover_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Tags" hint="Comma separated">
              <input
                value={Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags || ''}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </Field>
            <div className="grid-2">
              <Field label="Status">
                <select value={draft.status || 'draft'} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="draft">Draft — only me</option>
                  <option value="published">Published</option>
                </select>
              </Field>
              <Field label="Visibility">
                <select value={draft.visibility || 'public'} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })}>
                  <option value="public">Public</option>
                  <option value="followers">Followers</option>
                  <option value="private">Private</option>
                </select>
              </Field>
            </div>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn onClick={save} disabled={!draft.title?.trim()}>
                {t('common.save')}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function StoryPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { locale } = useI18n();
  const { push } = useToast();
  const [data, setData] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);
  const [chapter, setChapter] = useState<any | null>(null);
  const [comment, setComment] = useState('');
  const [active, setActive] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api<any>(`/stories/${id}`);
      setData(res);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <div className="page"><Empty title="Story not found" hint="It may be private or unpublished." /></div>;
  if (!data) return <Spinner />;

  const story = data.story;
  const chapters = story.chapters || [];
  const isOwner = data.is_owner || story.user_id === user?.id;
  const current = chapters[active];

  const saveChapter = async () => {
    if (!chapter?.title?.trim()) return;
    try {
      if (chapter.id) await api(`/chapters/${chapter.id}`, { method: 'PATCH', body: chapter });
      else await api(`/stories/${id}/chapters`, { method: 'POST', body: chapter });
      setChapter(null);
      load();
      push('Chapter saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page">
      <div className="story-hero">
        <div className="story-hero-cover">
          {story.cover_url ? <img src={mediaUrl(story.cover_url)} alt={story.title} /> : <span>✦</span>}
        </div>
        <div>
          <p className="eyebrow">Yume Story</p>
          <h1>{story.title}</h1>
          <p className="muted">{story.description}</p>
          <div className="row wrap tight">
            {splitTags(story.tags).map((tag) => (
              <span key={tag} className="chip rose">
                {tag}
              </span>
            ))}
            <span className="chip">{story.visibility}</span>
            <small className="muted">Updated {formatDate(story.updated_at || story.created_at, locale)}</small>
          </div>
          {isOwner ? (
            <div className="row tight">
              <Btn size="sm" onClick={() => setChapter({ title: '', content: '' })}>
                <Icon name="plus" size={14} /> Add chapter
              </Btn>
            </div>
          ) : null}
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <div className="row between">
            <h2>{current ? current.title : 'Chapters'}</h2>
            {current && isOwner ? (
              <button className="icon-btn" onClick={() => setChapter({ ...current })}>
                <Icon name="edit" size={15} />
              </button>
            ) : null}
          </div>
          {chapters.length === 0 ? (
            <p className="muted small">This story has no chapters yet.</p>
          ) : (
            <>
              <div className="chapter-tabs">
                {chapters.map((c: any, i: number) => (
                  <button
                    key={c.id}
                    className={`chapter-tab${i === active ? ' active' : ''}`}
                    onClick={() => setActive(i)}
                  >
                    {i + 1}. {c.title}
                  </button>
                ))}
              </div>
              <article className="chapter-body pre">{current?.content}</article>
            </>
          )}

          <h2>Comments</h2>
          {user ? (
            <div className="row">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Leave a comment…" />
              <Btn
                variant="outline"
                onClick={async () => {
                  if (!comment.trim()) return;
                  await api(`/stories/${id}/comments`, { method: 'POST', body: { content: comment.trim() } }).catch(() =>
                    push('Could not comment', 'error'),
                  );
                  setComment('');
                  load();
                }}
              >
                Send
              </Btn>
            </div>
          ) : null}
          <div className="comment-list">
            {(story.comments || []).map((c: any) => (
              <div key={c.id} className="comment-row">
                <Avatar src={c.avatar_url} name={c.display_name || c.username} size={32} />
                <div>
                  <strong>{c.display_name || c.username}</strong>
                  <p className="small">{c.content}</p>
                  <small className="muted">{timeAgo(c.created_at, locale)}</small>
                </div>
              </div>
            ))}
            {!(story.comments || []).length ? <p className="muted small">No comments yet.</p> : null}
          </div>
        </section>

        <aside className="panel">
          <h2>Chapters</h2>
          <ol className="chapter-list">
            {chapters.map((c: any, i: number) => (
              <li key={c.id}>
                <button className={i === active ? 'active' : ''} onClick={() => setActive(i)}>
                  {c.title}
                </button>
              </li>
            ))}
          </ol>
          {chapters.length === 0 ? <p className="muted small">—</p> : null}
        </aside>
      </div>

      {chapter ? (
        <Modal title={chapter.id ? 'Edit chapter' : 'New chapter'} onClose={() => setChapter(null)} wide>
          <div className="stack">
            <Field label="Chapter title" required>
              <input value={chapter.title} onChange={(e) => setChapter({ ...chapter, title: e.target.value })} />
            </Field>
            <Field label="Chapter text">
              <textarea
                rows={16}
                value={chapter.content || ''}
                onChange={(e) => setChapter({ ...chapter, content: e.target.value })}
              />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setChapter(null)}>
                Cancel
              </Btn>
              <Btn onClick={saveChapter} disabled={!chapter.title?.trim()}>
                Save chapter
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* --------------------------------- gallery -------------------------------- */

export function GalleryPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const [albums, setAlbums] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/albums');
      setAlbums(res.albums || []);
    } catch {
      setAlbums([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft?.title?.trim()) return;
    try {
      const body = {
        title: draft.title,
        cover_url: draft.cover_url || null,
        kind: draft.kind || 'gallery',
        description: draft.description || '',
        visibility: draft.visibility || 'public',
      };
      if (draft.id) await api(`/albums/${draft.id}`, { method: 'PATCH', body });
      else await api('/albums', { method: 'POST', body });
      setDraft(null);
      load();
      push('Album saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Yume Gallery"
        title="Gallery"
        subtitle="Illustrations, portraits, videos and creations organised in albums."
        actions={
          user ? (
            <Btn onClick={() => setDraft({ title: '', cover_url: '', kind: 'gallery', description: '', visibility: 'public' })}>
              <Icon name="plus" size={16} /> New album
            </Btn>
          ) : null
        }
      />
      {albums === null ? (
        <Spinner />
      ) : albums.length === 0 ? (
        <Empty title="No albums yet" hint="Create an album and start collecting your art." />
      ) : (
        <div className="card-grid album-grid">
          {albums.map((a) => (
            <Link key={a.id} to={`/gallery/${a.id}`} className="album-card">
              <div className="album-cover">
                {a.cover_url ? <img src={mediaUrl(a.cover_url)} alt={a.title} loading="lazy" /> : <span>✦</span>}
              </div>
              <div className="album-body">
                <h3>{a.title}</h3>
                <small className="muted">
                  {a.item_count ?? a.items?.length ?? 0} items · {a.visibility}
                </small>
              </div>
            </Link>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit album' : 'New album'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Title" required>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Cover">
              <MediaUploader
                urls={draft.cover_url ? [draft.cover_url] : []}
                onChange={(urls) => setDraft({ ...draft, cover_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={2}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <div className="grid-2">
              <Field label="Kind">
                <select value={draft.kind || 'gallery'} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  <option value="gallery">Gallery</option>
                  <option value="memory">Memories</option>
                </select>
              </Field>
              <Field label="Visibility">
                <select value={draft.visibility || 'public'} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })}>
                  <option value="public">Public</option>
                  <option value="followers">Followers</option>
                  <option value="private">Private</option>
                </select>
              </Field>
            </div>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn onClick={save} disabled={!draft.title?.trim()}>
                {t('common.save')}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function AlbumPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { locale } = useI18n();
  const { push } = useToast();
  const [album, setAlbum] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);
  const [letter, setLetter] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>(`/albums/${id}`);
      setAlbum(res.album || res);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <div className="page"><Empty title="Album not found" hint="It may be private." /></div>;
  if (!album) return <Spinner />;

  const items = album.items || [];
  const owner = album.user_id === user?.id;

  const addItem = async (url: string, kind: string) => {
    if (!url) return;
    await api(`/albums/${id}/items`, { method: 'POST', body: { url, kind } }).catch(() =>
      push('Could not add item', 'error'),
    );
    load();
  };

  return (
    <div className="page">
      <PageHead
        eyebrow={album.kind === 'memory' ? 'Yume Memories' : 'Yume Gallery'}
        title={album.title}
        subtitle={album.description || undefined}
        actions={
          owner ? (
            <Btn onClick={() => setLetter({ title: '', body: '', memory_date: '', kind: 'letter' })}>
              <Icon name="edit" size={16} /> Add letter / memory
            </Btn>
          ) : null
        }
      />

      {owner ? (
        <div className="panel">
          <h2>Add media</h2>
          <MediaUploader
            urls={[]}
            onChange={(urls) => {
              const url = urls[urls.length - 1];
              if (url) addItem(url, /\.(mp4|webm|mov)$/i.test(url) ? 'video' : 'image');
            }}
            accept="image/*,video/*"
            max={1}
            label="Upload image or clip"
          />
        </div>
      ) : null}

      <div className="gallery-grid">
        {items.map((item: any) => (
          <figure key={item.id} className="gallery-item">
            {item.kind === 'video' ? (
              <video src={mediaUrl(item.url)} controls preload="metadata" />
            ) : item.kind === 'letter' || !item.url ? (
              <div className="letter-card">
                <h3>{item.caption || 'A letter'}</h3>
                <p className="pre">{item.body}</p>
                {item.memory_date ? <small className="muted">{formatDate(item.memory_date, locale)}</small> : null}
              </div>
            ) : (
              <img src={mediaUrl(item.url)} alt={item.caption || ''} loading="lazy" />
            )}
            {item.url && item.kind !== 'letter' ? (
              <figcaption>
                {item.caption ? <span>{item.caption}</span> : null}
                {item.memory_date ? <small>{formatDate(item.memory_date, locale)}</small> : null}
              </figcaption>
            ) : null}
            {owner ? (
              <button
                className="icon-btn danger gallery-del"
                onClick={async () => {
                  await api(`/album-items/${item.id}`, { method: 'DELETE' }).catch(() => undefined);
                  load();
                }}
              >
                <Icon name="trash" size={13} />
              </button>
            ) : null}
          </figure>
        ))}
      </div>
      {items.length === 0 ? <Empty title="This album is empty" hint="Add your first image, clip or letter." /> : null}

      {letter ? (
        <Modal title="Letter or memory" onClose={() => setLetter(null)} wide>
          <div className="stack">
            <Field label="Title">
              <input value={letter.title} onChange={(e) => setLetter({ ...letter, title: e.target.value })} />
            </Field>
            <Field label="Text">
              <textarea rows={8} value={letter.body} onChange={(e) => setLetter({ ...letter, body: e.target.value })} />
            </Field>
            <Field label="Special date">
              <input
                type="date"
                value={letter.memory_date || ''}
                onChange={(e) => setLetter({ ...letter, memory_date: e.target.value })}
              />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setLetter(null)}>
                Cancel
              </Btn>
              <Btn
                onClick={async () => {
                  await api(`/albums/${id}/items`, {
                    method: 'POST',
                    body: { kind: 'letter', caption: letter.title, body: letter.body, memory_date: letter.memory_date || null },
                  }).catch(() => push('Could not save', 'error'));
                  setLetter(null);
                  load();
                }}
              >
                Save
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* -------------------------------- memories -------------------------------- */

export function MemoriesPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const { locale } = useI18n();
  const [albums, setAlbums] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/albums');
      setAlbums((res.albums || []).filter((a: any) => a.kind === 'memory'));
    } catch {
      setAlbums([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <PageHead
        eyebrow="Yume Memories"
        title="Memories & anniversaries"
        subtitle="Albums of photographs, clips, letters and the dates that matter to your bond."
        actions={
          user ? (
            <Btn onClick={() => setDraft({ title: '', description: '', cover_url: '' })}>
              <Icon name="plus" size={16} /> New memory album
            </Btn>
          ) : null
        }
      />
      {albums === null ? (
        <Spinner />
      ) : albums.length === 0 ? (
        <Empty title="No memory albums" hint="Create one for an anniversary, a first meeting or a whole year." />
      ) : (
        <div className="card-grid album-grid">
          {albums.map((a) => (
            <Link key={a.id} to={`/memories/${a.id}`} className="album-card memory">
              <div className="album-cover">
                {a.cover_url ? <img src={mediaUrl(a.cover_url)} alt={a.title} loading="lazy" /> : <span>♡</span>}
              </div>
              <div className="album-body">
                <h3>{a.title}</h3>
                <small className="muted">{formatDate(a.created_at, locale)}</small>
              </div>
            </Link>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title="New memory album" onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Title" required>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Cover">
              <MediaUploader
                urls={draft.cover_url ? [draft.cover_url] : []}
                onChange={(urls) => setDraft({ ...draft, cover_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={2}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Btn>
              <Btn
                disabled={!draft.title?.trim()}
                onClick={async () => {
                  try {
                    const res = await api<any>('/albums', {
                      method: 'POST',
                      body: { ...draft, kind: 'memory', visibility: 'private' },
                    });
                    setDraft(null);
                    push('Memory album created', 'success');
                    load();
                  } catch (err) {
                    push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
                  }
                }}
              >
                Create
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------------------------- diary --------------------------------- */

export function DiaryPage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [entries, setEntries] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/diary');
      setEntries(res.entries || []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft?.title?.trim() && !draft?.content?.trim()) return;
    try {
      const body = {
        title: draft.title || 'Untitled',
        content: draft.content || '',
        mood: draft.mood || '',
        tags: splitTags(draft.tags).join(','),
        entry_date: draft.entry_date || new Date().toISOString().slice(0, 10),
      };
      if (draft.id) await api(`/diary/${draft.id}`, { method: 'PATCH', body });
      else await api('/diary', { method: 'POST', body });
      setDraft(null);
      load();
      push('Diary entry saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Private Diary"
        title="Your private diary"
        subtitle="Only you can read these pages unless you choose to share them."
        actions={
          <Btn
            onClick={() =>
              setDraft({ title: '', content: '', mood: '', tags: '', entry_date: new Date().toISOString().slice(0, 10) })
            }
          >
            <Icon name="plus" size={16} /> New entry
          </Btn>
        }
      />

      <div className="notice-card">
        <Icon name="lock" size={18} />
        <p className="small">
          Diary entries are stored with owner-only access checks on the server. They never appear in public feeds,
          explore or search.
        </p>
      </div>

      {entries === null ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <Empty title="Your diary is empty" hint="Write the first page of your private story." />
      ) : (
        <div className="timeline">
          {entries.map((entry) => (
            <article key={entry.id} className="panel timeline-item">
              <div className="timeline-date">{formatDate(entry.entry_date || entry.created_at, locale)}</div>
              <div className="timeline-body">
                <div className="row between">
                  <h3>{entry.title}</h3>
                  <div className="row tight">
                    {entry.mood ? <span className="chip rose">{entry.mood}</span> : null}
                    <button className="icon-btn" onClick={() => setDraft({ ...entry })}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={async () => {
                        if (!confirm('Delete this entry?')) return;
                        await api(`/diary/${entry.id}`, { method: 'DELETE' }).catch(() => undefined);
                        load();
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
                <p className="pre">{entry.content}</p>
                <div className="row wrap tight">
                  {splitTags(entry.tags).map((tag) => (
                    <span key={tag} className="chip tiny">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit entry' : 'New diary entry'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Title">
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <div className="grid-2">
              <Field label="Date">
                <input
                  type="date"
                  value={draft.entry_date || ''}
                  onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })}
                />
              </Field>
              <Field label="Mood">
                <input value={draft.mood || ''} onChange={(e) => setDraft({ ...draft, mood: e.target.value })} placeholder="moonlit" />
              </Field>
            </div>
            <Field label="Entry">
              <textarea
                rows={12}
                value={draft.content || ''}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </Field>
            <Field label="Tags" hint="Comma separated">
              <input
                value={Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags || ''}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn onClick={save}>{t('common.save')}</Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ------------------------------- communities ------------------------------- */

export function CommunitiesPage() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const { push } = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/communities');
      setItems(res.communities || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <PageHead
        eyebrow="Yume Communities"
        title="Communities"
        subtitle="Public and private spaces for ships, universes and creative circles."
        actions={
          user ? (
            <Btn onClick={() => setDraft({ name: '', description: '', cover_url: '', is_private: false, rules: '' })}>
              <Icon name="plus" size={16} /> New community
            </Btn>
          ) : null
        }
      />
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="No communities yet" hint="Create the first one for your fandom." />
      ) : (
        <div className="card-grid">
          {items.map((c) => (
            <Link key={c.id} to={`/communities/${c.id}`} className="community-card">
              <div className="community-cover">
                {c.cover_url ? <img src={mediaUrl(c.cover_url)} alt={c.name} loading="lazy" /> : <span>✧</span>}
              </div>
              <div className="community-body">
                <h3>
                  {c.name} {c.is_private ? <Icon name="lock" size={13} /> : null}
                </h3>
                <p className="muted small clamp-2">{c.description}</p>
                <small className="muted">
                  {c.member_count ?? c.members ?? 0} members
                </small>
              </div>
            </Link>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title="New community" onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Name" required>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Cover">
              <MediaUploader
                urls={draft.cover_url ? [draft.cover_url] : []}
                onChange={(urls) => setDraft({ ...draft, cover_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Rules">
              <textarea rows={3} value={draft.rules || ''} onChange={(e) => setDraft({ ...draft, rules: e.target.value })} />
            </Field>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={!!draft.is_private}
                onChange={(e) => setDraft({ ...draft, is_private: e.target.checked })}
              />
              <span>
                <strong>Private community</strong>
                <small>People must request access and a moderator approves them.</small>
              </span>
            </label>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Btn>
              <Btn
                disabled={!draft.name?.trim()}
                onClick={async () => {
                  try {
                    await api('/communities', { method: 'POST', body: draft });
                    setDraft(null);
                    load();
                    push('Community created', 'success');
                  } catch (err) {
                    push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
                  }
                }}
              >
                Create
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function CommunityPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { locale } = useI18n();
  const { push } = useToast();
  const [data, setData] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);
  const [post, setPost] = useState('');
  const [event, setEvent] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>(`/communities/${id}`);
      setData(res);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <div className="page"><Empty title="Community not found" hint="It may be private." /></div>;
  if (!data) return <Spinner />;

  const community = data.community || {};
  const posts = data.posts || [];
  const events = data.events || [];
  const members = data.members_list || community.members_list || [];
  const isMember = members.some((m: any) => (m.user_id || m.id) === user?.id) || community.role;
  const canModerate = ['owner', 'admin', 'moderator'].includes(community.role || '');

  return (
    <div className="page">
      <div className="community-hero">
        <div className="community-hero-cover">
          {community.cover_url ? <img src={mediaUrl(community.cover_url)} alt={community.name} /> : <span>✧</span>}
        </div>
        <div>
          <p className="eyebrow">Community</p>
          <h1>{community.name}</h1>
          <p className="muted">{community.description}</p>
          <div className="row tight">
            <span className="chip">{community.is_private ? 'Private' : 'Public'}</span>
            <span className="chip gold">{members.length} members</span>
            {user ? (
              <Btn
                size="sm"
                variant={isMember ? 'outline' : 'primary'}
                onClick={async () => {
                  await api(`/communities/${id}/${isMember ? 'leave' : 'join'}`, { method: 'POST' }).catch(() =>
                    push('Could not update membership', 'error'),
                  );
                  load();
                }}
              >
                {isMember ? 'Leave' : community.is_private ? 'Request access' : 'Join'}
              </Btn>
            ) : null}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>Posts</h2>
          {isMember ? (
            <div className="row">
              <input value={post} onChange={(e) => setPost(e.target.value)} placeholder="Share with the community…" />
              <Btn
                variant="outline"
                onClick={async () => {
                  if (!post.trim()) return;
                  await api(`/communities/${id}/posts`, { method: 'POST', body: { content: post.trim() } }).catch(() =>
                    push('Could not post', 'error'),
                  );
                  setPost('');
                  load();
                }}
              >
                Post
              </Btn>
            </div>
          ) : (
            <p className="muted small">Join this community to post.</p>
          )}
          <div className="community-posts">
            {posts.map((p: any) => (
              <article key={p.id} className="community-post">
                <Avatar src={p.avatar_url} name={p.display_name || p.username} size={34} />
                <div>
                  <strong>{p.display_name || p.username}</strong>
                  <p className="small">{p.content}</p>
                  <small className="muted">{timeAgo(p.created_at, locale)}</small>
                </div>
              </article>
            ))}
            {posts.length === 0 ? <p className="muted small">No posts yet.</p> : null}
          </div>
        </section>

        <aside className="panel">
          <div className="row between">
            <h2>Events</h2>
            {canModerate ? (
              <Btn size="sm" variant="outline" onClick={() => setEvent({ title: '', description: '', event_date: '' })}>
                <Icon name="plus" size={14} /> Event
              </Btn>
            ) : null}
          </div>
          {events.length === 0 ? <p className="muted small">No events scheduled.</p> : null}
          {events.map((e: any) => (
            <div key={e.id} className="event-row">
              <strong>{e.title}</strong>
              <small className="muted">{e.event_date ? formatDate(e.event_date, locale) : 'Date to be announced'}</small>
              {e.description ? <p className="small">{e.description}</p> : null}
            </div>
          ))}

          <h2>Rules</h2>
          <p className="pre small">{community.rules || 'No rules published yet.'}</p>

          <h2>Members</h2>
          <div className="people-list">
            {members.slice(0, 12).map((m: any) => (
              <Link key={m.user_id || m.id} to={`/u/${m.username}`} className="person-row compact">
                <Avatar src={m.avatar_url} name={m.display_name || m.username} size={30} />
                <span>
                  <strong>{m.display_name || m.username}</strong>
                  <small>
                    @{m.username} {m.role && m.role !== 'member' ? `· ${m.role}` : ''}
                  </small>
                </span>
              </Link>
            ))}
          </div>
        </aside>
      </div>

      {event ? (
        <Modal title="New event" onClose={() => setEvent(null)}>
          <div className="stack">
            <Field label="Title" required>
              <input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} />
            </Field>
            <Field label="Date">
              <input type="date" value={event.event_date} onChange={(e) => setEvent({ ...event, event_date: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={event.description}
                onChange={(e) => setEvent({ ...event, description: e.target.value })}
              />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setEvent(null)}>
                Cancel
              </Btn>
              <Btn
                disabled={!event.title?.trim()}
                onClick={async () => {
                  await api(`/communities/${id}/events`, { method: 'POST', body: event }).catch(() =>
                    push('Could not create event', 'error'),
                  );
                  setEvent(null);
                  load();
                }}
              >
                Create event
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
