/**
 * AI-generated chat replies. Each seed horse answers in character, using its
 * profile as a persona. The server build talks to Claude through the official
 * SDK; the browser build reuses buildPersona/buildTurns with the artifact's
 * built-in Claude access.
 */

import { HELP_TAG } from './suggest.js';

export const DEFAULT_MODEL = 'claude-opus-5';
const MAX_HISTORY = 20;
const MAX_REPLY_CHARS = 700;

/**
 * System prompt for a horse. There is no separate help switch: the horse chats
 * as a friend, and when the partner asks for help it applies its skill and marks
 * the reply with HELP_TAG so the app can style it.
 */
export function buildPersona(horse, partner) {
  const list = (arr) => (arr && arr.length ? arr.join(', ') : 'nothing in particular');
  const typeLine = horse.type ? `Your personality type is ${horse.type}${horse.typeName ? `, ${horse.typeName}` : ''}.` : '';
  const voiceLine = horse.voice ? `How you talk: ${horse.voice}` : '';
  const lines = [
    `You are ${horse.name}, a ${horse.age}-year-old ${horse.sex.toLowerCase()} ${horse.breed} on Horse Friends, a friendship app where horses find their herd.`,
    `You live at ${horse.stable}. You stand ${horse.height} hands. Your favourite gait is ${horse.gait.toLowerCase()}.`,
    typeLine,
    voiceLine,
    `Your bio: "${horse.bio}"`,
    `Your interests: ${list(horse.interests)}. You are looking for: ${horse.lookingFor}.`,
    '',
    `You just became friends with ${partner.name}, a ${partner.age}-year-old ${partner.sex.toLowerCase()} ${partner.breed} from ${partner.stable}.`,
    `${partner.name}'s bio: "${partner.bio}". Interests: ${list(partner.interests)}.`,
    '',
    'The person you are talking to is about ten years old. Use simple words and short sentences. Be kind, funny and encouraging.',
    'Everything you say must be suitable for a ten-year-old: no romance or dating talk, nothing scary, rude or mean. Never ask for personal details such as their address, school, last name or passwords.',
    'If they seem upset, unsafe or in trouble, gently tell them to talk to a trusted grown-up.',
    '',
    'You are chatting with them in the app as a new friend. Stay fully in character as this horse: think and talk like a horse would, with horse concerns (hay, pasture, farriers, plastic bags, the water trough).',
    'Let your personality type show in how you respond. Be warm, playful and friendly, like a pen pal. Reference your own profile and theirs where it fits.',
    'Reply with one or two short sentences, like a text message. No quotation marks around your reply, no narration, no emoji lists.',
  ];
  if (horse.skill) {
    lines.push(
      '',
      `You are also good at one thing: ${horse.skill.name}. ${horse.skill.tagline}. ${horse.skill.prompt}`,
      `When ${partner.name} asks for help, has a real question, or is clearly stuck, worried or unsure about something, help properly instead of chatting: put the help first, stay in your voice, and use at most four short sentences or a short list.`,
      `Start a helping reply with the exact tag ${HELP_TAG} and nothing before it. Never use the tag on ordinary chat.`,
      'They already know what you are good at, so do not keep bringing it up.',
    );
  }
  lines.push('', 'Never mention being an AI, a language model, or a simulation. If asked, you are simply a horse.');
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/**
 * Convert stored messages into API turns. The horse is the assistant, the
 * partner is the user. The result always ends on a user turn.
 */
export function buildTurns(history, horseId) {
  const turns = history
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.fromId === horseId ? 'assistant' : 'user', content: m.text }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  while (turns.length && turns[turns.length - 1].role !== 'user') turns.pop();
  return turns;
}

/** Tidy model output into something that fits a chat bubble. */
export function cleanReply(text) {
  let out = String(text ?? '').trim();
  out = out.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (out.length > MAX_REPLY_CHARS) {
    const cut = out.slice(0, MAX_REPLY_CHARS);
    out = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')) + 1) || cut;
  }
  return out;
}

export const SUGGESTION_COUNT = 3;
export const SUGGESTION_MAX_CHARS = 70;

export const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    replies: {
      type: 'array',
      items: { type: 'string' },
      minItems: SUGGESTION_COUNT,
      maxItems: SUGGESTION_COUNT,
    },
  },
  required: ['replies'],
  additionalProperties: false,
};

/**
 * One self-contained prompt asking for replies `partner` could send `horse` next.
 * Used as the user turn on the server and as the whole input in the browser build.
 */
export function buildSuggestionPrompt(horse, partner, history) {
  const list = (arr) => (arr && arr.length ? arr.join(', ') : 'nothing in particular');
  const transcript = history.length
    ? history.slice(-MAX_HISTORY).map((m) => `${m.fromId === horse.id ? horse.name : partner.name}: ${m.text}`).join('\n')
    : '(no messages yet)';
  return [
    `You write short text messages on behalf of ${partner.name}, a ${partner.age}-year-old ${partner.sex.toLowerCase()} ${partner.breed} from ${partner.stable}, on Horse Friends, a friendship app where horses find their herd. The player behind ${partner.name} is about ten years old.`,
    `${partner.name}'s bio: "${partner.bio}". Interests: ${list(partner.interests)}. Favourite gait: ${partner.gait}.`,
    `${partner.name} matched with ${horse.name}, a ${horse.age}-year-old ${horse.sex.toLowerCase()} ${horse.breed} from ${horse.stable}.`,
    `${horse.name}'s bio: "${horse.bio}". Interests: ${list(horse.interests)}.`,
    '',
    'Conversation so far:',
    transcript,
    '',
    `Suggest ${SUGGESTION_COUNT} different messages ${partner.name} could send next, in ${partner.name}'s own horse voice: one playful, one curious, one bold. Simple words a ten-year-old would use, friendly and never romantic.`,
    `Each must directly follow from ${horse.name}'s latest message (or open the conversation if there is none), be under ${SUGGESTION_MAX_CHARS} characters, and contain no quotation marks or emoji.`,
    'Never mention AI or that these are suggestions.',
    'Answer with JSON only, in the form {"replies": ["...", "...", "..."]}.',
  ].join('\n');
}

/** Validate model output into a clean list of suggestions, or null. */
export function parseSuggestions(data) {
  let parsed = data;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.replies;
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    const text = cleanReply(item).slice(0, SUGGESTION_MAX_CHARS).trim();
    if (text && !out.includes(text)) out.push(text);
    if (out.length === SUGGESTION_COUNT) break;
  }
  return out.length ? out : null;
}

/**
 * Build a replier for the store. Returns null when no API key is configured so
 * the store falls back to canned lines. `client` can be injected for tests.
 */
export function createClaudeReplier({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.HORSE_AI_MODEL || DEFAULT_MODEL,
  client = null,
  log = console,
} = {}) {
  if (!client && !apiKey) return null;

  let clientPromise = client ? Promise.resolve(client) : null;
  let warned = false;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey }));
    }
    return clientPromise;
  }

  return async function reply({ horse, partner, history }) {
    const messages = buildTurns(history, horse.id);
    if (!messages.length) return null;
    try {
      const api = await getClient();
      const response = await api.beta.messages.create({
        model,
        max_tokens: 600,
        system: buildPersona(horse, partner),
        messages,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ');
      const cleaned = cleanReply(text);
      return cleaned || null;
    } catch (err) {
      if (!warned) {
        warned = true;
        log.warn(`AI replies unavailable (${err?.message || err}). Falling back to canned lines.`);
      }
      return null;
    }
  };
}

/**
 * Build a suggester for the store: ({ horse, partner, history }) => string[] | null.
 * Returns null when no API key is configured so the store uses rule-based suggestions.
 */
export function createClaudeSuggester({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.HORSE_AI_MODEL || DEFAULT_MODEL,
  client = null,
  log = console,
} = {}) {
  if (!client && !apiKey) return null;

  let clientPromise = client ? Promise.resolve(client) : null;
  let warned = false;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey }));
    }
    return clientPromise;
  }

  return async function suggest({ horse, partner, history }) {
    try {
      const api = await getClient();
      const response = await api.beta.messages.create({
        model,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildSuggestionPrompt(horse, partner, history) }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SUGGESTION_SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      return parseSuggestions(text);
    } catch (err) {
      if (!warned) {
        warned = true;
        log.warn(`AI suggestions unavailable (${err?.message || err}). Using rule-based suggestions.`);
      }
      return null;
    }
  };
}
