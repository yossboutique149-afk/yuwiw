import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/core';
import { Btn, Empty, PageHead, Spinner } from '../components/ui';

export type GameMeta = {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  glyph: string;
  accent: string;
};

export const GAMES: GameMeta[] = [
  { id: 'starfall', name: 'Starfall Catch', tag: 'Reflex', blurb: 'Catch falling stars in your constellation basket.', glyph: '✦', accent: '#c9a2ff' },
  { id: 'memory', name: 'Yume Pairs', tag: 'Memory', blurb: 'Match the celestial pairs before time runs out.', glyph: '☾', accent: '#f3b6d0' },
  { id: 'tiles', name: 'Constellation Tiles', tag: 'Puzzle', blurb: 'Slide the numbered stars back into order.', glyph: '❖', accent: '#e8c27a' },
  { id: 'dash', name: 'Heart Dash', tag: 'Reflex', blurb: 'Leap over the thorns on a moonlit run.', glyph: '♡', accent: '#ff9ec4' },
  { id: 'orbit', name: 'Orbit Rings', tag: 'Timing', blurb: 'Tap when the ring aligns with the orbit gate.', glyph: '◎', accent: '#8fd9e8' },
  { id: 'constellation', name: 'Draw the Constellation', tag: 'Focus', blurb: 'Connect the stars in the right order.', glyph: '✧', accent: '#b9a7ff' },
  { id: 'scramble', name: 'Word Scramble', tag: 'Words', blurb: 'Unscramble words from the yume universe.', glyph: 'Aa', accent: '#f0cfa0' },
  { id: 'melody', name: 'Star Melody', tag: 'Memory', blurb: 'Repeat the chiming sequence as it grows.', glyph: '♪', accent: '#a8e6cf' },
  { id: 'slice', name: 'Ribbon Slice', tag: 'Reflex', blurb: 'Cut the floating ribbons before they drift away.', glyph: '⟡', accent: '#ffb3c8' },
  { id: 'rune', name: 'Rune Code', tag: 'Logic', blurb: 'Break the four-rune code with limited guesses.', glyph: 'ᛟ', accent: '#c0b0ff' },
  { id: 'crystal', name: 'Crystal Tap', tag: 'Reflex', blurb: 'Tap the glowing crystals before they fade.', glyph: '◆', accent: '#9fe0ff' },
  { id: 'maze', name: 'Mirror Maze', tag: 'Puzzle', blurb: 'Escape the mirrored corridors with arrow keys.', glyph: '⌘', accent: '#d4b8ff' },
  { id: 'tempo', name: 'Tempo of Hearts', tag: 'Rhythm', blurb: 'Tap on the beat as the pulse tightens.', glyph: '♥', accent: '#ff9fb8' },
  { id: 'odd', name: 'Find the Odd Star', tag: 'Focus', blurb: 'Spot the one symbol that does not belong.', glyph: '✷', accent: '#ffd8a8' },
  { id: 'bubbles', name: 'Bubble Reverie', tag: 'Reflex', blurb: 'Pop rising bubbles for points and combos.', glyph: '○', accent: '#a7f3e0' },
  { id: 'arrows', name: 'Arrow Echo', tag: 'Reflex', blurb: 'Press the arrow that appears, faster each round.', glyph: '➤', accent: '#b8d4ff' },
  { id: 'math', name: 'Number Rush', tag: 'Logic', blurb: 'Solve as many sums as you can in 60 seconds.', glyph: '∑', accent: '#e6c3ff' },
  { id: 'pattern', name: 'Starlight Pattern', tag: 'Memory', blurb: 'Memorise the lit grid and repeat it.', glyph: '▦', accent: '#c9e8a0' },
  { id: 'feather', name: 'Feather Balance', tag: 'Timing', blurb: 'Stop the feather inside the golden band.', glyph: '❧', accent: '#f0d9a8' },
  { id: 'trivia', name: 'Yume Trivia', tag: 'Knowledge', blurb: 'Ten questions about yumeshipping culture.', glyph: '?', accent: '#d8b4fe' },
];

/* ---------------------------------- utils --------------------------------- */

function useLoop(active: boolean, fn: (dt: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ref.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

function Hud({ score, extra }: { score: number; extra?: React.ReactNode }) {
  return (
    <div className="game-hud">
      <span className="chip">Score <strong>{score}</strong></span>
      {extra}
    </div>
  );
}

function useTicker(active: boolean, seconds: number, onDone: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    const t = window.setInterval(() => {
      const rem = Math.max(0, seconds - (performance.now() - started) / 1000);
      setLeft(rem);
      if (rem <= 0) {
        window.clearInterval(t);
        done.current();
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [active, seconds]);
  return left;
}

type GameProps = { onEnd: (score: number) => void };

/* --------------------------------- 1 starfall ------------------------------ */

function Starfall({ onEnd }: GameProps) {
  const basket = useRef(50);
  const stars = useRef<{ x: number; y: number; v: number; id: number }[]>([]);
  const spawn = useRef(0);
  const score = useRef(0);
  const lives = useRef(3);
  const nextId = useRef(1);
  const [state, setState] = useState({ s: 0, l: 3, tick: 0 });
  const box = useRef<HTMLDivElement | null>(null);

  useLoop(true, (dt) => {
    spawn.current += dt;
    if (spawn.current > 0.65) {
      spawn.current = 0;
      stars.current.push({ x: 5 + Math.random() * 90, y: -6, v: 18 + Math.random() * 16, id: nextId.current++ });
    }
    const survivors: typeof stars.current = [];
    for (const st of stars.current) {
      st.y += st.v * dt;
      if (st.y > 88 && st.y < 96) {
        if (Math.abs(st.x - basket.current) < 9) {
          score.current += 10;
        } else {
          lives.current -= 1;
        }
        continue;
      }
      if (st.y >= 96) {
        lives.current -= 1;
        continue;
      }
      survivors.push(st);
    }
    stars.current = survivors;
    if (lives.current <= 0) {
      onEnd(score.current);
      return;
    }
    setState({ s: score.current, l: lives.current, tick: Math.random() });
  });

  const move = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    basket.current = Math.max(4, Math.min(96, ((clientX - rect.left) / rect.width) * 100));
  };

  return (
    <div
      className="game-stage starfall"
      ref={box}
      onPointerMove={(e) => move(e.clientX)}
      onPointerDown={(e) => move(e.clientX)}
    >
      <Hud score={state.s} extra={<span className="chip">Lives {state.l}</span>} />
      {stars.current.map((st) => (
        <span key={st.id} className="falling-star" style={{ left: `${st.x}%`, top: `${st.y}%` }}>
          ✦
        </span>
      ))}
      <div className="basket" style={{ left: `${basket.current}%` }}>
        ⏜
      </div>
    </div>
  );
}

/* --------------------------------- 2 memory -------------------------------- */

const PAIR_GLYPHS = ['✦', '☾', '❖', '♡', '✧', '♪', '◆', '✷'];

function Memory({ onEnd }: GameProps) {
  const [cards] = useState(() => {
    const deck = [...PAIR_GLYPHS, ...PAIR_GLYPHS]
      .map((g, i) => ({ g, id: i, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map((c, i) => ({ ...c, id: i, face: false, done: false }));
    return deck;
  });
  const [deck, setDeck] = useState(cards);
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const finished = useRef(false);
  const left = useTicker(true, 90, () => {
    if (!finished.current) {
      finished.current = true;
      onEnd(Math.max(0, 200 - moves * 8));
    }
  });

  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open;
    const t = window.setTimeout(() => {
      setDeck((prev) => {
        const match = prev[a].g === prev[b].g;
        const next = prev.map((c, i) =>
          i === a || i === b ? { ...c, face: match ? true : false, done: match ? true : c.done } : c
        );
        if (match && next.every((c) => c.done) && !finished.current) {
          finished.current = true;
          onEnd(Math.max(0, 400 - moves * 10));
        }
        return next;
      });
      setOpen([]);
    }, 550);
    return () => window.clearTimeout(t);
  }, [open, moves, onEnd]);

  return (
    <div className="game-stage">
      <Hud score={moves} extra={<span className="chip">Time {left.toFixed(0)}s</span>} />
      <div className="memory-grid">
        {deck.map((c, i) => (
          <button
            key={c.id}
            className={`memory-card${c.face || c.done ? ' face' : ''}${c.done ? ' done' : ''}`}
            onClick={() => {
              if (c.face || c.done || open.length === 2) return;
              setDeck((prev) => prev.map((x, j) => (i === j ? { ...x, face: true } : x)));
              setOpen((prev) => [...prev, i]);
              setMoves((m) => m + 1);
            }}
          >
            {c.face || c.done ? c.g : ''}
          </button>
        ))}
      </div>
      <p className="muted small center">Moves: {moves}</p>
    </div>
  );
}

/* ---------------------------------- 3 tiles -------------------------------- */

function Tiles({ onEnd }: GameProps) {
  const [board, setBoard] = useState<number[]>(() => {
    const b = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    for (let i = 0; i < 60; i++) {
      const z = b.indexOf(0);
      const opts = [z - 1, z + 1, z - 3, z + 3].filter((n, idx, arr) => {
        if (n < 0 || n > 8) return false;
        if (idx === 0 && z % 3 === 0) return false;
        if (n === z + 1 && z % 3 === 2) return false;
        return true;
      });
      const pick = opts[Math.floor(Math.random() * opts.length)];
      [b[z], b[pick]] = [b[pick], b[z]];
    }
    return b;
  });
  const [moves, setMoves] = useState(0);
  const done = useRef(false);

  const slide = (i: number) => {
    const z = board.indexOf(0);
    const ok = (i === z - 1 && Math.floor(i / 3) === Math.floor(z / 3)) || (i === z + 1 && Math.floor(i / 3) === Math.floor(z / 3)) || i === z - 3 || i === z + 3;
    if (!ok) return;
    const next = [...board];
    [next[i], next[z]] = [next[z], next[i]];
    setBoard(next);
    setMoves((m) => m + 1);
    if (next.join() === '1,2,3,4,5,6,7,8,0' && !done.current) {
      done.current = true;
      window.setTimeout(() => onEnd(Math.max(50, 600 - moves * 6)), 300);
    }
  };

  return (
    <div className="game-stage">
      <Hud score={moves} extra={<span className="chip">Slide the stars</span>} />
      <div className="tile-grid">
        {board.map((n, i) => (
          <button key={i} className={`tile${n === 0 ? ' empty' : ''}`} onClick={() => slide(i)}>
            {n || ''}
          </button>
        ))}
      </div>
      <p className="muted small center">Moves: {moves}</p>
    </div>
  );
}

/* ---------------------------------- 4 dash --------------------------------- */

function Dash({ onEnd }: GameProps) {
  const [y, setY] = useState(0);
  const [obstacles, setObstacles] = useState<{ id: number; x: number; h: number }[]>([]);
  const vy = useRef(0);
  const posY = useRef(0);
  const obstaclesRef = useRef<{ id: number; x: number; h: number }[]>([]);
  const timer = useRef(0);
  const score = useRef(0);
  const nextId = useRef(1);
  const speed = useRef(38);
  const over = useRef(false);

  const jump = useCallback(() => {
    if (posY.current <= 0.5) vy.current = 62;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  useLoop(true, (dt) => {
    if (over.current) return;
    vy.current -= 150 * dt;
    posY.current = Math.max(0, posY.current + vy.current * dt);
    if (posY.current === 0) vy.current = 0;
    timer.current += dt;
    score.current += dt * 6;
    if (timer.current > 1.5) {
      timer.current = 0;
      obstaclesRef.current.push({ id: nextId.current++, x: 106, h: 12 + Math.random() * 14 });
      speed.current = Math.min(70, speed.current + 1.6);
    }
    const list = obstaclesRef.current;
    for (const o of list) o.x -= speed.current * dt;
    obstaclesRef.current = list.filter((o) => o.x > -12);
    for (const o of obstaclesRef.current) {
      if (o.x < 16 && o.x > 2 && posY.current < o.h) {
        over.current = true;
        onEnd(Math.floor(score.current));
      }
    }
    setY(posY.current);
    setObstacles([...obstaclesRef.current]);
  });

  return (
    <div className="game-stage dash" onPointerDown={jump}>
      <Hud score={Math.floor(score.current)} extra={<span className="chip">Space / tap to jump</span>} />
      <div className="dash-ground" />
      <div className="dash-player" style={{ bottom: `${8 + y * 0.55}%` }}>
        ♡
      </div>
      {obstacles.map((o) => (
        <div key={o.id} className="dash-thorn" style={{ left: `${o.x}%`, height: `${o.h}%` }} />
      ))}
    </div>
  );
}

/* --------------------------------- 5 orbit --------------------------------- */

function Orbit({ onEnd }: GameProps) {
  const [angle, setAngle] = useState(0);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(0);
  const [speed, setSpeed] = useState(120);
  const a = useRef(0);
  const dir = useRef(1);
  const zone = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    zone.current = Math.random() * 360;
  }, []);

  useLoop(!stopped.current, (dt) => {
    a.current = (a.current + speed * dir.current * dt) % 360;
    setAngle(a.current);
  });

  const diff = Math.min(Math.abs(((angle - zone.current + 540) % 360) - 180), 180);

  const tap = () => {
    if (diff < 18) {
      setScore((s) => s + 10);
      setSpeed((sp) => Math.min(320, sp + 14));
      zone.current = Math.random() * 360;
      dir.current = Math.random() > 0.5 ? 1 : -1;
    } else {
      const m = miss + 1;
      setMiss(m);
      if (m >= 3) {
        stopped.current = true;
        onEnd(score);
      }
    }
  };

  return (
    <div className="game-stage orbit" onPointerDown={tap}>
      <Hud score={score} extra={<span className="chip">Misses {miss}/3</span>} />
      <div className="orbit-ring">
        <div className="orbit-zone" style={{ transform: `rotate(${zone.current}deg)` }}>
          <span />
        </div>
        <div className="orbit-dot" style={{ transform: `rotate(${angle}deg) translateY(-96px)` }} />
        <div className="orbit-core">◎</div>
      </div>
      <p className="muted small center">Tap when the star crosses the gate.</p>
    </div>
  );
}

/* ------------------------------ 6 constellation ---------------------------- */

function Constellation({ onEnd }: GameProps) {
  const points = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ x: 8 + (i % 3) * 40 + Math.random() * 8, y: 8 + Math.floor(i / 3) * 38 + Math.random() * 8, n: i + 1 })),
    []
  );
  const [next, setNext] = useState(1);
  const [errors, setErrors] = useState(0);
  const [score, setScore] = useState(0);
  const started = useRef(performance.now());

  const click = (n: number) => {
    if (n !== next) {
      const e = errors + 1;
      setErrors(e);
      if (e >= 3) onEnd(score);
      return;
    }
    const gained = 15 + Math.max(0, 30 - Math.floor((performance.now() - started.current) / 1000));
    setScore((s) => s + gained);
    if (next === 9) {
      onEnd(score + gained);
      return;
    }
    setNext(n + 1);
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Next star {next}</span>} />
      <div className="constellation-box">
        {points.map((p) => (
          <button
            key={p.n}
            className={`star-node${p.n < next ? ' lit' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={() => click(p.n)}
          >
            {p.n < next ? '✦' : '·'}
          </button>
        ))}
      </div>
      <p className="muted small center">Errors {errors}/3</p>
    </div>
  );
}

/* -------------------------------- 7 scramble ------------------------------- */

const WORDS: [string, string][] = [
  ['yumesona', 'Your original self-insert persona'],
  ['selfship', 'Romantic pairing with a fictional character'],
  ['fictional', 'A character who is not real'],
  ['constellation', 'A pattern of stars'],
  ['portrait', 'A drawn or photographed likeness'],
  ['universe', 'A whole story world'],
  ['devotion', 'Deep affection'],
  ['eternal', 'Forever, without end'],
  ['celestial', 'Belonging to the sky'],
  ['serenade', 'A song sung at night'],
];

function shuffleWord(w: string) {
  const arr = w.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const out = arr.join('');
  return out === w ? shuffleWord(w) : out;
}

function Scramble({ onEnd }: GameProps) {
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState('');
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState('');
  const word = WORDS[index % WORDS.length];
  const scrambled = useMemo(() => shuffleWord(word[0]), [index]);
  const left = useTicker(true, 75, () => onEnd(score));

  const submit = () => {
    if (guess.trim().toLowerCase() === word[0]) {
      const gained = 20 + Math.max(0, 25 - Math.floor(guess.length / 2));
      setScore((s) => s + gained);
      setMsg('Correct ✦');
      setGuess('');
      if (index + 1 >= WORDS.length) {
        onEnd(score + gained);
        return;
      }
      setIndex(index + 1);
    } else {
      setMsg('Not quite — try again');
      setScore((s) => Math.max(0, s - 5));
    }
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Time {left.toFixed(0)}s</span>} />
      <div className="scramble">
        <p className="scramble-word">{scrambled.toUpperCase()}</p>
        <p className="muted small">{word[1]}</p>
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Your answer"
          autoFocus
        />
        <div className="row tight">
          <Btn onClick={submit}>Check</Btn>
          <Btn
            variant="ghost"
            onClick={() => {
              setIndex((i) => i + 1);
              setGuess('');
              setMsg('');
            }}
          >
            Skip
          </Btn>
        </div>
        <p className="form-note small">{msg}</p>
      </div>
    </div>
  );
}

/* --------------------------------- 8 melody -------------------------------- */

function Melody({ onEnd }: GameProps) {
  const pads = ['♪', '♫', '✧', '❉'];
  const [seq, setSeq] = useState<number[]>([Math.floor(Math.random() * 4)]);
  const [phase, setPhase] = useState<'show' | 'input'>('show');
  const [flash, setFlash] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (phase !== 'show') return;
    let i = 0;
    const timers: number[] = [];
    const step = () => {
      if (i >= seq.length) {
        setPhase('input');
        setCursor(0);
        return;
      }
      setFlash(seq[i]);
      timers.push(window.setTimeout(() => setFlash(null), 330));
      i++;
      timers.push(window.setTimeout(step, 520));
    };
    timers.push(window.setTimeout(step, 350));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, seq]);

  const press = (i: number) => {
    if (phase !== 'input') return;
    if (i === seq[cursor]) {
      if (cursor + 1 === seq.length) {
        const gained = seq.length * 15;
        setScore((s) => s + gained);
        setSeq((prev) => [...prev, Math.floor(Math.random() * 4)]);
        setPhase('show');
      } else {
        setCursor((c) => c + 1);
      }
    } else {
      onEnd(score);
    }
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Length {seq.length}</span>} />
      <div className="melody-pads">
        {pads.map((p, i) => (
          <button key={i} className={`pad${flash === i ? ' on' : ''}`} onClick={() => press(i)}>
            {p}
          </button>
        ))}
      </div>
      <p className="muted small center">{phase === 'show' ? 'Watch the sequence…' : 'Repeat it.'}</p>
    </div>
  );
}

/* --------------------------------- 9 slice --------------------------------- */

function Slice({ onEnd }: GameProps) {
  const items = useRef<{ id: number; x: number; y: number; v: number; hue: number }[]>([]);
  const nextId = useRef(1);
  const spawn = useRef(0);
  const score = useRef(0);
  const missed = useRef(0);
  const [, setFrame] = useState(0);
  const left = useTicker(true, 50, () => onEnd(score.current));

  useLoop(true, (dt) => {
    spawn.current += dt;
    if (spawn.current > 0.5) {
      spawn.current = 0;
      items.current.push({ id: nextId.current++, x: 8 + Math.random() * 84, y: 105, v: 22 + Math.random() * 18, hue: Math.random() * 360 });
    }
    const survivors: typeof items.current = [];
    for (const it of items.current) {
      it.y -= it.v * dt;
      if (it.y < -8) {
        missed.current += 1;
        if (missed.current >= 8) onEnd(score.current);
        continue;
      }
      survivors.push(it);
    }
    items.current = survivors;
    setFrame((f) => f + 1);
  });

  return (
    <div className="game-stage slice">
      <Hud score={score.current} extra={<span className="chip">Missed {missed.current}/8 · {left.toFixed(0)}s</span>} />
      {items.current.map((it) => (
        <button
          key={it.id}
          className="ribbon"
          style={{ left: `${it.x}%`, top: `${it.y}%`, color: `hsl(${it.hue} 70% 78%)` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            score.current += 12;
            items.current = items.current.filter((x) => x.id !== it.id);
          }}
        >
          ⟡
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- 10 rune --------------------------------- */

function Rune({ onEnd }: GameProps) {
  const RUNES = ['ᚠ', 'ᚱ', 'ᚦ', 'ᛟ', 'ᛉ', 'ᛊ'];
  const [code] = useState(() => Array.from({ length: 4 }, () => Math.floor(Math.random() * 6)));
  const [guess, setGuess] = useState<number[]>([]);
  const [history, setHistory] = useState<{ g: number[]; exact: number; near: number }[]>([]);
  const [score, setScore] = useState(0);
  const over = useRef(false);

  const submit = () => {
    if (guess.length !== 4) return;
    let exact = 0;
    let near = 0;
    const codeLeft = [...code];
    const guessLeft = [...guess];
    for (let i = 3; i >= 0; i--) {
      if (guessLeft[i] === codeLeft[i]) {
        exact++;
        codeLeft.splice(i, 1);
        guessLeft.splice(i, 1);
      }
    }
    for (const g of guessLeft) {
      const idx = codeLeft.indexOf(g);
      if (idx >= 0) {
        near++;
        codeLeft.splice(idx, 1);
      }
    }
    const next = [...history, { g: [...guess], exact, near }];
    setHistory(next);
    setGuess([]);
    if (exact === 4) {
      over.current = true;
      const gained = Math.max(50, 500 - (next.length - 1) * 60);
      setScore(gained);
      onEnd(gained);
    } else if (next.length >= 8 && !over.current) {
      over.current = true;
      onEnd(0);
    }
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Guess {history.length + 1}/8</span>} />
      <div className="rune-row">
        {guess.map((g, i) => (
          <span key={i} className="rune-chip">
            {RUNES[g]}
          </span>
        ))}
        {Array.from({ length: 4 - guess.length }).map((_, i) => (
          <span key={`e${i}`} className="rune-chip empty">
            ·
          </span>
        ))}
      </div>
      <div className="rune-pads">
        {RUNES.map((r, i) => (
          <button
            key={r}
            className="rune-pad"
            onClick={() => guess.length < 4 && setGuess([...guess, i])}
            disabled={guess.length >= 4}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="row tight">
        <Btn onClick={submit} disabled={guess.length !== 4}>
          Submit
        </Btn>
        <Btn variant="ghost" onClick={() => setGuess([])}>
          Clear
        </Btn>
      </div>
      <div className="rune-history">
        {history.map((h, i) => (
          <div key={i} className="rune-history-row">
            <span>{h.g.map((g) => RUNES[g]).join(' ')}</span>
            <span className="muted small">
              {h.exact} exact · {h.near} near
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- 11 crystal ------------------------------- */

function Crystal({ onEnd }: GameProps) {
  const [active, setActive] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(0);
  const [speed, setSpeed] = useState(1100);
  const left = useTicker(true, 40, () => onEnd(score));

  useEffect(() => {
    if (left <= 0) return;
    let cancelled = false;
    const schedule = () => {
      window.setTimeout(() => {
        if (cancelled) return;
        setActive(Math.floor(Math.random() * 9));
        window.setTimeout(() => {
          if (cancelled) return;
          setActive(null);
          setMiss((m) => {
            if (m + 1 >= 6) onEnd(score);
            return m + 1;
          });
          schedule();
        }, Math.max(420, speed - 80));
      }, 320);
    };
    schedule();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, left <= 0]);

  const hit = (i: number) => {
    if (i !== active) return;
    setScore((s) => s + 12);
    setActive(null);
    setSpeed((s) => Math.max(500, s - 40));
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Missed {miss}/6 · {left.toFixed(0)}s</span>} />
      <div className="crystal-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <button key={i} className={`crystal${active === i ? ' on' : ''}`} onClick={() => hit(i)}>
            ◆
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- 12 maze --------------------------------- */

function buildMaze(size: number) {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => 1));
  const carve = (x: number, y: number) => {
    grid[y][x] = 0;
    const dirs = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && grid[ny][nx] === 1) {
        grid[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  };
  carve(1, 1);
  return grid;
}

function Maze({ onEnd }: GameProps) {
  const size = 11;
  const [grid] = useState(() => buildMaze(size));
  const [pos, setPos] = useState({ x: 1, y: 1 });
  const [steps, setSteps] = useState(0);
  const started = useRef(performance.now());
  const done = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      setPos((p) => {
        const nx = p.x + d[0];
        const ny = p.y + d[1];
        if (grid[ny]?.[nx] !== 0) return p;
        setSteps((s) => s + 1);
        if (nx === size - 2 && ny === size - 2 && !done.current) {
          done.current = true;
          const secs = (performance.now() - started.current) / 1000;
          onEnd(Math.max(50, Math.round(600 - secs * 6 - steps * 2)));
        }
        return { x: nx, y: ny };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid, onEnd, steps]);

  return (
    <div className="game-stage">
      <Hud score={steps} extra={<span className="chip">Reach the ✦ exit</span>} />
      <div className="maze" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {grid.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className={`maze-cell${cell ? ' wall' : ''}${pos.x === x && pos.y === y ? ' me' : ''}${
                x === size - 2 && y === size - 2 ? ' exit' : ''
              }`}
            >
              {pos.x === x && pos.y === y ? '☾' : x === size - 2 && y === size - 2 ? '✦' : ''}
            </div>
          ))
        )}
      </div>
      <p className="muted small center">Use the arrow keys.</p>
    </div>
  );
}

/* --------------------------------- 13 tempo -------------------------------- */

function Tempo({ onEnd }: GameProps) {
  const [beat, setBeat] = useState(0);
  const [score, setScore] = useState(0);
  const [acc, setAcc] = useState<{ d: number } | null>(null);
  const last = useRef(0);
  const interval = useRef(760);
  const hits = useRef(0);

  useEffect(() => {
    last.current = performance.now();
    const t = window.setInterval(() => {
      setBeat((b) => b + 1);
      last.current = performance.now();
      interval.current = Math.max(380, interval.current - 14);
    }, interval.current);
    return () => window.clearInterval(t);
  }, [beat]);

  const tap = () => {
    const delta = performance.now() - last.current;
    const target = interval.current;
    const off = Math.min(delta, Math.abs(target - delta));
    const d = off / target;
    setAcc({ d });
    if (d < 0.18) {
      const gained = 25;
      hits.current += 1;
      setScore((s) => s + gained);
      if (hits.current >= 24) onEnd(score + gained);
    } else {
      setScore((s) => Math.max(0, s - 8));
    }
  };

  return (
    <div className="game-stage" onPointerDown={tap}>
      <Hud score={score} extra={<span className="chip">Hits {hits.current}/24</span>} />
      <div className="tempo-heart" style={{ transform: `scale(${1 + (beat % 2 === 0 ? 0.12 : 0)})` }}>
        ♥
      </div>
      <p className="muted small center">
        {acc ? (acc.d < 0.18 ? 'Perfect ✦' : acc.d < 0.4 ? 'Close' : 'Off beat') : 'Tap on the pulse.'}
      </p>
    </div>
  );
}

/* ---------------------------------- 14 odd --------------------------------- */

function Odd({ onEnd }: GameProps) {
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [size, setSize] = useState(3);
  const [oddIndex, setOddIndex] = useState(() => Math.floor(Math.random() * 9));
  const [base] = useState('✦');
  const [other] = useState('✧');
  const left = useTicker(true, 45, () => onEnd(score));

  const pick = (i: number) => {
    if (i === oddIndex) {
      const gained = 10 + round * 3;
      setScore((s) => s + gained);
      const nextRound = round + 1;
      setRound(nextRound);
      if (nextRound % 3 === 0) setSize((s) => Math.min(6, s + 1));
      setOddIndex(Math.floor(Math.random() * (size * size)));
    } else {
      setScore((s) => Math.max(0, s - 6));
    }
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Round {round} · {left.toFixed(0)}s</span>} />
      <div className="odd-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {Array.from({ length: size * size }).map((_, i) => (
          <button key={i} className="odd-cell" onClick={() => pick(i)}>
            {i === oddIndex ? other : base}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- 15 bubbles ------------------------------- */

function Bubbles({ onEnd }: GameProps) {
  const items = useRef<{ id: number; x: number; y: number; r: number; v: number }[]>([]);
  const nextId = useRef(1);
  const spawn = useRef(0);
  const score = useRef(0);
  const escaped = useRef(0);
  const [, setFrame] = useState(0);
  const left = useTicker(true, 45, () => onEnd(score.current));

  useLoop(true, (dt) => {
    spawn.current += dt;
    if (spawn.current > 0.42) {
      spawn.current = 0;
      items.current.push({ id: nextId.current++, x: 6 + Math.random() * 86, y: 104, r: 18 + Math.random() * 20, v: 14 + Math.random() * 16 });
    }
    const survivors: typeof items.current = [];
    for (const b of items.current) {
      b.y -= b.v * dt;
      if (b.y < -10) {
        escaped.current += 1;
        if (escaped.current >= 10) onEnd(score.current);
        continue;
      }
      survivors.push(b);
    }
    items.current = survivors;
    setFrame((f) => f + 1);
  });

  return (
    <div className="game-stage slice">
      <Hud score={score.current} extra={<span className="chip">Escaped {escaped.current}/10 · {left.toFixed(0)}s</span>} />
      {items.current.map((b) => (
        <button
          key={b.id}
          className="bubble"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.r, height: b.r }}
          onPointerDown={(e) => {
            e.stopPropagation();
            score.current += 8;
            items.current = items.current.filter((x) => x.id !== b.id);
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------- 16 arrows ------------------------------- */

function Arrows({ onEnd }: GameProps) {
  const [dir, setDir] = useState<'up' | 'down' | 'left' | 'right'>('up');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const windowMs = useRef(1400);
  const shown = useRef(performance.now());
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);

  const next = useCallback(() => {
    const opts: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];
    setDir(opts[Math.floor(Math.random() * 4)]);
    shown.current = performance.now();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      const elapsed = performance.now() - shown.current;
      if (d === dir && elapsed < windowMs.current) {
        const gained = Math.round(20 * (1 - elapsed / windowMs.current) + 10);
        setScore((s) => s + gained);
        setFlash('ok');
        windowMs.current = Math.max(600, windowMs.current - 45);
        next();
      } else {
        setFlash('bad');
        setLives((l) => {
          if (l - 1 <= 0) onEnd(score);
          return l - 1;
        });
        next();
      }
      window.setTimeout(() => setFlash(null), 180);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dir, next, onEnd, score]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (performance.now() - shown.current > windowMs.current) {
        setLives((l) => {
          if (l - 1 <= 0) onEnd(score);
          return l - 1;
        });
        next();
      }
    }, 120);
    return () => window.clearInterval(t);
  }, [next, onEnd, score]);

  const glyph = { up: '↑', down: '↓', left: '←', right: '→' }[dir];

  return (
    <div className={`game-stage arrows${flash ? ` ${flash}` : ''}`}>
      <Hud score={score} extra={<span className="chip">Lives {lives}</span>} />
      <div className="arrow-glyph">{glyph}</div>
      <p className="muted small center">Press the matching arrow key.</p>
    </div>
  );
}

/* ---------------------------------- 17 math -------------------------------- */

function MathGame({ onEnd }: GameProps) {
  const make = () => {
    const ops = ['+', '−', '×'];
    const op = ops[Math.floor(Math.random() * 3)];
    const a = 2 + Math.floor(Math.random() * (op === '×' ? 12 : 40));
    const b = 2 + Math.floor(Math.random() * (op === '×' ? 12 : 40));
    const answer = op === '+' ? a + b : op === '−' ? a - b : a * b;
    return { text: `${a} ${op} ${b}`, answer };
  };
  const [q, setQ] = useState(make);
  const [value, setValue] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const left = useTicker(true, 60, () => onEnd(score));

  const submit = () => {
    if (Number(value) === q.answer) {
      const gained = 10 + streak * 2;
      setScore((s) => s + gained);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
    setValue('');
    setQ(make());
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Streak {streak} · {left.toFixed(0)}s</span>} />
      <div className="math-box">
        <p className="math-q">{q.text}</p>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="?"
          autoFocus
        />
        <Btn onClick={submit}>Answer</Btn>
      </div>
    </div>
  );
}

/* -------------------------------- 18 pattern ------------------------------- */

function Pattern({ onEnd }: GameProps) {
  const [size, setSize] = useState(4);
  const [level, setLevel] = useState(1);
  const [pattern, setPattern] = useState<number[]>([]);
  const [phase, setPhase] = useState<'show' | 'input'>('show');
  const [lit, setLit] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const cells = size * size;

  useEffect(() => {
    const count = 3 + level;
    setPattern(Array.from({ length: count }, () => Math.floor(Math.random() * cells)));
    setPicked([]);
    setPhase('show');
  }, [level, cells]);

  useEffect(() => {
    if (phase !== 'show' || !pattern.length) return;
    let i = 0;
    const timers: number[] = [];
    const step = () => {
      if (i >= pattern.length) {
        setLit(null);
        setPhase('input');
        return;
      }
      setLit(pattern[i]);
      timers.push(window.setTimeout(() => setLit(null), 380));
      i++;
      timers.push(window.setTimeout(step, 560));
    };
    timers.push(window.setTimeout(step, 400));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, pattern]);

  const pick = (i: number) => {
    if (phase !== 'input') return;
    const next = [...picked, i];
    setPicked(next);
    if (next.some((v, idx) => v !== pattern[idx])) {
      onEnd(score);
      return;
    }
    if (next.length === pattern.length) {
      setScore((s) => s + pattern.length * 12);
      setLevel((l) => l + 1);
    }
  };

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Level {level}</span>} />
      <div className="pattern-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {Array.from({ length: cells }).map((_, i) => (
          <button
            key={i}
            className={`pattern-cell${lit === i ? ' on' : ''}${picked.includes(i) ? ' picked' : ''}`}
            onClick={() => pick(i)}
          />
        ))}
      </div>
      <p className="muted small center">{phase === 'show' ? 'Memorise…' : `Repeat ${pattern.length} cells`}</p>
    </div>
  );
}

/* -------------------------------- 19 feather ------------------------------- */

function Feather({ onEnd }: GameProps) {
  const [pos, setPos] = useState(0);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState('');
  const dir = useRef(1);
  const p = useRef(0);
  const speed = useRef(60);
  const stopped = useRef(false);

  useLoop(!stopped.current, (dt) => {
    p.current += speed.current * dir.current * dt;
    if (p.current > 100) {
      p.current = 100;
      dir.current = -1;
    }
    if (p.current < 0) {
      p.current = 0;
      dir.current = 1;
    }
    setPos(p.current);
  });

  const band = { from: 44, to: 56 };

  const stop = () => {
    if (stopped.current) return;
    const inBand = p.current >= band.from && p.current <= band.to;
    const gained = inBand ? 40 + Math.round(20 * (1 - Math.abs(50 - p.current) / 6)) : 0;
    setScore((s) => s + gained);
    setMsg(inBand ? `Perfect ✦ +${gained}` : 'Outside the band');
    if (round >= 8) {
      stopped.current = true;
      onEnd(score + gained);
      return;
    }
    setRound((r) => r + 1);
    speed.current = Math.min(200, speed.current + 18);
  };

  return (
    <div className="game-stage" onPointerDown={stop}>
      <Hud score={score} extra={<span className="chip">Round {round}/8</span>} />
      <div className="feather-bar">
        <div className="feather-band" style={{ left: `${band.from}%`, width: `${band.to - band.from}%` }} />
        <div className="feather" style={{ left: `${pos}%` }}>
          ❧
        </div>
      </div>
      <p className="muted small center">{msg || 'Tap or press Space to stop the feather.'}</p>
      <Btn variant="ghost" onClick={stop}>
        Stop
      </Btn>
    </div>
  );
}

/* --------------------------------- 20 trivia ------------------------------- */

const TRIVIA: { q: string; options: string[]; correct: number }[] = [
  { q: 'What does “selfship” usually describe?', options: ['Shipping two canon characters', 'Shipping yourself with a fictional character', 'Shipping two real users', 'A group roleplay'], correct: 1 },
  { q: 'What is a yumesona?', options: ['A canon character', 'An original persona used in selfship stories', 'A music genre', 'A moderation tool'], correct: 1 },
  { q: 'What does F/O stand for?', options: ['Fictional Other', 'Fan Original', 'First Option', 'Forever Ours'], correct: 0 },
  { q: 'Anti-double preferences are meant to…', options: ['Ban other users', 'Describe your personal sharing boundaries', 'Encrypt messages', 'Verify age'], correct: 1 },
  { q: 'Which is a healthy selfship boundary?', options: ['Harassing doubles', 'Respecting that others may share the same F/O', 'Copying someone’s yumesona', 'Posting private chats'], correct: 1 },
  { q: 'A yumesona gallery is best used for…', options: ['Storing login keys', 'Collecting art of your persona', 'Reporting users', 'Buying music'], correct: 1 },
  { q: 'What is a “double” in selfship spaces?', options: ['Two accounts', 'Another person who ships the same character', 'A duplicate post', 'A backup file'], correct: 1 },
  { q: 'Which content should stay private by default?', options: ['Your diary entries', 'Public story covers', 'Community rules', 'Your username'], correct: 0 },
  { q: 'Web Push notifications require…', options: ['An email address only', 'Explicit user permission and a subscription', 'A paid plan', 'A custom domain'], correct: 1 },
  { q: 'What does a Yumesona Studio help you do?', options: ['Trade characters', 'Organise multiple personas and their lore', 'Generate AI art', 'Sell music'], correct: 1 },
];

function Trivia({ onEnd }: GameProps) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const answer = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const correct = i === TRIVIA[index].correct;
    const gained = correct ? 10 : 0;
    if (correct) setScore((s) => s + gained);
    window.setTimeout(() => {
      if (index + 1 >= TRIVIA.length) {
        onEnd(score + gained);
        return;
      }
      setIndex(index + 1);
      setPicked(null);
    }, 700);
  };

  const item = TRIVIA[index];

  return (
    <div className="game-stage">
      <Hud score={score} extra={<span className="chip">Question {index + 1}/{TRIVIA.length}</span>} />
      <div className="trivia">
        <p className="trivia-q">{item.q}</p>
        <div className="stack tight">
          {item.options.map((o, i) => (
            <button
              key={o}
              className={`trivia-opt${picked === i ? (i === item.correct ? ' right' : ' wrong') : ''}`}
              onClick={() => answer(i)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- registry -------------------------------- */

const REGISTRY: Record<string, React.ComponentType<GameProps>> = {
  starfall: Starfall,
  memory: Memory,
  tiles: Tiles,
  dash: Dash,
  orbit: Orbit,
  constellation: Constellation,
  scramble: Scramble,
  melody: Melody,
  slice: Slice,
  rune: Rune,
  crystal: Crystal,
  maze: Maze,
  tempo: Tempo,
  odd: Odd,
  bubbles: Bubbles,
  arrows: Arrows,
  math: MathGame,
  pattern: Pattern,
  feather: Feather,
  trivia: Trivia,
};

/* ----------------------------------- pages --------------------------------- */

export function GamesPage() {
  const [scores, setScores] = useState<Record<string, { best: number; plays: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<any>('/games/my-scores')
      .then((res) => {
        const map: Record<string, { best: number; plays: number }> = {};
        for (const s of res.scores || []) map[s.game] = { best: s.best, plays: s.plays };
        setScores(map);
      })
      .catch(() => setScores({}))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <PageHead
        eyebrow="Yume Arcade"
        title="20 games for your universe"
        subtitle="Small, original browser games about stars, hearts and constellations. Scores are stored on your account and ranked on a shared leaderboard."
      />
      {loading ? (
        <Spinner />
      ) : (
        <div className="game-grid">
          {GAMES.map((g) => (
            <Link key={g.id} to={`/games/${g.id}`} className="game-card" style={{ ['--accent' as any]: g.accent }}>
              <span className="game-glyph">{g.glyph}</span>
              <span className="game-tag">{g.tag}</span>
              <strong>{g.name}</strong>
              <small>{g.blurb}</small>
              <span className="game-best">
                {scores[g.id] ? `Best ${scores[g.id].best} · ${scores[g.id].plays} plays` : 'Not played yet'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function GamePlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const meta = GAMES.find((g) => g.id === id);
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const loadBoard = useCallback(() => {
    if (!meta) return;
    api<any>(`/games/leaderboard?game=${meta.id}`)
      .then((res) => setBoard(res.leaderboard || []))
      .catch(() => setBoard([]));
  }, [meta]);

  useEffect(() => {
    loadBoard();
    if (!meta) return;
    api<any>('/games/my-scores')
      .then((res) => {
        const hit = (res.scores || []).find((s: any) => s.game === meta.id);
        if (hit) setBest(hit.best);
      })
      .catch(() => undefined);
  }, [loadBoard, meta]);

  const finish = useCallback(
    async (score: number) => {
      setResult(score);
      if (!meta) return;
      setSaved('saving');
      try {
        const res = await api<any>('/games/scores', { method: 'POST', body: { game: meta.id, score } });
        setBest(res.best ?? score);
        setSaved('saved');
        loadBoard();
      } catch {
        setSaved('error');
      }
    },
    [meta, loadBoard]
  );

  if (!meta) {
    return (
      <div className="page">
        <Empty title="Game not found" hint="Pick one from the arcade." action={<Btn onClick={() => navigate('/games')}>Arcade</Btn>} />
      </div>
    );
  }

  const Game = REGISTRY[meta.id];

  return (
    <div className="page game-page">
      <PageHead
        eyebrow={`Yume Arcade · ${meta.tag}`}
        title={meta.name}
        subtitle={meta.blurb}
        actions={
          <div className="row tight">
            <Btn variant="ghost" onClick={() => navigate('/games')}>
              Arcade
            </Btn>
            <Btn
              onClick={() => {
                setResult(null);
                setSaved('idle');
                setRunKey((k) => k + 1);
              }}
            >
              {result === null ? 'Restart' : 'Play again'}
            </Btn>
          </div>
        }
      />

      <div className="game-layout">
        <div className="game-frame">
          <div key={runKey} className="game-mount">
            <Game onEnd={finish} />
          </div>
          {result !== null ? (
            <div className="game-over">
              <p className="game-over-score">{result}</p>
              <p className="muted">
                {best !== null && result >= best ? 'New personal best ✦' : best !== null ? `Your best: ${best}` : 'Score saved'}
              </p>
              <p className="small muted">
                {saved === 'saving' ? 'Saving score…' : saved === 'saved' ? 'Score saved to your account.' : saved === 'error' ? 'Could not save the score — check your connection.' : ''}
              </p>
              <Btn
                onClick={() => {
                  setResult(null);
                  setSaved('idle');
                  setRunKey((k) => k + 1);
                }}
              >
                Play again
              </Btn>
            </div>
          ) : null}
        </div>

        <aside className="panel">
          <h3>Leaderboard</h3>
          {board.length === 0 ? (
            <p className="muted small">No scores yet — be the first.</p>
          ) : (
            <ol className="board">
              {board.slice(0, 10).map((row, i) => (
                <li key={`${row.username}-${i}`}>
                  <span className="board-rank">{i + 1}</span>
                  {row.avatar_url ? <img src={mediaUrl(row.avatar_url)} alt="" className="board-avatar" /> : <span className="board-avatar" />}
                  <span className="board-name">{row.display_name || row.username}</span>
                  <strong>{row.score}</strong>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
