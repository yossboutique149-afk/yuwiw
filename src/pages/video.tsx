import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorLabel, mediaUrl, useI18n, useToast, uploadFiles } from '../lib/core';
import { Btn, Empty, Field, Modal, PageHead, Spinner } from '../components/ui';

type VScene = {
  id: string;
  url: string;
  text: string;
  caption: string;
  duration: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
};

type VData = {
  v: 1;
  ratio: 'square' | 'vertical' | 'horizontal';
  template: string;
  scenes: VScene[];
  songId?: string;
  title?: string;
  subtitle?: string;
};

const RATIOS: Record<string, [number, number]> = {
  square: [1080, 1080],
  vertical: [1080, 1350],
  horizontal: [1280, 720],
};

const TEMPLATES = [
  { id: 'romance', name: 'Romance', accent: '#e7a9c6', font: 'serif', transition: 'fade' as const },
  { id: 'cinematic', name: 'Cinematic', accent: '#e0b678', font: 'serif', transition: 'zoom' as const },
  { id: 'scrapbook', name: 'Scrapbook', accent: '#f3e3c8', font: 'sans', transition: 'slide' as const },
  { id: 'gothic', name: 'Gothic', accent: '#b98ad4', font: 'serif', transition: 'fade' as const },
  { id: 'pixel', name: 'Pixel', accent: '#6ee7d7', font: 'sans', transition: 'none' as const },
];

const uid = () => Math.random().toString(36).slice(2, 10);

const imgCache = new Map<string, HTMLImageElement>();

function image(src: string): HTMLImageElement | null {
  if (!src) return null;
  const hit = imgCache.get(src);
  if (hit && hit.complete && hit.naturalWidth) return hit;
  if (!hit) {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.src = src;
    imgCache.set(src, el);
    el.onload = () => window.dispatchEvent(new Event('yumera:video-image'));
    return el.complete && el.naturalWidth ? el : null;
  }
  return hit.complete && hit.naturalWidth ? hit : null;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  el: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  pan: number
) {
  const ratio = Math.max(w / el.naturalWidth, h / el.naturalHeight) * zoom;
  const dw = el.naturalWidth * ratio;
  const dh = el.naturalHeight * ratio;
  const dx = x + (w - dw) / 2 + pan * (w * 0.04);
  const dy = y + (h - dh) / 2;
  ctx.drawImage(el, dx, dy, dw, dh);
}

export function drawVideoFrame(ctx: CanvasRenderingContext2D, data: VData, time: number) {
  const [w, h] = RATIOS[data.ratio] || RATIOS.square;
  const template = TEMPLATES.find((t) => t.id === data.template) || TEMPLATES[0];
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0712';
  ctx.fillRect(0, 0, w, h);

  const scenes = data.scenes.length ? data.scenes : [];
  const total = scenes.reduce((sum, s) => sum + Math.max(0.6, s.duration), 0) || 1;
  const looped = time % total;
  let acc = 0;
  let index = 0;
  for (let i = 0; i < scenes.length; i++) {
    const d = Math.max(0.6, scenes[i].duration);
    if (looped < acc + d) {
      index = i;
      break;
    }
    acc += d;
  }
  const scene = scenes[index];
  const local = looped - acc;
  const dur = Math.max(0.6, scene?.duration || 3);
  const progress = Math.min(1, local / dur);
  const nextScene = scenes[(index + 1) % Math.max(1, scenes.length)];
  const transition = scene?.transition || template.transition;
  const switchAt = 0.78;
  const blend = transition !== 'none' && progress > switchAt ? (progress - switchAt) / (1 - switchAt) : 0;

  if (!scene) {
    ctx.fillStyle = template.accent;
    ctx.font = `600 ${w * 0.05}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Add photos to build your video', w / 2, h / 2);
    ctx.restore();
    return;
  }

  const drawScene = (s: VScene, alpha: number, offsetX: number, zoom: number, pan: number) => {
    ctx.globalAlpha = alpha;
    const el = image(mediaUrl(s.url));
    if (el) {
      drawCover(ctx, el, offsetX, 0, w, h, zoom, pan);
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#241033');
      g.addColorStop(1, '#07030c');
      ctx.fillStyle = g;
      ctx.fillRect(offsetX, 0, w, h);
    }
    // soft gradient for legibility
    const shade = ctx.createLinearGradient(0, h * 0.45, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = shade;
    ctx.fillRect(offsetX, h * 0.45, w, h * 0.55);

    if (s.text) {
      ctx.fillStyle = '#fdf6ef';
      ctx.font = `${template.font === 'serif' ? '600' : '700'} ${w * 0.055}px ${
        template.font === 'serif' ? 'Georgia, serif' : 'Inter, system-ui, sans-serif'
      }`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18;
      s.text.split('\n').forEach((line, i, all) => {
        ctx.fillText(line, offsetX + w / 2, h * 0.82 - (all.length - 1 - i) * w * 0.075);
      });
      ctx.shadowBlur = 0;
    }
    if (s.caption) {
      ctx.fillStyle = template.accent;
      ctx.font = `500 ${w * 0.028}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(s.caption, offsetX + w / 2, h * 0.89);
    }
    ctx.globalAlpha = 1;
  };

  if (transition === 'slide' && blend > 0 && nextScene) {
    drawScene(scene, 1, -blend * w, 1.04, progress);
    drawScene(nextScene, 1, (1 - blend) * w, 1.04, 0);
  } else if (transition === 'zoom' && blend > 0 && nextScene) {
    drawScene(scene, 1 - blend, 0, 1.02 + progress * 0.16, progress);
    drawScene(nextScene, blend, 0, 1.12, 0);
  } else if (transition === 'fade' && blend > 0 && nextScene) {
    drawScene(scene, 1 - blend, 0, 1.03 + progress * 0.08, progress);
    drawScene(nextScene, blend, 0, 1.02, 0);
  } else {
    drawScene(scene, 1, 0, 1.03 + progress * 0.09, progress);
  }

  // title overlay at the very start of the loop
  if (data.title && looped < 1.6 && scenes.length > 1) {
    const a = looped < 0.4 ? looped / 0.4 : Math.max(0, (1.6 - looped) / 0.6);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,4,10,0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = template.accent;
    ctx.font = `600 ${w * 0.07}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data.title, w / 2, h * 0.48);
    if (data.subtitle) {
      ctx.fillStyle = 'rgba(253,246,239,0.85)';
      ctx.font = `400 ${w * 0.03}px Inter, system-ui, sans-serif`;
      ctx.fillText(data.subtitle, w / 2, h * 0.55);
    }
    ctx.globalAlpha = 1;
  }

  // progress ticks
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(w * 0.05, h * 0.955, w * 0.9, 4);
  ctx.fillStyle = template.accent;
  ctx.fillRect(w * 0.05, h * 0.955, w * 0.9 * (looped / total), 4);

  ctx.restore();
}

export function VideoStudioPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { locale } = useI18n();
  const { push } = useToast();

  const [projects, setProjects] = useState<any[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(id || null);
  const [title, setTitle] = useState('Untitled video');
  const [data, setData] = useState<VData>({
    v: 1,
    ratio: 'vertical',
    template: 'romance',
    scenes: [],
    title: '',
    subtitle: '',
  });
  const [ready, setReady] = useState(!id);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [, bump] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clock = useRef(0);
  const raf = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const skipSave = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api<any>('/video/projects');
      setProjects(res.projects || []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    api<any>('/music/library')
      .then((res) => setSongs(res.songs || []))
      .catch(() => setSongs([]));
    const onImg = () => bump((n) => n + 1);
    window.addEventListener('yumera:video-image', onImg);
    return () => window.removeEventListener('yumera:video-image', onImg);
  }, [loadProjects]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<any>(`/video/projects/${id}`)
      .then((res) => {
        if (!alive) return;
        const p = res.project;
        setProjectId(p.id);
        setTitle(p.title);
        if (p.data && p.data.scenes) setData({ ...data, ...p.data });
        setReady(true);
        skipSave.current = true;
      })
      .catch(() => {
        if (alive) setReady(true);
        push('Video project not found', 'error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const total = Math.max(
    1,
    data.scenes.reduce((sum, s) => sum + Math.max(0.6, s.duration), 0)
  );

  // preview loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing) clock.current = (clock.current + dt) % total;
      drawVideoFrame(ctx, data, clock.current);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [data, playing, total]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const song = songs.find((s) => s.id === data.songId);
    if (song) {
      audio.src = mediaUrl(song.stream);
      audio.volume = 0.6;
      if (playing) audio.play().catch(() => undefined);
      else audio.pause();
    } else {
      audio.pause();
    }
  }, [data.songId, playing, songs]);

  useEffect(() => {
    if (!ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        if (projectId) {
          await api(`/video/projects/${projectId}`, { method: 'PATCH', body: { title, data } });
        } else {
          const res = await api<any>('/video/projects', { method: 'POST', body: { title, data } });
          if (res.project?.id) {
            setProjectId(res.project.id);
            window.history.replaceState(null, '', `/video/${res.project.id}`);
          }
        }
      } catch {
        /* autosave retries on next change */
      }
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [data, title, projectId, ready]);

  const updateScene = (sceneId: string, changes: Partial<VScene>) => {
    setData((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...changes } : s)),
    }));
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const urls = await uploadFiles(Array.from(files).slice(0, 12));
      setData((prev) => ({
        ...prev,
        scenes: [
          ...prev.scenes,
          ...urls.map((url) => ({
            id: uid(),
            url,
            text: '',
            caption: '',
            duration: 3,
            transition: 'fade' as const,
          })),
        ],
      }));
    } catch (err) {
      push(errorLabel(err instanceof Error ? err.message : 'upload_failed', locale), 'error');
    } finally {
      setBusy(false);
    }
  };

  const moveScene = (sceneId: string, dir: number) => {
    setData((prev) => {
      const scenes = [...prev.scenes];
      const i = scenes.findIndex((s) => s.id === sceneId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= scenes.length) return prev;
      [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
      return { ...prev, scenes };
    });
  };

  const exportVideo = async () => {
    setExportNote(null);
    if (!data.scenes.length) {
      setExportNote('Add at least one photo before exporting.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setExportNote(
        'This browser cannot record canvas video (MediaRecorder unavailable). You can still export the project as a storyboard, or open YumEra in a Chromium-based browser to record WebM.'
      );
      return;
    }
    setBusy(true);
    try {
      const [w, h] = RATIOS[data.ratio] || RATIOS.square;
      const outW = Math.min(720, w);
      const outH = Math.round((outW * h) / w);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_unavailable');

      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      if (!mime) throw new Error('recorder_unsupported');

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };

      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });

      recorder.start(200);
      const startedAt = performance.now();
      const limit = Math.min(60, total) * 1000;
      await new Promise<void>((resolve) => {
        const tick = () => {
          const elapsed = performance.now() - startedAt;
          drawVideoFrame(ctx, data, elapsed / 1000);
          if (elapsed >= limit) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      const blob = await done;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase()}.webm`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportNote(
        'Recorded a WebM clip in your browser. Sound is not mixed into the file — the preview soundtrack plays live only. Converting to MP4 needs ffmpeg on a server, which free hosting does not provide.'
      );
      push('Video exported as WebM', 'success');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'export_failed';
      setExportNote(
        code === 'recorder_unsupported'
          ? 'This browser has no supported WebM encoder. Try Chrome or Edge, or keep the project as a draft.'
          : 'Export failed in this browser. Your project is saved as a draft and can be exported elsewhere.'
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadStoryboard = () => {
    const blob = new Blob([JSON.stringify({ title, data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase()}-storyboard.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!ready) return <Spinner />;

  return (
    <div className="page video-page">
      <PageHead
        eyebrow="Video Studio"
        title="Yume Video"
        subtitle="Photos, captions, transitions and a soundtrack — assembled in a canvas timeline and recorded straight from your browser."
        actions={
          <div className="row tight">
            <Btn variant="ghost" onClick={() => navigate('/video')}>
              My videos
            </Btn>
            <Btn onClick={() => setExportOpen(true)} disabled={busy}>
              Export
            </Btn>
          </div>
        }
      />

      <div className="video-grid">
        <aside className="studio-panel">
          <div className="stack tight">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <div className="grid-2">
              <Field label="Format">
                <select
                  value={data.ratio}
                  onChange={(e) => setData({ ...data, ratio: e.target.value as VData['ratio'] })}
                >
                  <option value="square">Square</option>
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                </select>
              </Field>
              <Field label="Template">
                <select
                  value={data.template}
                  onChange={(e) => setData({ ...data, template: e.target.value })}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Opening title">
              <input value={data.title || ''} onChange={(e) => setData({ ...data, title: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Subtitle">
              <input
                value={data.subtitle || ''}
                onChange={(e) => setData({ ...data, subtitle: e.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="Soundtrack (YumEra originals)">
              <select value={data.songId || ''} onChange={(e) => setData({ ...data, songId: e.target.value || undefined })}>
                <option value="">No music</option>
                {songs.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.title} — {s.artist}
                  </option>
                ))}
              </select>
            </Field>
            <div className="upload-box">
              <label className="btn ghost block">
                <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
                Add photos
              </label>
              <small className="muted">Up to 12 images per upload. Stored in your own account.</small>
            </div>
            <Btn variant="ghost" onClick={downloadStoryboard}>
              Export storyboard JSON
            </Btn>
          </div>
        </aside>

        <section className="studio-stage">
          <div className="stage-toolbar">
            <button className="icon-btn" onClick={() => setPlaying((p) => !p)}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                clock.current = 0;
              }}
            >
              ↺
            </button>
            <span className="chip">{total.toFixed(1)}s</span>
            <span className="chip">{data.scenes.length} scenes</span>
            <span className="chip push-right">{data.template}</span>
          </div>

          <div
            className="canvas-wrap"
            style={{ aspectRatio: `${RATIOS[data.ratio][0]} / ${RATIOS[data.ratio][1]}`, maxWidth: 460 }}
          >
            <canvas
              ref={canvasRef}
              width={RATIOS[data.ratio][0]}
              height={RATIOS[data.ratio][1]}
              className="studio-canvas"
            />
          </div>
          <audio ref={audioRef} loop hidden />

          <div className="timeline">
            {data.scenes.length === 0 ? (
              <p className="muted small center">Add photos to start your timeline.</p>
            ) : (
              data.scenes.map((s, i) => (
                <button
                  key={s.id}
                  className={`timeline-scene${selectedScene === s.id ? ' on' : ''}`}
                  onClick={() => setSelectedScene(s.id)}
                >
                  <img src={mediaUrl(s.url)} alt="" />
                  <span>{i + 1}</span>
                  <small>{s.duration.toFixed(1)}s</small>
                </button>
              ))
            )}
          </div>

          {selectedScene ? (
            <div className="panel">
              {(() => {
                const scene = data.scenes.find((s) => s.id === selectedScene);
                if (!scene) return null;
                return (
                  <div className="stack tight">
                    <div className="grid-2">
                      <Field label="Text">
                        <textarea rows={2} value={scene.text} onChange={(e) => updateScene(scene.id, { text: e.target.value })} />
                      </Field>
                      <Field label="Caption">
                        <input value={scene.caption} onChange={(e) => updateScene(scene.id, { caption: e.target.value })} />
                      </Field>
                      <Field label={`Duration ${scene.duration.toFixed(1)}s`}>
                        <input
                          type="range"
                          min={10}
                          max={80}
                          value={Math.round(scene.duration * 10)}
                          onChange={(e) => updateScene(scene.id, { duration: Number(e.target.value) / 10 })}
                        />
                      </Field>
                      <Field label="Transition">
                        <select
                          value={scene.transition}
                          onChange={(e) => updateScene(scene.id, { transition: e.target.value as VScene['transition'] })}
                        >
                          <option value="fade">Fade</option>
                          <option value="slide">Slide</option>
                          <option value="zoom">Zoom</option>
                          <option value="none">None</option>
                        </select>
                      </Field>
                    </div>
                    <div className="row tight">
                      <Btn variant="ghost" onClick={() => moveScene(scene.id, -1)}>
                        ← Move
                      </Btn>
                      <Btn variant="ghost" onClick={() => moveScene(scene.id, 1)}>
                        Move →
                      </Btn>
                      <Btn
                        variant="ghost"
                        onClick={() => {
                          setData((prev) => ({ ...prev, scenes: prev.scenes.filter((s) => s.id !== scene.id) }));
                          setSelectedScene(null);
                        }}
                      >
                        Delete scene
                      </Btn>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel">
        <h3>Drafts</h3>
        {projects === null ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <Empty title="No saved videos yet" hint="Projects autosave while you edit." />
        ) : (
          <div className="video-drafts">
            {projects.map((p) => (
              <button key={p.id} className="video-draft" onClick={() => navigate(`/video/${p.id}`)}>
                <strong>{p.title}</strong>
                <small className="muted block">{new Date(p.updated_at).toLocaleDateString()}</small>
                <small className="muted">{p.data?.scenes?.length || 0} scenes</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {exportOpen ? (
        <Modal title="Export video" onClose={() => setExportOpen(false)}>
          <div className="stack">
            <p className="small muted">
              YumEra records the canvas in your browser with MediaRecorder. The result is a WebM file up to 60 seconds
              long. No server-side transcoding is used, so MP4 conversion is not available on this hosting plan.
            </p>
            <ul className="small muted bullets">
              <li>Video: WebM (VP9/VP8), 30 fps, up to 720 px wide.</li>
              <li>Audio: preview only — the soundtrack is not mixed into the recorded file.</li>
              <li>Drafts always stay saved even if recording fails.</li>
            </ul>
            {exportNote ? <p className="form-note small">{exportNote}</p> : null}
            <div className="row between">
              <Btn variant="ghost" onClick={downloadStoryboard}>
                Storyboard JSON
              </Btn>
              <Btn onClick={exportVideo} disabled={busy}>
                {busy ? 'Recording…' : 'Record WebM'}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function VideoHomePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[] | null>(null);

  useEffect(() => {
    api<any>('/video/projects')
      .then((res) => setProjects(res.projects || []))
      .catch(() => setProjects([]));
  }, []);

  return (
    <div className="page">
      <PageHead
        eyebrow="Video Studio"
        title="Yume Video"
        subtitle="Turn portraits and memories into short films."
        actions={<Btn onClick={() => navigate('/video/new')}>New video</Btn>}
      />
      {projects === null ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <Empty title="No videos yet" hint="Create your first project — it saves automatically." />
      ) : (
        <div className="video-drafts wide">
          {projects.map((p) => (
            <button key={p.id} className="video-draft" onClick={() => navigate(`/video/${p.id}`)}>
              <strong>{p.title}</strong>
              <small className="muted block">{p.data?.scenes?.length || 0} scenes</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
