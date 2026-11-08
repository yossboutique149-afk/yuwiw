import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorLabel, mediaUrl, useI18n, useToast } from '../lib/core';
import { Btn, Empty, Field, Modal, PageHead, Spinner, Tabs } from '../components/ui';

type Song = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  language: string;
  bpm: number;
  mood: string;
  durationSec: number;
  lyrics: string[];
  stream: string;
  download: string;
};

type PlaylistItem = {
  id: string;
  song_id: string | null;
  title: string;
  artist: string;
  source: 'yumera' | 'spotify' | 'external';
  url: string | null;
  position: number;
};

type Playlist = {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  dedication: string;
  visibility: 'public' | 'followers' | 'private';
  collaborative: number;
  items?: PlaylistItem[];
};

const LANGS: Record<string, string> = { es: 'Español', en: 'English', fr: 'Français', ja: '日本語' };

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MusicStudioPage() {
  const { locale } = useI18n();
  const { push } = useToast();

  const [tab, setTab] = useState('library');
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState('');
  const [genre, setGenre] = useState('');

  const [current, setCurrent] = useState<Song | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(180);
  const [volume, setVolume] = useState(0.9);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addTo, setAddTo] = useState<Song | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState(true);

  const [spotify, setSpotify] = useState<{ configured: boolean; required_env: string[]; note: string } | null>(null);
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [spotifyType, setSpotifyType] = useState('track');
  const [spotifyResults, setSpotifyResults] = useState<any[]>([]);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [spotifyEmbed, setSpotifyEmbed] = useState<string | null>(null);

  useEffect(() => {
    api<any>('/music/library')
      .then((res) => setSongs(res.songs || []))
      .catch(() => setSongs([]));
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      const res = await api<any>('/playlists');
      setPlaylists(res.playlists || []);
    } catch {
      setPlaylists([]);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    api<any>('/music/spotify/status')
      .then((res) => setSpotify(res))
      .catch(() => setSpotify({ configured: false, required_env: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'], note: '' }));
  }, []);

  const filtered = useMemo(() => {
    const list = songs || [];
    return list.filter((s) => {
      if (lang && s.language !== lang) return false;
      if (genre && s.genre !== genre) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q) ||
        s.mood.toLowerCase().includes(q)
      );
    });
  }, [songs, lang, genre, query]);

  const genres = useMemo(() => Array.from(new Set((songs || []).map((s) => s.genre))).sort(), [songs]);

  const play = useCallback((song: Song) => {
    setCurrent(song);
    setPlaying(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = mediaUrl(current.stream);
    audio.load();
    audio.volume = volume;
    const promise = audio.play();
    if (promise) promise.catch(() => setPlaying(false));
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().catch(() => undefined);
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const step = (dir: number) => {
    if (!filtered.length) return;
    const index = current ? filtered.findIndex((s) => s.id === current.id) : -1;
    const next = filtered[(index + dir + filtered.length) % filtered.length];
    play(next);
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setTime(value);
  };

  const createPlaylist = async (payload: {
    title: string;
    description: string;
    dedication: string;
    visibility: string;
    collaborative: boolean;
  }) => {
    try {
      await api('/playlists', {
        method: 'POST',
        body: {
          title: payload.title,
          description: payload.description,
          dedication: payload.dedication,
          visibility: payload.visibility,
          collaborative: payload.collaborative,
        },
      });
      setCreateOpen(false);
      loadPlaylists();
      push('Playlist created', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  const addSongTo = async (playlist: Playlist, song: Song) => {
    try {
      await api(`/playlists/${playlist.id}/items`, {
        method: 'POST',
        body: { song_id: song.id, title: song.title, artist: song.artist, source: 'yumera', url: song.stream },
      });
      setAddTo(null);
      loadPlaylists();
      if (activePlaylist?.id === playlist.id) {
        const res = await api<any>(`/playlists/${playlist.id}`);
        setActivePlaylist(res.playlist);
      }
      push('Added to playlist', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  const removeItem = async (item: PlaylistItem) => {
    await api(`/playlist-items/${item.id}`, { method: 'DELETE' }).catch(() => undefined);
    if (activePlaylist) {
      const res = await api<any>(`/playlists/${activePlaylist.id}`).catch(() => null);
      if (res) setActivePlaylist(res.playlist);
    }
    loadPlaylists();
  };

  const openPlaylist = async (id: string) => {
    try {
      const res = await api<any>(`/playlists/${id}`);
      setActivePlaylist(res.playlist);
    } catch {
      push('Playlist not available', 'error');
    }
  };

  const generateAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await api<any>('/playlists/ai', { method: 'POST', body: { prompt: aiPrompt.trim() } });
      setAiOpen(false);
      setAiPrompt('');
      loadPlaylists();
      if (res.playlist) setActivePlaylist(res.playlist);
      push('AI playlist created', 'success');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error';
      setAiError(
        code === 'ai_not_configured'
          ? 'The server has no AI provider configured. Add OPENAI_API_KEY (optionally OPENAI_BASE_URL and AI_MODEL) to the app environment to enable AI playlist curation.'
          : errorLabel(code, locale)
      );
    } finally {
      setAiBusy(false);
    }
  };

  const searchSpotify = async () => {
    if (!spotifyQuery.trim()) return;
    setSpotifyBusy(true);
    setSpotifyError(null);
    try {
      const res = await api<any>(
        `/music/spotify/search?q=${encodeURIComponent(spotifyQuery.trim())}&type=${spotifyType}`
      );
      setSpotifyResults(res.results || []);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error';
      setSpotifyResults([]);
      setSpotifyError(
        code === 'spotify_not_configured'
          ? 'Spotify search needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the app environment. Playback always happens in Spotify’s own player.'
          : errorLabel(code, locale)
      );
    } finally {
      setSpotifyBusy(false);
    }
  };

  const addSpotifyToPlaylist = async (result: any) => {
    if (!playlists.length) {
      push('Create a playlist first', 'error');
      return;
    }
    try {
      await api(`/playlists/${playlists[0].id}/items`, {
        method: 'POST',
        body: { title: result.title, artist: result.artist || '', source: 'spotify', url: result.url },
      });
      loadPlaylists();
      push('Saved to your first playlist', 'success');
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'error', locale), 'error');
    }
  };

  return (
    <div className="page music-page">
      <PageHead
        eyebrow="Music Studio"
        title="YumEra Original Library"
        subtitle="Twenty original songs written for this universe, in four languages — streamed from the server, with playlists, dedications and Spotify discovery."
        actions={
          <div className="row tight">
            <Btn variant="ghost" onClick={() => setAiOpen(true)}>
              AI playlist
            </Btn>
            <Btn onClick={() => setCreateOpen(true)}>New playlist</Btn>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'library', label: 'Library' },
          { id: 'playlists', label: 'Playlists' },
          { id: 'spotify', label: 'Spotify' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'library' ? (
        <>
          <div className="music-filters">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, artist, genre or mood"
            />
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="">All languages</option>
              {Object.entries(LANGS).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <select value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">All genres</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <span className="chip">{filtered.length} tracks</span>
          </div>

          {songs === null ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <Empty title="No tracks match" hint="Try another language or genre." />
          ) : (
            <div className="song-list">
              {filtered.map((song, i) => (
                <div key={song.id} className={`song-row${current?.id === song.id ? ' on' : ''}`}>
                  <button className="song-play" onClick={() => play(song)} title="Play">
                    {current?.id === song.id && playing ? '❚❚' : '▶'}
                  </button>
                  <div className="song-main">
                    <strong>{song.title}</strong>
                    <small className="muted">
                      {song.artist} · {song.genre} · {LANGS[song.language] || song.language}
                    </small>
                  </div>
                  <span className="chip tiny-chip">{song.bpm} BPM</span>
                  <span className="muted small song-mood">{song.mood}</span>
                  <span className="muted small">{fmt(song.durationSec)}</span>
                  <div className="row tight">
                    <button className="icon-btn" title="Add to playlist" onClick={() => setAddTo(song)}>
                      +
                    </button>
                    <a className="icon-btn" href={mediaUrl(song.download)} title="Download WAV">
                      ↓
                    </a>
                  </div>
                  <button
                    className="icon-btn"
                    title="Lyrics"
                    onClick={() => {
                      setCurrent(song);
                      setLyricsOpen(true);
                    }}
                  >
                    ≡
                  </button>
                  <span className="song-index">{String(i + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          )}

          {current ? (
            <section className="lyrics-panel">
              <div className="row between">
                <div>
                  <h3>{current.title}</h3>
                  <p className="muted small">
                    {current.artist} · {current.genre} · {current.mood}
                  </p>
                </div>
                <button className="icon-btn" onClick={() => setLyricsOpen((v) => !v)}>
                  {lyricsOpen ? '–' : '+'}
                </button>
              </div>
              {lyricsOpen ? (
                <div className="lyrics">
                  {current.lyrics.map((line, i) => (
                    <p key={i} className={line.startsWith('[') ? 'lyric-label' : 'lyric-line'}>
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'playlists' ? (
        <div className="playlist-layout">
          <div className="playlist-list">
            {playlists.length === 0 ? (
              <Empty title="No playlists yet" hint="Create one, or let AI curate from the original library." />
            ) : (
              playlists.map((p) => (
                <button
                  key={p.id}
                  className={`playlist-card${activePlaylist?.id === p.id ? ' on' : ''}`}
                  onClick={() => openPlaylist(p.id)}
                >
                  <div className="playlist-cover">
                    {p.cover_url ? <img src={mediaUrl(p.cover_url)} alt="" /> : <span>♪</span>}
                  </div>
                  <div>
                    <strong>{p.title}</strong>
                    <small className="muted block">
                      {(p.items?.length || 0)} tracks · {p.visibility}
                      {p.collaborative ? ' · collaborative' : ''}
                    </small>
                    {p.dedication ? <small className="muted block">for {p.dedication}</small> : null}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="playlist-detail">
            {!activePlaylist ? (
              <Empty title="Select a playlist" hint="Choose one on the left to see its tracks." />
            ) : (
              <>
                <div className="row between wrap">
                  <div>
                    <h3>{activePlaylist.title}</h3>
                    <p className="muted small">{activePlaylist.description}</p>
                  </div>
                  <div className="row tight">
                    <Btn
                      variant="ghost"
                      onClick={async () => {
                        const item = activePlaylist.items?.find((i) => i.url);
                        if (!item) return;
                        const song = (songs || []).find((s) => s.id === item.song_id);
                        if (song) play(song);
                        else if (item.url) window.open(item.url, '_blank', 'noopener');
                      }}
                    >
                      Play
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm('Delete this playlist?')) return;
                        await api(`/playlists/${activePlaylist.id}`, { method: 'DELETE' }).catch(() => undefined);
                        setActivePlaylist(null);
                        loadPlaylists();
                      }}
                    >
                      Delete
                    </Btn>
                  </div>
                </div>

                <div className="stack tight">
                  {(activePlaylist.items || []).length === 0 ? (
                    <p className="muted small">Empty playlist. Add tracks from the library.</p>
                  ) : (
                    (activePlaylist.items || []).map((item) => (
                      <div key={item.id} className="playlist-item">
                        <div>
                          <strong className="small">{item.title}</strong>
                          <small className="muted block">
                            {item.artist || 'Unknown artist'} · {item.source}
                          </small>
                        </div>
                        <div className="row tight">
                          {item.song_id ? (
                            <button
                              className="icon-btn"
                              onClick={() => {
                                const song = (songs || []).find((s) => s.id === item.song_id);
                                if (song) play(song);
                              }}
                            >
                              ▶
                            </button>
                          ) : item.url ? (
                            <a className="icon-btn" href={item.url} target="_blank" rel="noreferrer">
                              ↗
                            </a>
                          ) : null}
                          <button className="icon-btn danger" onClick={() => removeItem(item)}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Field label="Add a track">
                  <select
                    value=""
                    onChange={(e) => {
                      const song = (songs || []).find((s) => s.id === e.target.value);
                      if (song) addSongTo(activePlaylist, song);
                    }}
                  >
                    <option value="">Choose from the original library…</option>
                    {(songs || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} — {s.artist}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'spotify' ? (
        <div className="stack">
          <div className="notice">
            <strong>Spotify integration</strong>
            <p className="small">
              {spotify?.configured
                ? 'Connected. YumEra searches the official Spotify Web API and plays through Spotify’s own embed player — audio is never hosted here.'
                : 'Not configured yet. Add the credentials below to enable real Spotify search. Playback always stays inside Spotify.'}
            </p>
            {!spotify?.configured && spotify?.required_env?.length ? (
              <p className="tiny muted">Required environment: {spotify.required_env.join(', ')}</p>
            ) : null}
          </div>

          <div className="music-filters">
            <input
              value={spotifyQuery}
              onChange={(e) => setSpotifyQuery(e.target.value)}
              placeholder="Search an artist, song or album"
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchSpotify();
              }}
            />
            <select value={spotifyType} onChange={(e) => setSpotifyType(e.target.value)}>
              <option value="track">Tracks</option>
              <option value="artist">Artists</option>
              <option value="album">Albums</option>
            </select>
            <Btn onClick={searchSpotify} disabled={spotifyBusy}>
              {spotifyBusy ? 'Searching…' : 'Search'}
            </Btn>
          </div>

          {spotifyError ? <p className="form-error small">{spotifyError}</p> : null}

          <div className="spotify-results">
            {spotifyResults.map((r) => (
              <article key={r.id} className="spotify-card">
                {r.image ? <img src={r.image} alt="" /> : <div className="thumb-fallback" />}
                <div>
                  <strong className="small">{r.title}</strong>
                  <small className="muted block">{r.artist || r.album || ''}</small>
                </div>
                <div className="row tight">
                  {r.embed ? (
                    <Btn variant="ghost" onClick={() => setSpotifyEmbed(r.embed)}>
                      Play
                    </Btn>
                  ) : null}
                  <button className="icon-btn" title="Save to playlist" onClick={() => addSpotifyToPlaylist(r)}>
                    +
                  </button>
                </div>
              </article>
            ))}
          </div>

          {spotifyEmbed ? (
            <div className="spotify-embed">
              <iframe
                title="Spotify player"
                src={spotifyEmbed}
                width="100%"
                height="152"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
              <button className="icon-btn" onClick={() => setSpotifyEmbed(null)}>
                ✕
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {current ? (
        <div className="player-bar">
          <div className="player-song">
            <strong className="small">{current.title}</strong>
            <small className="muted">{current.artist}</small>
          </div>
          <div className="player-controls">
            <button className="icon-btn" onClick={() => step(-1)}>
              ⏮
            </button>
            <button className="player-toggle" onClick={toggle}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="icon-btn" onClick={() => step(1)}>
              ⏭
            </button>
          </div>
          <div className="player-progress">
            <span className="tiny">{fmt(time)}</span>
            <input
              type="range"
              min={0}
              max={duration || current.durationSec}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="tiny">{fmt(duration || current.durationSec)}</span>
          </div>
          <input
            className="player-volume"
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            title="Volume"
          />
          <audio
            ref={audioRef}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || current.durationSec)}
            onEnded={() => {
              setPlaying(false);
              step(1);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
      ) : null}

      {createOpen ? <CreatePlaylistModal onClose={() => setCreateOpen(false)} onCreate={createPlaylist} /> : null}

      {addTo ? (
        <Modal title={`Add “${addTo.title}” to a playlist`} onClose={() => setAddTo(null)}>
          {playlists.length === 0 ? (
            <p className="muted small">No playlists yet — create one first.</p>
          ) : (
            <div className="stack tight">
              {playlists.map((p) => (
                <button key={p.id} className="playlist-pick" onClick={() => addSongTo(p, addTo)}>
                  <strong>{p.title}</strong>
                  <small className="muted">{p.items?.length || 0} tracks</small>
                </button>
              ))}
            </div>
          )}
        </Modal>
      ) : null}

      {aiOpen ? (
        <Modal title="AI playlist curator" onClose={() => setAiOpen(false)}>
          <div className="stack">
            <p className="small muted">
              Describe a mood, a character or a moment. The curator picks tracks only from the twenty YumEra originals
              and saves the result as a private playlist.
            </p>
            <Field label="What should it feel like?">
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Late night with my F/O, soft and nostalgic, mostly Spanish"
              />
            </Field>
            {aiError ? <p className="form-error small">{aiError}</p> : null}
            <div className="row between">
              <Btn variant="ghost" onClick={() => setAiOpen(false)}>
                Cancel
              </Btn>
              <Btn onClick={generateAi} disabled={aiBusy || !aiPrompt.trim()}>
                {aiBusy ? 'Curating…' : 'Generate playlist'}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CreatePlaylistModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: { title: string; description: string; dedication: string; visibility: string; collaborative: boolean }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dedication, setDedication] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [collaborative, setCollaborative] = useState(false);

  return (
    <Modal title="New playlist" onClose={onClose}>
      <div className="stack">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Description">
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Dedication (F/O, yumesona…)">
          <input value={dedication} onChange={(e) => setDedication(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid-2">
          <Field label="Visibility">
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="private">Private</option>
              <option value="followers">Followers</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <label className="row tight small check-row">
            <input type="checkbox" checked={collaborative} onChange={(e) => setCollaborative(e.target.checked)} />
            Collaborative
          </label>
        </div>
        <div className="row between">
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={!title.trim()}
            onClick={() => onCreate({ title: title.trim(), description, dedication, visibility, collaborative })}
          >
            Create
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
