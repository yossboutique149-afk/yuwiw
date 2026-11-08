import { Router } from 'express';
import { db, uid, now } from '../db';
import { type AuthedRequest, requireAuth } from '../auth';
import { parseJson, str } from '../util';

const router = Router();

/**
 * Character World uses an OpenAI-compatible chat completions endpoint. Credentials live only
 * in the server environment. When they are missing the API answers honestly instead of
 * simulating an AI reply.
 */
export function aiConfig() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  return {
    configured: Boolean(apiKey),
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    apiKey,
    required_env: apiKey ? [] : ['OPENAI_API_KEY'],
  };
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function chatCompletion(messages: ChatMessage[], maxTokens = 500): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const config = aiConfig();
  if (!config.configured) return { ok: false, status: 503, detail: 'ai_not_configured' };
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.85, max_tokens: maxTokens }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { ok: false, status: 502, detail: detail.slice(0, 400) };
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, status: 502, detail: 'empty_completion' };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, status: 502, detail: (error as Error).message.slice(0, 300) };
  }
}

router.get('/ai/status', (_req, res) => {
  const config = aiConfig();
  res.json({
    configured: config.configured,
    model: config.configured ? config.model : null,
    required_env: config.required_env,
    features: {
      character_world: true,
      playlist_builder: true,
      child_portrait: true,
      lore_writer: true,
    },
    note: 'YumEra only reports AI as active when a provider key is configured on the server.',
  });
});

function characterForUser(id: string, userId: string) {
  return db.prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(id, userId) as Record<string, any> | undefined;
}

function buildSystemPrompt(character: Record<string, any>, memory: ChatMessage[]) {
  const parts = [
    `You are ${character.name}, a fictional character inside the YumEra social universe.`,
    character.personality && `Personality: ${character.personality}`,
    character.bio && `Biography: ${character.bio}`,
    character.universe && `Universe: ${character.universe}`,
    character.story && `Story: ${character.story}`,
    character.speech_style && `Speech style: ${character.speech_style}`,
    character.instructions && `Behaviour instructions: ${character.instructions}`,
    'Stay in character, never claim to be a real person, never produce abusive or sexual content involving minors, and keep replies under 220 words.',
  ].filter(Boolean);
  if (memory.length) {
    parts.push(
      `Recent conversation memory:\n${memory
        .slice(-10)
        .map((m) => `${m.role === 'user' ? 'User' : character.name}: ${m.content}`)
        .join('\n')}`
    );
  }
  return parts.join('\n');
}

router.get('/characters', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id);
  res.json({ characters: rows });
});

router.get('/characters/public', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.avatar_url, c.universe, c.bio, c.personality, u.username
       FROM characters c JOIN users u ON u.id = c.user_id WHERE c.visibility = 'public' ORDER BY c.created_at DESC LIMIT 30`
    )
    .all();
  res.json({ characters: rows });
});

router.get('/characters/:id', requireAuth, (req: AuthedRequest, res) => {
  const character = characterForUser(req.params.id, req.user!.id);
  if (!character) return res.status(404).json({ error: 'not_found' });
  res.json({ character });
});

router.post('/characters', requireAuth, (req: AuthedRequest, res) => {
  const name = str(req.body.name, 80);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const id = uid();
  db.prepare(
    `INSERT INTO characters (id, user_id, name, avatar_url, personality, bio, universe, story, speech_style, instructions, greeting, visibility, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.user!.id,
    name,
    str(req.body.avatar_url, 400) || null,
    str(req.body.personality, 1000),
    str(req.body.bio, 4000),
    str(req.body.universe, 200),
    str(req.body.story, 6000),
    str(req.body.speech_style, 500),
    str(req.body.instructions, 2000),
    str(req.body.greeting, 800),
    ['public', 'private'].includes(req.body.visibility) ? req.body.visibility : 'private',
    now()
  );
  res.status(201).json({ character: db.prepare('SELECT * FROM characters WHERE id = ?').get(id) });
});

router.patch('/characters/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!characterForUser(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  const fields: Record<string, unknown> = {};
  for (const key of ['name', 'personality', 'bio', 'universe', 'story', 'speech_style', 'instructions', 'greeting', 'avatar_url']) {
    if (typeof req.body[key] === 'string') fields[key] = str(req.body[key], key === 'bio' || key === 'story' ? 6000 : 2000);
  }
  if (['public', 'private'].includes(req.body.visibility)) fields.visibility = req.body.visibility;
  if (!Object.keys(fields).length) return res.json({ ok: true });
  const assignments = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  db.prepare(`UPDATE characters SET ${assignments} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ character: db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id) });
});

router.delete('/characters/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.get('/characters/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  if (!characterForUser(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  const rows = db.prepare('SELECT * FROM character_messages WHERE character_id = ? AND user_id = ? ORDER BY created_at ASC').all(
    req.params.id,
    req.user!.id
  );
  res.json({ messages: rows });
});

router.delete('/characters/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  if (!characterForUser(req.params.id, req.user!.id)) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM character_messages WHERE character_id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.post('/characters/:id/chat', requireAuth, async (req: AuthedRequest, res) => {
  const character = characterForUser(req.params.id, req.user!.id);
  if (!character) return res.status(404).json({ error: 'not_found' });
  const message = str(req.body.message, 4000);
  if (!message) return res.status(400).json({ error: 'message_required' });

  const config = aiConfig();
  if (!config.configured) {
    return res.status(503).json({
      error: 'ai_not_configured',
      message: 'Character World needs an AI provider key on the server (OPENAI_API_KEY). Messages are not stored until a provider answers.',
      required_env: ['OPENAI_API_KEY'],
    });
  }

  const history = db
    .prepare('SELECT role, content FROM character_messages WHERE character_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 40')
    .all(req.params.id, req.user!.id) as ChatMessage[];

  const result = await chatCompletion([
    { role: 'system', content: buildSystemPrompt(character, history) },
    ...history.slice(-12),
    { role: 'user', content: message },
  ]);

  if (!result.ok) {
    return res.status(result.status).json({
      error: 'ai_provider_error',
      message: 'The AI provider did not answer. The message was not stored.',
      detail: result.detail,
    });
  }

  const userId = req.user!.id;
  const ts = now();
  db.prepare('INSERT INTO character_messages (id, character_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    uid(),
    req.params.id,
    userId,
    'user',
    message,
    ts
  );
  const replyId = uid();
  db.prepare('INSERT INTO character_messages (id, character_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    replyId,
    req.params.id,
    userId,
    'assistant',
    result.text,
    new Date(Date.now() + 1000).toISOString()
  );
  res.status(201).json({ reply: { id: replyId, role: 'assistant', content: result.text, created_at: now() }, provider: 'ai' });
});

/* ------------------------- AI helpers for yume content -------------------- */

router.post('/ai/child-draft', requireAuth, async (req: AuthedRequest, res) => {
  const parentA = str(req.body.parent_a, 80);
  const parentB = str(req.body.parent_b, 80);
  if (!parentA) return res.status(400).json({ error: 'parent_a_required' });
  const a = db.prepare('SELECT * FROM yumesonas WHERE id = ? AND user_id = ?').get(parentA, req.user!.id) as Record<string, any> | undefined;
  if (!a) return res.status(404).json({ error: 'yumesona_not_found' });
  const b = parentB
    ? (db.prepare('SELECT * FROM fos WHERE id = ? AND user_id = ?').get(parentB, req.user!.id) as Record<string, any> | undefined)
    : undefined;

  const result = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You design fictional "bond children" for a selfshipping community. Reply with JSON: {"name":string,"personality":string,"appearance":string,"traits":string[],"story":string}. Keep it wholesome and avoid any sexual or age-inappropriate content.',
      },
      {
        role: 'user',
        content: `Parent A (yumesona): ${a.name}. Description: ${a.description || ''}. Personality: ${a.personality || ''}. Universe: ${a.universe || ''}.
Parent B (F/O): ${b ? `${b.character_name} from ${b.source_work || 'an original work'}. ${b.description || ''}` : 'not specified'}.
Create their fictional child.`,
      },
    ],
    700
  );

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.status === 503 ? 'ai_not_configured' : 'ai_provider_error',
      message:
        result.status === 503
          ? 'AI drafting needs OPENAI_API_KEY on the server. You can still create the child manually with the local generator.'
          : 'The AI provider did not answer.',
      required_env: result.status === 503 ? ['OPENAI_API_KEY'] : [],
      detail: result.detail,
    });
  }
  try {
    res.json({ draft: JSON.parse(result.text), provider: 'ai' });
  } catch {
    res.json({ draft: { story: result.text }, provider: 'ai', format: 'text' });
  }
});

router.post('/ai/lore', requireAuth, async (req: AuthedRequest, res) => {
  const prompt = str(req.body.prompt, 1200);
  const title = str(req.body.title, 160);
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  const result = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a lore writer for a yumeshipping universe. Write evocative, original prose in the requested language. No copyrighted characters. Return plain text with short paragraphs.',
      },
      { role: 'user', content: `${title ? `Title: ${title}\n` : ''}${prompt}` },
    ],
    900
  );
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.status === 503 ? 'ai_not_configured' : 'ai_provider_error',
      message: result.status === 503 ? 'Lore generation needs OPENAI_API_KEY on the server.' : 'The AI provider did not answer.',
      required_env: result.status === 503 ? ['OPENAI_API_KEY'] : [],
      detail: result.detail,
    });
  }
  res.json({ text: result.text, provider: 'ai' });
});

/* --------------------------- notification centre -------------------------- */

export const aiRouterExtras = { chatCompletion, buildSystemPrompt, characterForUser, safeJson, parseJson };
export default router;
