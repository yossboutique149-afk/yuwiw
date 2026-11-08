import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorLabel, mediaUrl, timeAgo, useI18n, useToast } from '../lib/core';
import { Avatar, Btn, Empty, Field, Icon, MediaUploader, Modal, PageHead, Spinner } from '../components/ui';

const emptyCharacter = {
  name: '',
  avatar_url: '',
  personality: '',
  bio: '',
  universe: '',
  story: '',
  speech_style: '',
  instructions: '',
  greeting: '',
  visibility: 'private',
};

function useAiStatus() {
  const [status, setStatus] = useState<{ configured: boolean; provider?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    api<any>('/ai/status')
      .then((res) => {
        if (!alive) return;
        const configured = Boolean(res.configured ?? res.enabled ?? res.provider);
        setStatus({ configured, provider: res.provider });
      })
      .catch(() => alive && setStatus({ configured: false }));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export function CharacterWorldPage() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const ai = useAiStatus();
  const [items, setItems] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<any>('/characters');
      setItems(res.characters || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft?.name?.trim()) return;
    try {
      if (draft.id) await api(`/characters/${draft.id}`, { method: 'PATCH', body: draft });
      else {
        const res = await api<any>('/characters', { method: 'POST', body: draft });
        const id = res.character?.id || res.id;
        setDraft(null);
        await load();
        if (id) navigate(`/characters/${id}`);
        return;
      }
      setDraft(null);
      await load();
      push('Character saved', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Character World"
        title="Characters"
        subtitle="Original characters with memory, voice and their own instructions."
        actions={
          <Btn onClick={() => setDraft({ ...emptyCharacter })}>
            <Icon name="plus" size={16} /> New character
          </Btn>
        }
      />

      {ai ? (
        <div className={`notice-card${ai.configured ? '' : ' warn'}`}>
          <Icon name={ai.configured ? 'sparkle' : 'lock'} size={18} />
          <p className="small">
            {ai.configured ? (
              <>
                <strong>AI connected.</strong> Character replies are generated on the server by the configured provider
                ({ai.provider || 'external provider'}). API keys never reach the browser.
              </>
            ) : (
              <>
                <strong>No AI provider configured.</strong> Characters, profiles and conversation history work and are
                stored, but replies cannot be generated until the server has an AI provider key. Nothing is simulated.
              </>
            )}
          </p>
        </div>
      ) : null}

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty
          title="No characters yet"
          hint="Create an original character and give it a voice."
          action={<Btn onClick={() => setDraft({ ...emptyCharacter })}>Create character</Btn>}
        />
      ) : (
        <div className="card-grid">
          {items.map((c) => (
            <article key={c.id} className="char-card">
              <Link to={`/characters/${c.id}`} className="char-avatar">
                <Avatar src={c.avatar_url} name={c.name} size={72} ring />
              </Link>
              <h3>{c.name}</h3>
              <small className="muted">{c.universe || 'Original universe'}</small>
              <p className="muted small clamp-2">{c.personality || c.bio}</p>
              <div className="row between tight">
                <span className="chip">{c.visibility}</span>
                <div className="row tight">
                  <button className="icon-btn" onClick={() => setDraft({ ...emptyCharacter, ...c })}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={async () => {
                      if (!confirm(`Delete ${c.name}?`)) return;
                      await api(`/characters/${c.id}`, { method: 'DELETE' }).catch(() => undefined);
                      load();
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit character' : 'New character'} onClose={() => setDraft(null)} wide>
          <div className="stack">
            <Field label="Name" required>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Avatar">
              <MediaUploader
                urls={draft.avatar_url ? [draft.avatar_url] : []}
                onChange={(urls) => setDraft({ ...draft, avatar_url: urls[0] || '' })}
                accept="image/*"
                max={1}
              />
            </Field>
            <div className="grid-2">
              <Field label="Universe">
                <input value={draft.universe || ''} onChange={(e) => setDraft({ ...draft, universe: e.target.value })} />
              </Field>
              <Field label="Visibility">
                <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </Field>
            </div>
            <Field label="Personality">
              <textarea
                rows={3}
                value={draft.personality || ''}
                onChange={(e) => setDraft({ ...draft, personality: e.target.value })}
              />
            </Field>
            <Field label="Biography">
              <textarea rows={3} value={draft.bio || ''} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </Field>
            <Field label="Story">
              <textarea rows={3} value={draft.story || ''} onChange={(e) => setDraft({ ...draft, story: e.target.value })} />
            </Field>
            <Field label="Speech style">
              <input
                value={draft.speech_style || ''}
                onChange={(e) => setDraft({ ...draft, speech_style: e.target.value })}
                placeholder="Soft, archaic, teasing…"
              />
            </Field>
            <Field label="Behaviour instructions" hint="Kept server-side and used for every reply">
              <textarea
                rows={3}
                value={draft.instructions || ''}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              />
            </Field>
            <Field label="Greeting">
              <textarea
                rows={2}
                value={draft.greeting || ''}
                onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
              />
            </Field>
            <div className="row between">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn onClick={save} disabled={!draft.name?.trim()}>
                {t('common.save')}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function CharacterChatPage() {
  const { id } = useParams();
  const { locale } = useI18n();
  const { push } = useToast();
  const ai = useAiStatus();
  const [character, setCharacter] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([
        api<any>(`/characters/${id}`),
        api<any>(`/characters/${id}/messages`).catch(() => ({ messages: [] })),
      ]);
      setCharacter(c.character || c);
      setMessages(m.messages || []);
    } catch {
      setCharacter(null);
      setMessages([]);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length]);

  if (!character) return <Spinner />;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    setMessages((prev) => [
      ...(prev || []),
      { id: `local-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() },
    ]);
    try {
      const res = await api<any>(`/characters/${id}/chat`, { method: 'POST', body: { content: text } });
      const reply = res.reply || res.message?.content || res.text;
      if (reply) {
        setMessages((prev) => [
          ...(prev || []),
          { id: `reply-${Date.now()}`, role: 'assistant', content: reply, created_at: new Date().toISOString() },
        ]);
      } else {
        await load();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      push(
        msg === 'ai_not_configured' || msg === 'AI_NOT_CONFIGURED'
          ? 'This server has no AI provider configured, so no reply was generated. Your message is stored in the conversation history.'
          : errorLabel(msg, locale),
        'error',
      );
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="char-chat-head">
        <Avatar src={character.avatar_url} name={character.name} size={56} ring />
        <div>
          <p className="eyebrow">{character.universe || 'Character World'}</p>
          <h1>{character.name}</h1>
          <p className="muted small">{character.speech_style || character.personality}</p>
        </div>
        <div className="row tight">
          <button
            className="icon-btn"
            title="Clear history"
            onClick={async () => {
              if (!confirm('Delete the conversation history with this character?')) return;
              await api(`/characters/${id}/messages`, { method: 'DELETE' }).catch(() => undefined);
              load();
            }}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>

      {ai && !ai.configured ? (
        <div className="notice-card warn">
          <Icon name="lock" size={18} />
          <p className="small">
            No AI provider is configured on this server. Messages are stored, but replies require an API key set in the
            server environment.
          </p>
        </div>
      ) : null}

      <div className="chat-scroll char-chat">
        {messages === null ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div className="chat-placeholder">
            <p>{character.greeting || `${character.name} is waiting for you.`}</p>
            <small>Start the conversation ✦</small>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`bubble-row${m.role === 'user' ? ' mine' : ''}`}>
              {m.role !== 'user' ? <Avatar src={character.avatar_url} name={character.name} size={30} /> : null}
              <div className="bubble">
                <p className="pre">{m.content}</p>
                <small>{timeAgo(m.created_at, locale)}</small>
              </div>
            </div>
          ))
        )}
        {busy ? <p className="muted small typing">{character.name} is writing…</p> : null}
        <div ref={bottom} />
      </div>

      <form className="chat-composer" onSubmit={send}>
        <div className="chat-input-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Speak with ${character.name}…`}
            maxLength={2000}
          />
          <Btn type="submit" disabled={busy || !draft.trim()}>
            <Icon name="send" size={18} />
          </Btn>
        </div>
      </form>

      {character.bio || character.story ? (
        <details className="panel char-lore">
          <summary>Character sheet</summary>
          <p className="pre">{character.bio}</p>
          <p className="pre">{character.story}</p>
        </details>
      ) : null}
    </div>
  );
}
