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
  [/mane|coat|shiny|pretty|lovely|handsome|beautiful|noticed/, ['Yours is not bad either.', 'Stop, I am blushing under all this hair.']],
  [/ridden|rider|human|saddle/, ['Depends who is asking.', 'My human is fine. Yours?']],
  [/pasture|side|field|stall|barn/, ['Left side, obviously.', 'Wherever you are, apparently.']],
  [/\?/, ['Good question. You first.', 'Yes. Obviously yes.']],
];

const GENERIC = ['Ha! Same here.', 'Tell me more.', 'Meet at the fence later?', 'You are trouble, I can tell.', 'Noted. Continue.'];

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
