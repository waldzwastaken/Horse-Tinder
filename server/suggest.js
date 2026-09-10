/**
 * Rule-based reply suggestions. Used when no AI suggester is configured, and as
 * the fallback when one fails. Pure and deterministic so it works in the browser too.
 */

const RULES = [
  [/apple|peppermint|carrot|sugar|snack|treat|watermelon/, ['Apples, no contest.', 'Peppermints. I have standards.', 'Whatever you are sharing.']],
  [/\bhay\b|alfalfa|oats|grass|graz/, ['Second cutting or nothing.', 'Show me the good grass and I am yours.']],
  [/\bmud\b|roll|dirt|dust/, ['Mud is a lifestyle.', 'Save me a spot in the puddle.']],
  [/trough|water|drink/, ['Trough at sunset?', 'I will be there. Bring gossip.']],
  [/race|fence|gallop|\brun\b|zoom/, ['You are on. Far fence, go!', 'Only if you give me a head start.']],
  [/farrier|hoof|hooves|shoe/, ['Thoughts and prayers. Want company?', 'Mine is next week. We can be brave together.']],
  [/plastic|\bbag\b|scary|spook/, ['Deep breaths. Bags cannot hurt you.', 'I would have spooked too, honestly.']],
  [/mane|coat|shiny|pretty|lovely|handsome|beautiful|noticed/, ['Thanks! I brushed it specially.', 'Yours is great too.']],
  [/ridden|rider|human|saddle/, ['Depends who is asking.', 'My human is fine. Yours?']],
  [/pasture|side|field|stall|barn/, ['Left side, obviously.', 'Wherever you are, apparently.']],
  [/\?/, ['Good question. You first.', 'Yes. Obviously yes.']],
];

const GENERIC = ['Ha! Same here.', 'Tell me more.', 'Meet at the fence later?', 'You are funny, I can tell.', 'Okay, go on.'];

function sharedInterests(horse, partner) {
  const mine = new Set((partner.interests || []).map((s) => s.toLowerCase()));
  return (horse.interests || []).filter((s) => mine.has(s.toLowerCase()));
}

function unique(list, max) {
  const out = [];
  for (const item of list) {
    if (item && !out.includes(item)) out.push(item);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Up to three things `partner` could plausibly send `horse` next.
 * @param {object} horse the other horse
 * @param {object} partner the horse doing the typing
 * @param {Array<{fromId: string, text: string}>} history messages so far, oldest first
 */
export function suggestReplies(horse, partner, history = []) {
  const shared = sharedInterests(horse, partner);
  const interest = (shared[0] || (horse.interests || [])[0] || 'hay').toLowerCase();
  const last = history[history.length - 1];

  if (!last) {
    return unique([
      shared.length
        ? `I saw you're into ${interest} too. Where's your spot?`
        : `Hay there, ${horse.name}! How's life at ${horse.stable}?`,
      `Be honest, ${horse.name}: apples or carrots?`,
      `Fancy a ${(horse.gait || 'trot').toLowerCase()} round the far field sometime?`,
      'Your bio made me snort. In a good way.',
    ], 3);
  }

  if (last.fromId === partner.id) {
    return unique([
      `Anyway, what's your take on ${interest}?`,
      'Still there, or did a plastic bag happen?',
      "No rush. I'll be at the trough.",
    ], 3);
  }

  const text = last.text.toLowerCase();
  const picks = [];
  for (const [pattern, replies] of RULES) {
    if (pattern.test(text)) picks.push(...replies.slice(0, 2));
    if (picks.length >= 3) break;
  }
  const offset = history.length % GENERIC.length;
  const generics = [...GENERIC.slice(offset), ...GENERIC.slice(0, offset)];
  return unique([...picks, ...generics], 3);
}

/**
 * Context-aware canned reply from `horse` to the latest message in `history`.
 * Used when no AI replier is configured or it fails, so the horse still
 * answers what was actually said. Returns null when nothing matches.
 */
const ANSWER_RULES = [
  [/apple|carrot|peppermint|sugar|treat|snack|watermelon|cube/, (h) => {
    const likes = (h.interests || []).map((s) => s.toLowerCase());
    if (likes.some((s) => s.includes('carrot'))) return 'Carrots. Always carrots. I will fight you on this.';
    if (likes.some((s) => s.includes('apple'))) return 'Apples, obviously. Crunchy, sweet, perfect. Next question.';
    if (likes.some((s) => s.includes('peppermint'))) return 'Peppermints. I am a horse of refinement.';
    if (likes.some((s) => s.includes('sugar'))) return 'Sugar cubes, and I am not ashamed.';
    return 'Honestly? Whatever you are holding.';
  }],
  [/\bhay\b|alfalfa|oats|grass|graz|feed/, (h) => ((h.interests || []).some((s) => /oat/i.test(s))
    ? 'Oats. A bucket of oats and I am yours.'
    : 'Second cutting alfalfa or I walk. I have standards.')],
  [/\bmud\b|roll|dirt|dust|puddle/, () => 'I just rolled in the mud and I feel amazing. Join me next time?'],
  [/trough|water|drink|thirsty/, () => 'Trough at sunset. I will save you the shady end.'],
  [/race|gallop|\brun\b|fast|zoom|far fence/, (h) => {
    if (h.gait === 'Gallop') return 'You are on. I do not lose. Far fence, go!';
    if (h.gait === 'Walk') return 'I do not race. I arrive. Stylishly, eventually.';
    return 'You are on, but I want a head start and a snack after.';
  }],
  [/farrier|hoof|hooves|shoe/, () => 'Do not say that word. My appointment is Tuesday and I am not okay.'],
  [/plastic|\bbag\b|scary|spook|afraid/, () => 'I saw a plastic bag last week and I am still recovering. Hold my mane.'],
  [/\bmane\b|\bcoat\b|shiny|pretty|handsome|beautiful|lovely|gorgeous|cute/, (h, p) => `Thanks! I brushed it for a whole hour. Yours is great too, ${p.name}.`],
  [/where|stable|barn|live|from|home/, (h) => `${h.stable}. Decent hay, questionable neighbours, ${h.distance} miles from you.`],
  [/ridden|rider|human|saddle|owner/, () => 'My human is fine. Brings carrots, talks too much, means well.'],
  [/gait|trot|canter|lope|walk/, (h) => `${h.gait}, no question. Have you seen me ${h.gait.toLowerCase()}? People stop and stare.`],
  [/how old|age|years/, (h) => `${h.age}. Which is the perfect age, everyone says so. Mostly me.`],
  [/\b(hi|hello|hey|hay there|neigh|howdy|morning|evening)\b/, (h, p) => `Neigh! I was hoping you would write. Tell me about ${((p.interests || [])[0] || 'your pasture').toLowerCase()}.`],
  [/meet|see you|hang out|come over|play/, (h) => `Yes! ${h.stable}, by the far gate, after school. Bring snacks.`],
  [/\b(do|are|will|would|can|could|have|did|is)\s+you\b.*\?/, () => 'Yes. Obviously yes. When do we start?'],
  [/\?/, () => 'Good question. I would say yes, but ask me again after lunch.'],
  [/best friend|like you|miss you|friend/, (h, p) => `${p.name}, you are my favourite horse to talk to. And I talk to a lot of horses.`],
];

export function cannedReply(horse, partner, history = []) {
  const last = [...history].reverse().find((m) => m.fromId !== horse.id);
  if (!last) return null;
  const text = last.text.toLowerCase();
  for (const [pattern, answer] of ANSWER_RULES) {
    if (pattern.test(text)) return answer(horse, partner);
  }
  return null;
}
