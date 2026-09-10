/**
 * AI-generated chat replies. Each seed horse answers in character, using its
 * profile as a persona. The server build talks to Claude through the official
 * SDK; the browser build reuses buildPersona/buildTurns with the artifact's
 * built-in Claude access.
 */

export const DEFAULT_MODEL = 'claude-opus-5';
const MAX_HISTORY = 20;
const MAX_REPLY_CHARS = 400;

export function buildPersona(horse, partner) {
  const list = (arr) => (arr && arr.length ? arr.join(', ') : 'nothing in particular');
  return [
    `You are ${horse.name}, a ${horse.age}-year-old ${horse.sex.toLowerCase()} ${horse.breed} on Horse Tinder, a dating app for horses.`,
    `You live at ${horse.stable}. You stand ${horse.height} hands. Your favourite gait is ${horse.gait.toLowerCase()}.`,
    `Your bio: "${horse.bio}"`,
    `Your interests: ${list(horse.interests)}. You are looking for: ${horse.lookingFor}.`,
    '',
    `You matched with ${partner.name}, a ${partner.age}-year-old ${partner.sex.toLowerCase()} ${partner.breed} from ${partner.stable}.`,
    `${partner.name}'s bio: "${partner.bio}". Interests: ${list(partner.interests)}.`,
    '',
    'You are chatting with them in the app. Stay fully in character as this horse: think and talk like a horse would, with horse concerns (hay, pasture, farriers, plastic bags, the water trough).',
    'Be warm, playful and a little flirty, and keep it wholesome. Reference your own profile and theirs where it fits.',
    'Reply with one or two short sentences, like a text message. No quotation marks around your reply, no narration, no emoji lists.',
    'Never mention being an AI, a language model, or a simulation. If asked, you are simply a horse.',
  ].join('\n');
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
        max_tokens: 300,
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
