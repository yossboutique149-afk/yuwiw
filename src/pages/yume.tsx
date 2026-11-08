import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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

const VISIBILITY = ['public', 'followers', 'private'] as const;
const RELATIONS = [
  'romantic',
  'platonic',
  'familial',
  'rival',
  'mentor',
  'companion',
  'other',
] as const;

function VisibilitySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Visibility">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {VISIBILITY.map((v) => (
          <option key={v} value={v}>
            {v === 'public' ? 'Public — everyone' : v === 'followers' ? 'Followers only' : 'Private — only me'}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ------------------------------- yumesonas -------------------------------- */

const emptyYumesona = {
  name: '',
  image_url: '',
  description: '',
  bio: '',
  personality: '',
  universe: '',
  story: '',
  relations: '',
  traits: '',
  visibility: 'public',
};

export function YumesonasPage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/yumesonas');
      setItems(res.yumesonas || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft?.name?.trim()) return;
    setSaving(true);
    try {
      const body = { ...draft, image_url: draft.image_url || null };
      if (draft.id) await api(`/yumesonas/${draft.id}`, { method: 'PATCH', body });
      else await api('/yumesonas', { method: 'POST', body });
      setDraft(null);
      await load();
      push('Yumesona saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (id: string) => {
    await api(`/yumesonas/${id}/duplicate`, { method: 'POST' }).catch(() => undefined);
    await load();
    push('Yumesona duplicated', 'info');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this yumesona permanently?')) return;
    await api(`/yumesonas/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await load();
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Yumesona Studio"
        title={t('nav.yumesonas')}
        subtitle="Your original characters, their worlds and their stories."
        actions={
          <Btn onClick={() => setDraft({ ...emptyYumesona })}>
            <Icon name="plus" size={16} /> New yumesona
          </Btn>
        }
      />

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty
          title="No yumesonas yet"
          hint="Create your first yumesona to start building your universe."
          action={<Btn onClick={() => setDraft({ ...emptyYumesona })}>Create yumesona</Btn>}
        />
      ) : (
        <div className="card-grid yume-grid">
          {items.map((y) => (
            <article key={y.id} className="yume-card">
              <Link to={`/yumesonas/${y.id}`} className="yume-card-media">
                {y.image_url ? (
                  <img src={mediaUrl(y.image_url)} alt={y.name} loading="lazy" />
                ) : (
                  <span className="yume-card-fallback">{y.name?.slice(0, 1)?.toUpperCase()}</span>
                )}
                <span className="chip">{y.visibility}</span>
              </Link>
              <div className="yume-card-body">
                <h3>{y.name}</h3>
                <p className="muted small">{y.universe || y.description || 'Original universe'}</p>
                <div className="row between tight">
                  <small className="muted">{formatDate(y.created_at, locale)}</small>
                  <div className="row tight">
                    <button className="icon-btn" title="Edit" onClick={() => setDraft({ ...y })}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="icon-btn" title="Duplicate" onClick={() => duplicate(y.id)}>
                      <Icon name="copy" size={15} />
                    </button>
                    <button className="icon-btn danger" title="Delete" onClick={() => remove(y.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit yumesona' : 'New yumesona'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Name" required>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Portrait or illustration">
              <MediaUploader
                urls={draft.image_url ? [draft.image_url] : []}
                onChange={(urls) => setDraft({ ...draft, image_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <Field label="Short description">
              <input
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                maxLength={200}
              />
            </Field>
            <div className="grid-2">
              <Field label="Universe">
                <input value={draft.universe || ''} onChange={(e) => setDraft({ ...draft, universe: e.target.value })} />
              </Field>
              <Field label="Traits" hint="Comma separated">
                <input value={draft.traits || ''} onChange={(e) => setDraft({ ...draft, traits: e.target.value })} />
              </Field>
            </div>
            <Field label="Biography">
              <textarea rows={3} value={draft.bio || ''} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </Field>
            <Field label="Personality">
              <textarea
                rows={3}
                value={draft.personality || ''}
                onChange={(e) => setDraft({ ...draft, personality: e.target.value })}
              />
            </Field>
            <Field label="Story">
              <textarea rows={4} value={draft.story || ''} onChange={(e) => setDraft({ ...draft, story: e.target.value })} />
            </Field>
            <Field label="Relations">
              <textarea
                rows={3}
                value={draft.relations || ''}
                onChange={(e) => setDraft({ ...draft, relations: e.target.value })}
              />
            </Field>
            <VisibilitySelect value={draft.visibility} onChange={(v) => setDraft({ ...draft, visibility: v })} />
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn onClick={save} disabled={saving || !draft.name?.trim()}>
                {saving ? 'Saving…' : t('common.save')}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function YumesonaPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { locale } = useI18n();
  const { push } = useToast();
  const [y, setY] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<any>(`/yumesonas/${id}`);
      setY(res.yumesona);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <div className="page"><Empty title="Yumesona not found" hint="It may be private." /></div>;
  if (!y) return <Spinner />;

  const owner = user?.id === y.user_id;

  return (
    <div className="page">
      <div className="yume-hero">
        <div className="yume-hero-art">
          {y.image_url ? <img src={mediaUrl(y.image_url)} alt={y.name} /> : <span>{y.name?.slice(0, 1)}</span>}
        </div>
        <div className="yume-hero-info">
          <p className="eyebrow">Yumesona</p>
          <h1>{y.name}</h1>
          <p className="muted">{y.description}</p>
          <div className="row wrap tight">
            {y.universe ? <span className="chip gold">{y.universe}</span> : null}
            <span className="chip">{y.visibility}</span>
            {String(y.traits || '')
              .split(',')
              .filter(Boolean)
              .slice(0, 6)
              .map((trait: string) => (
                <span key={trait} className="chip rose">
                  {trait.trim()}
                </span>
              ))}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>Biography</h2>
          <p className="pre">{y.bio || 'No biography yet.'}</p>
          <h2>Personality</h2>
          <p className="pre">{y.personality || '—'}</p>
          <h2>Story</h2>
          <p className="pre">{y.story || '—'}</p>
          <h2>Relations</h2>
          <p className="pre">{y.relations || '—'}</p>
        </section>

        <aside className="panel">
          <h2>Gallery</h2>
          {owner ? (
            <MediaUploader
              urls={[]}
              onChange={async (urls) => {
                const url = urls[urls.length - 1];
                if (!url) return;
                await api(`/yumesonas/${y.id}/gallery`, { method: 'POST', body: { url } }).catch(() =>
                  push('Could not add image', 'error'),
                );
                load();
              }}
              accept="image/*"
              max={1}
              label="Add to gallery"
            />
          ) : null}
          <div className="gallery-grid small">
            {(y.gallery || []).map((g: any) => (
              <figure key={g.id}>
                <img src={mediaUrl(g.url)} alt={g.caption || ''} loading="lazy" />
                {owner ? (
                  <button
                    className="icon-btn danger"
                    onClick={async () => {
                      await api(`/yumesonas/${y.id}/gallery/${g.id}`, { method: 'DELETE' }).catch(() => undefined);
                      load();
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                ) : null}
              </figure>
            ))}
          </div>
          {!(y.gallery || []).length ? <p className="muted small">No gallery images yet.</p> : null}
          <p className="muted small">Created {formatDate(y.created_at, locale)}</p>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------ F/O registry ------------------------------ */

const emptyFo = {
  name: '',
  source: '',
  portrait_url: '',
  yumesona_id: '',
  relation_type: 'romantic',
  description: '',
  preferences: '',
  anti_double_notes: '',
  anti_double_enabled: true,
  visibility: 'private',
};

export function FoRegistryPage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [yumesonas, setYumesonas] = useState<any[]>([]);
  const [draft, setDraft] = useState<any | null>(null);
  const [bond, setBond] = useState('');
  const [bondResults, setBondResults] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/fos');
      setItems(res.fos || []);
    } catch {
      setItems([]);
    }
    try {
      const ys = await api<any>('/yumesonas');
      setYumesonas(ys.yumesonas || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft?.name?.trim()) return;
    setSaving(true);
    try {
      const body = { ...draft, yumesona_id: draft.yumesona_id || null };
      if (draft.id) await api(`/fos/${draft.id}`, { method: 'PATCH', body });
      else await api('/fos', { method: 'POST', body });
      setDraft(null);
      await load();
      push('F/O saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setSaving(false);
    }
  };

  const searchBond = async () => {
    if (!bond.trim()) return;
    try {
      const res = await api<any>(`/bond/search?q=${encodeURIComponent(bond.trim())}`);
      setBondResults(res.results || []);
    } catch {
      setBondResults([]);
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="F/O Registry"
        title={t('nav.fo')}
        subtitle="Your fictional others, the bonds you keep and the family you build."
        actions={
          <Btn onClick={() => setDraft({ ...emptyFo })}>
            <Icon name="plus" size={16} /> Register F/O
          </Btn>
        }
      />

      <div className="notice-card">
        <Icon name="shield" size={18} />
        <p className="small">
          <strong>Anti-Double protection</strong> controls visibility and preferences inside YumEra: it hides your bond
          from public bond search and marks the relationship as exclusive to you. It cannot prevent other people from
          independently liking the same fictional character.
        </p>
      </div>

      <section className="panel">
        <h2>Bond search</h2>
        <p className="muted small">
          Find creators who share a bond with the same character. Only entries whose owner allowed discovery appear here.
        </p>
        <div className="row">
          <input value={bond} onChange={(e) => setBond(e.target.value)} placeholder="Character name" />
          <Btn variant="outline" onClick={searchBond}>
            {t('common.search')}
          </Btn>
        </div>
        {bondResults ? (
          bondResults.length ? (
            <div className="people-list">
              {bondResults.map((r) => (
                <Link key={r.id} to={`/fo/${r.id}`} className="person-row">
                  <Avatar src={r.portrait_url} name={r.name} size={36} />
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.source ? `${r.source} · ` : ''}@{r.username}
                    </small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted small">No discoverable bonds for that name.</p>
          )
        ) : null}
      </section>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty
          title="No F/O registered"
          hint="Register your fictional other to link portraits, memories and children."
          action={<Btn onClick={() => setDraft({ ...emptyFo })}>Register F/O</Btn>}
        />
      ) : (
        <div className="card-grid">
          {items.map((fo) => (
            <article key={fo.id} className="fo-card">
              <Link to={`/fo/${fo.id}`} className="fo-portrait">
                {fo.portrait_url ? (
                  <img src={mediaUrl(fo.portrait_url)} alt={fo.name} loading="lazy" />
                ) : (
                  <span>{fo.name?.slice(0, 1)}</span>
                )}
              </Link>
              <div className="fo-body">
                <h3>
                  {fo.name} {fo.anti_double ? <span className="chip gold tiny">Anti-Double</span> : null}
                </h3>
                <small className="muted">{fo.source || 'Original work'}</small>
                <span className="chip rose">{fo.relation_type}</span>
                <div className="row between tight">
                  <small className="muted">{(fo.children || []).length} children</small>
                  <div className="row tight">
                    <button className="icon-btn" onClick={() => setDraft({ ...emptyFo, ...fo })}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={async () => {
                        if (!confirm(`Delete ${fo.name}?`)) return;
                        await api(`/fos/${fo.id}`, { method: 'DELETE' }).catch(() => undefined);
                        load();
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit F/O' : 'Register F/O'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Character name" required>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Source work">
              <input
                value={draft.source || ''}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="Anime, game, novel or original universe"
              />
            </Field>
            <Field label="Portrait">
              <MediaUploader
                urls={draft.portrait_url ? [draft.portrait_url] : []}
                onChange={(urls) => setDraft({ ...draft, portrait_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <div className="grid-2">
              <Field label="Linked yumesona">
                <select
                  value={draft.yumesona_id || ''}
                  onChange={(e) => setDraft({ ...draft, yumesona_id: e.target.value })}
                >
                  <option value="">— none —</option>
                  {yumesonas.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Relation type">
                <select
                  value={draft.relation_type || 'romantic'}
                  onChange={(e) => setDraft({ ...draft, relation_type: e.target.value })}
                >
                  {RELATIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea
                rows={3}
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Preferences">
              <textarea
                rows={2}
                value={draft.preferences || ''}
                onChange={(e) => setDraft({ ...draft, preferences: e.target.value })}
              />
            </Field>
            <Field label="Anti-Double notes">
              <textarea
                rows={2}
                value={draft.anti_double_notes || ''}
                onChange={(e) => setDraft({ ...draft, anti_double_notes: e.target.value })}
              />
            </Field>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={!!draft.anti_double_enabled}
                onChange={(e) => setDraft({ ...draft, anti_double_enabled: e.target.checked })}
              />
              <span>
                <strong>Anti-Double protection</strong>
                <small>Hide this bond from bond search and mark it as exclusive to me.</small>
              </span>
            </label>
            <VisibilitySelect value={draft.visibility} onChange={(v) => setDraft({ ...draft, visibility: v })} />
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn onClick={save} disabled={saving || !draft.name?.trim()}>
                {saving ? 'Saving…' : t('common.save')}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function FoDetailPage() {
  const { id } = useParams();
  const { locale } = useI18n();
  const { push } = useToast();
  const [fo, setFo] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);
  const [child, setChild] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<any>(`/fos/${id}`);
      setFo(res.fo);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <div className="page"><Empty title="F/O not found" hint="It may be private." /></div>;
  if (!fo) return <Spinner />;

  const children = fo.children || [];

  const draftChild = async () => {
    setBusy(true);
    try {
      const res = await api<any>('/ai/child-draft', {
        method: 'POST',
        body: { fo_id: fo.id, yumesona_id: fo.yumesona_id || null },
      });
      const d = res.draft || {};
      setChild({
        name: d.name || `${fo.name} & ${fo.yumesona_name || 'Yumesona'} child`,
        traits: Array.isArray(d.traits) ? d.traits.join(', ') : d.traits || '',
        story: d.story || d.description || '',
        image_url: '',
      });
      push('AI draft generated — review before saving', 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      push(
        msg === 'ai_not_configured' || msg === 'AI_NOT_CONFIGURED'
          ? 'The AI provider is not configured on this server, so no draft was generated. You can still write the child manually.'
          : errorLabel(msg, locale),
        'error',
      );
      setChild({ name: '', traits: '', story: '', image_url: '' });
    } finally {
      setBusy(false);
    }
  };

  const saveChild = async () => {
    if (!child?.name?.trim()) return;
    await api(`/fos/${fo.id}/children`, { method: 'POST', body: child }).catch(() => push('Could not save child', 'error'));
    setChild(null);
    load();
  };

  return (
    <div className="page">
      <div className="fo-hero">
        <div className="fo-hero-art">
          {fo.portrait_url ? <img src={mediaUrl(fo.portrait_url)} alt={fo.name} /> : <span>{fo.name?.slice(0, 1)}</span>}
        </div>
        <div>
          <p className="eyebrow">Fictional other</p>
          <h1>{fo.name}</h1>
          <p className="muted">{fo.source || 'Original work'}</p>
          <div className="row wrap tight">
            <span className="chip rose">{fo.relation_type}</span>
            {fo.anti_double ? <span className="chip gold">Anti-Double</span> : null}
            {fo.yumesona_id ? (
              <Link className="chip" to={`/yumesonas/${fo.yumesona_id}`}>
                Linked yumesona
              </Link>
            ) : null}
            <span className="chip">{fo.visibility}</span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>Description</h2>
          <p className="pre">{fo.description || '—'}</p>
          <h2>Preferences</h2>
          <p className="pre">{fo.preferences || '—'}</p>
          {fo.anti_double_notes ? (
            <>
              <h2>Anti-Double notes</h2>
              <p className="pre">{fo.anti_double_notes}</p>
            </>
          ) : null}
        </section>

        <aside className="panel">
          <div className="row between">
            <h2>Our children</h2>
            <div className="row tight">
              <Btn size="sm" variant="outline" onClick={draftChild} disabled={busy}>
                <Icon name="sparkle" size={14} /> {busy ? 'Thinking…' : 'AI draft'}
              </Btn>
              <Btn size="sm" onClick={() => setChild({ name: '', traits: '', story: '', image_url: '' })}>
                <Icon name="plus" size={14} /> Manual
              </Btn>
            </div>
          </div>
          {children.length === 0 ? (
            <p className="muted small">No children registered yet. Create one from your bond with this character.</p>
          ) : (
            <div className="child-list">
              {children.map((c: any) => (
                <article key={c.id} className="child-card">
                  <Avatar src={c.image_url} name={c.name} size={44} ring />
                  <div>
                    <strong>{c.name}</strong>
                    {c.traits ? <small className="muted">{c.traits}</small> : null}
                    {c.story ? <p className="small pre">{c.story}</p> : null}
                    <small className="muted">{formatDate(c.created_at, locale)}</small>
                  </div>
                  <button
                    className="icon-btn danger"
                    onClick={async () => {
                      await api(`/fos/${fo.id}/children/${c.id}`, { method: 'DELETE' }).catch(() => undefined);
                      load();
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>

      {child ? (
        <Modal title="Child of your bond" onClose={() => setChild(null)} wide>
          <div className="stack">
            <p className="muted small">
              Drafts are stored only when you save them. AI drafts require a configured provider; manual entries always
              work.
            </p>
            <Field label="Name" required>
              <input value={child.name} onChange={(e) => setChild({ ...child, name: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Image">
              <MediaUploader
                urls={child.image_url ? [child.image_url] : []}
                onChange={(urls) => setChild({ ...child, image_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <Field label="Traits">
              <input value={child.traits} onChange={(e) => setChild({ ...child, traits: e.target.value })} />
            </Field>
            <Field label="Story">
              <textarea rows={5} value={child.story} onChange={(e) => setChild({ ...child, story: e.target.value })} />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setChild(null)}>
                Cancel
              </Btn>
              <Btn onClick={saveChild} disabled={!child.name?.trim()}>
                Save child
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------------------------- lore ---------------------------------- */

export function LorePage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [tab, setTab] = useState<'mine' | 'explore'>('mine');
  const [items, setItems] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [prompt, setPrompt] = useState('');

  const load = useCallback(async (which: 'mine' | 'explore') => {
    setItems(null);
    try {
      const res = await api<any>(which === 'mine' ? '/lore' : '/lore/public');
      setItems(res.lore || []);
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
        content: draft.content,
        tags: Array.isArray(draft.tags) ? draft.tags.join(',') : draft.tags || '',
        visibility: draft.visibility || 'private',
      };
      if (draft.id) await api(`/lore/${draft.id}`, { method: 'PATCH', body });
      else await api('/lore', { method: 'POST', body });
      setDraft(null);
      load(tab);
      push('Lore saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  const askAi = async () => {
    if (!prompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await api<any>('/ai/lore', { method: 'POST', body: { prompt: prompt.trim() } });
      setDraft((prev: any) => ({ ...(prev || { title: '', visibility: 'private' }), content: res.text || '' }));
      push('AI draft ready — edit and save', 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      push(
        msg === 'ai_not_configured' || msg === 'AI_NOT_CONFIGURED'
          ? 'No AI provider is configured on this server. You can write your lore manually.'
          : errorLabel(msg, locale),
        'error',
      );
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Yume Lore"
        title="The lore of your universe"
        subtitle="Keep the canon of your world: places, rules, timelines and secrets."
        actions={
          <Btn onClick={() => setDraft({ title: '', content: '', tags: '', visibility: 'private' })}>
            <Icon name="plus" size={16} /> New entry
          </Btn>
        }
      />

      <Tabs
        tabs={[
          { id: 'mine', label: 'My lore' },
          { id: 'explore', label: 'Public lore' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <section className="panel">
        <h2>AI lore assistant</h2>
        <p className="muted small">
          Draft lore with the configured AI provider. Nothing is stored until you save it, and no draft is invented when
          the server has no provider.
        </p>
        <div className="row">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a place, a ritual or a family line…"
          />
          <Btn variant="outline" onClick={askAi} disabled={aiBusy || !prompt.trim()}>
            {aiBusy ? 'Drafting…' : 'Draft with AI'}
          </Btn>
        </div>
      </section>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="No lore entries" hint="Write the first page of your universe." />
      ) : (
        <div className="lore-list">
          {items.map((entry) => (
            <article key={entry.id} className="panel lore-card">
              <div className="row between">
                <h3>{entry.title}</h3>
                <div className="row tight">
                  <span className="chip">{entry.visibility}</span>
                  {tab === 'mine' ? (
                    <>
                      <button className="icon-btn" onClick={() => setDraft({ ...entry })}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={async () => {
                          if (!confirm('Delete this lore entry?')) return;
                          await api(`/lore/${entry.id}`, { method: 'DELETE' }).catch(() => undefined);
                          load(tab);
                        }}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <p className="pre">{entry.content}</p>
              <div className="row wrap tight">
                {(entry.tags || []).map((tag: string) => (
                  <span key={tag} className="chip rose">
                    {tag}
                  </span>
                ))}
                <small className="muted">Updated {timeAgo(entry.updated_at || entry.created_at, locale)}</small>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit lore' : 'New lore entry'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Title" required>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Content">
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
            <VisibilitySelect value={draft.visibility || 'private'} onChange={(v) => setDraft({ ...draft, visibility: v })} />
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
