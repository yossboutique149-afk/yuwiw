import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorLabel, mediaUrl, timeAgo, uploadFiles, useAuth, useI18n, useToast } from '../lib/core';
import { Avatar, Btn, Empty, Field, Icon, Modal, PageHead, Spinner } from '../components/ui';

type Member = { id: string; username: string; display_name: string; avatar_url: string | null };
type Conversation = {
  id: string;
  title?: string | null;
  is_group?: number | boolean;
  members?: Member[];
  member_ids?: string[];
  last_message?: string | null;
  last_at?: string | null;
  unread?: number;
  created_at?: string;
};
type Message = {
  id: string;
  content: string;
  media?: string[] | string | null;
  created_at: string;
  sender?: Member;
  sender_id?: string;
  mine?: boolean;
};

const otherMembers = (conv: Conversation, meId?: string) =>
  (conv.members || []).filter((m) => m.id !== meId);

const convName = (conv: Conversation, meId?: string) => {
  if (conv.title) return conv.title;
  const others = otherMembers(conv, meId);
  if (!others.length) return 'Conversation';
  return others.map((m) => m.display_name || m.username).join(', ');
};

const parseMedia = (raw: Message['media']): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function MessagesPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const { t, locale } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<any[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api<any>('/conversations');
      setConversations(res.conversations || []);
    } catch {
      setConversations([]);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api<any>(`/conversations/${id}/messages`);
      setMessages(res.messages || []);
      await api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => undefined);
      refresh().catch(() => undefined);
    } catch {
      setMessages([]);
    }
  }, [id, refresh]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    setMessages(null);
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => loadMessages(), 12000);
    return () => clearInterval(timer);
  }, [id, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length]);

  const active = useMemo(() => conversations?.find((c) => c.id === id), [conversations, id]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!id || (!draft.trim() && !media.length)) return;
    setSending(true);
    try {
      await api(`/conversations/${id}/messages`, {
        method: 'POST',
        body: { content: draft.trim(), media },
      });
      setDraft('');
      setMedia([]);
      await loadMessages();
      loadConversations();
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    } finally {
      setSending(false);
    }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const urls = await uploadFiles(files);
      setMedia((prev) => [...prev, ...urls].slice(0, 4));
    } catch {
      push('Upload failed', 'error');
    }
  };

  const openNew = async () => {
    setNewOpen(true);
    try {
      const res = await api<any>('/explore');
      setPeople(res.users || []);
    } catch {
      setPeople([]);
    }
  };

  const startConversation = async () => {
    if (!selected.length) return;
    try {
      const res = await api<any>('/conversations', {
        method: 'POST',
        body: selected.length > 1
          ? { member_ids: selected, title: groupTitle || 'New group', is_group: true }
          : { user_id: selected[0] },
      });
      const convId = res.id || res.conversation?.id;
      setNewOpen(false);
      setSelected([]);
      setGroupTitle('');
      await loadConversations();
      if (convId) navigate(`/messages/${convId}`);
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  const searchPeople = async (value: string) => {
    setSearch(value);
    if (!value.trim()) return;
    try {
      const res = await api<any>(`/search?q=${encodeURIComponent(value.trim())}`);
      setPeople(res.users || []);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="page messages-page">
      <PageHead
        title={t('nav.messages')}
        subtitle="Private conversations, groups and shared images."
        actions={
          <Btn onClick={openNew}>
            <Icon name="plus" size={16} /> New
          </Btn>
        }
      />

      <div className={`messages-layout${id ? ' has-active' : ''}`}>
        <aside className="conv-list">
          {conversations === null ? (
            <Spinner />
          ) : conversations.length === 0 ? (
            <Empty title="No conversations" hint="Start a private conversation with a creator." />
          ) : (
            conversations.map((conv) => {
              const others = otherMembers(conv, user?.id);
              const avatar = others[0]?.avatar_url;
              const name = convName(conv, user?.id);
              return (
                <button
                  key={conv.id}
                  className={`conv-item${conv.id === id ? ' active' : ''}`}
                  onClick={() => navigate(`/messages/${conv.id}`)}
                >
                  {conv.is_group ? (
                    <span className="group-avatar">
                      <Icon name="users" size={20} />
                    </span>
                  ) : (
                    <Avatar src={avatar} name={name} size={44} ring />
                  )}
                  <span className="conv-text">
                    <strong>{name}</strong>
                    <small>{conv.last_message || 'No messages yet'}</small>
                  </span>
                  <span className="conv-meta">
                    {conv.last_at ? <small>{timeAgo(conv.last_at, locale)}</small> : null}
                    {conv.unread ? <em className="unread-pill">{conv.unread}</em> : null}
                  </span>
                </button>
              );
            })
          )}
        </aside>

        <section className="chat-panel">
          {!id ? (
            <div className="chat-placeholder">
              <div className="empty-star">✦</div>
              <p>Select a conversation</p>
              <small>Your private messages stay between you and the people you choose.</small>
            </div>
          ) : (
            <>
              <header className="chat-head">
                <button className="icon-btn chat-back" onClick={() => navigate('/messages')} aria-label="back">
                  <Icon name="logout" size={16} />
                </button>
                {active?.is_group ? (
                  <span className="group-avatar small">
                    <Icon name="users" size={16} />
                  </span>
                ) : (
                  <Avatar src={otherMembers(active || {}, user?.id)[0]?.avatar_url} name={convName(active || {}, user?.id)} size={36} />
                )}
                <div>
                  <strong>{active ? convName(active, user?.id) : 'Conversation'}</strong>
                  <small>
                    {active?.is_group
                      ? `${(active.members || []).length} members`
                      : `@${otherMembers(active || {}, user?.id)[0]?.username || ''}`}
                  </small>
                </div>
                {active && !active.is_group && otherMembers(active, user?.id)[0] ? (
                  <button
                    className="icon-btn"
                    title={t('common.block')}
                    onClick={async () => {
                      const other = otherMembers(active, user?.id)[0];
                      if (!confirm(`Block @${other.username}?`)) return;
                      await api(`/blocks/${other.id}`, { method: 'POST' }).catch(() => undefined);
                      push('User blocked', 'info');
                    }}
                  >
                    <Icon name="lock" size={16} />
                  </button>
                ) : null}
              </header>

              <div className="chat-scroll">
                {messages === null ? (
                  <Spinner />
                ) : messages.length === 0 ? (
                  <p className="chat-empty">Say hello ✦</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.mine ?? m.sender_id === user?.id ?? m.sender?.id === user?.id;
                    return (
                      <div key={m.id} className={`bubble-row${mine ? ' mine' : ''}`}>
                        {!mine ? <Avatar src={m.sender?.avatar_url} name={m.sender?.display_name} size={28} /> : null}
                        <div className="bubble">
                          {parseMedia(m.media).length ? (
                            <div className="bubble-media">
                              {parseMedia(m.media).map((url) => (
                                <a key={url} href={mediaUrl(url)} target="_blank" rel="noreferrer noopener">
                                  <img src={mediaUrl(url)} alt="" loading="lazy" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {m.content ? <p>{m.content}</p> : null}
                          <small>{timeAgo(m.created_at, locale)}</small>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <form className="chat-composer" onSubmit={send}>
                {media.length ? (
                  <div className="chat-attachments">
                    {media.map((url) => (
                      <span key={url}>
                        <img src={mediaUrl(url)} alt="" />
                        <button type="button" onClick={() => setMedia((prev) => prev.filter((u) => u !== url))}>
                          <Icon name="close" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="chat-input-row">
                  <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="attach">
                    <Icon name="image" size={18} />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message…"
                    maxLength={4000}
                  />
                  <Btn type="submit" disabled={sending || (!draft.trim() && !media.length)}>
                    <Icon name="send" size={18} />
                  </Btn>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => attach(e.target.files)} />
              </form>
            </>
          )}
        </section>
      </div>

      {newOpen ? (
        <Modal title="New conversation" onClose={() => setNewOpen(false)} wide>
          <div className="stack">
            <Field label={t('common.search')}>
              <input value={search} onChange={(e) => searchPeople(e.target.value)} placeholder="@username or name" />
            </Field>
            {selected.length > 1 ? (
              <Field label="Group name">
                <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Moonlit circle" maxLength={60} />
              </Field>
            ) : null}
            <div className="people-picker">
              {people.length === 0 ? <p className="muted small">Search for creators to message.</p> : null}
              {people.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    className={`person-row${on ? ' selected' : ''}`}
                    onClick={() => setSelected((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                  >
                    <Avatar src={p.avatar_url} name={p.display_name || p.username} size={36} />
                    <span>
                      <strong>{p.display_name || p.username}</strong>
                      <small>@{p.username}</small>
                    </span>
                    {on ? <Icon name="check" size={16} /> : null}
                  </button>
                );
              })}
            </div>
            <div className="row between">
              <small className="muted">{selected.length} selected</small>
              <Btn onClick={startConversation} disabled={!selected.length}>
                {selected.length > 1 ? 'Create group' : 'Open chat'}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
