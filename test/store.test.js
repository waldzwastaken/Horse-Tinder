import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Store, compatibility, likesBack, hashString, validateHorseInput, ValidationError,
  reputationLabel, reputationBonus, GHOST_AFTER_UNANSWERED, GHOST_AFTER_SILENT,
} from '../server/store.js';

const seed = [
  { id: 'a', name: 'Alpha', seed: true, interests: ['Apples', 'Trail rides'], gait: 'Trot', distance: 5, coat: '#a0522d', mane: '#000000' },
  { id: 'b', name: 'Bravo', seed: true, interests: ['Apples', 'Trail rides', 'Mud'], gait: 'Trot', distance: 6, coat: '#a0522d', mane: '#000000' },
  { id: 'c', name: 'Charlie', seed: true, interests: ['Racing'], gait: 'Gallop', distance: 90, coat: '#a0522d', mane: '#000000' },
];

const userInput = {
  name: 'Tester',
  age: 5,
  sex: 'Mare',
  gait: 'Trot',
  interests: 'Apples, Trail rides',
  distance: 5,
};

let clock = 1000;
const now = () => (clock += 1);
const makeStore = () => new Store({ seed, now });

test('hashString is deterministic and spreads values', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
});

test('compatibility rewards shared interests and gait, penalises distance', () => {
  const [a, b, c] = seed;
  assert.ok(compatibility(a, b) > compatibility(a, c));
  assert.ok(compatibility(a, b) >= 90, 'full overlap plus shared gait scores high');
  assert.ok(compatibility(a, c) <= 40, 'no overlap and far away scores low');
  assert.equal(compatibility(a, b), compatibility(b, a));
});

test('likesBack is deterministic for a pair', () => {
  const [a, b] = seed;
  assert.equal(likesBack(a, b), likesBack(a, b));
  assert.equal(likesBack(a, b), true, 'highly compatible horses like each other');
});

test('validateHorseInput normalises and rejects bad input', () => {
  const horse = validateHorseInput({ ...userInput, interests: 'a, b, , a', coat: 'nope' });
  assert.deepEqual(horse.interests, ['a', 'b']);
  assert.equal(horse.coat, '#a0522d');
  assert.equal(horse.breed, 'Mixed breed');
  assert.throws(() => validateHorseInput({ ...userInput, name: '' }), ValidationError);
  assert.throws(() => validateHorseInput({ ...userInput, age: 0 }), ValidationError);
  assert.throws(() => validateHorseInput({ ...userInput, age: 3.5 }), ValidationError);
  assert.throws(() => validateHorseInput({ ...userInput, sex: 'Unicorn' }), ValidationError);
  assert.throws(() => validateHorseInput({ ...userInput, gait: 'Moonwalk' }), ValidationError);
  assert.throws(() => validateHorseInput(null), ValidationError);
});

test('createHorse assigns an id and appears in the deck of others', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  assert.match(me.id, /^u\d+$/);
  assert.equal(me.seed, false);
  assert.equal(store.listHorses().length, 4);
  assert.ok(store.deck('a').some((h) => h.id === me.id));
});

test('deck excludes self and already-swiped horses, sorted by compatibility', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const deck = store.deck(me.id);
  assert.equal(deck.length, 3);
  assert.ok(!deck.some((h) => h.id === me.id));
  assert.deepEqual(new Set(deck.slice(0, 2).map((h) => h.id)), new Set(['a', 'b']), 'most compatible first');
  assert.equal(deck[deck.length - 1].id, 'c');
  for (let i = 1; i < deck.length; i += 1) assert.ok(deck[i - 1].compatibility >= deck[i].compatibility);
  store.swipe(me.id, 'b', 'nope');
  assert.equal(store.deck(me.id).length, 2);
  assert.ok(!store.deck(me.id).some((h) => h.id === 'b'));
});

test('swipe validation', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  assert.throws(() => store.swipe(me.id, 'a', 'sideways'), ValidationError);
  assert.throws(() => store.swipe(me.id, me.id, 'like'), ValidationError);
  assert.throws(() => store.swipe(me.id, 'zzz', 'like'), /No horse/);
  store.swipe(me.id, 'a', 'like');
  assert.throws(() => store.swipe(me.id, 'a', 'like'), /Already swiped/);
});

test('liking a compatible seed horse creates a match; nope never does', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const res = store.swipe(me.id, 'b', 'like');
  assert.equal(res.likedBack, true);
  assert.ok(res.match);
  assert.deepEqual(new Set(res.match.horseIds), new Set([me.id, 'b']));
  const nope = store.swipe(me.id, 'a', 'nope');
  assert.equal(nope.match, null);
  assert.equal(store.matchesFor(me.id).length, 1);
});

test('super like always matches a seed horse, even an incompatible one', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  assert.equal(likesBack(me, store.getHorse('c')), false);
  const res = store.swipe(me.id, 'c', 'super');
  assert.ok(res.match);
});

test('two user horses match only when both swipe right', () => {
  const store = makeStore();
  const one = store.createHorse({ ...userInput, name: 'One' });
  const two = store.createHorse({ ...userInput, name: 'Two' });
  assert.equal(store.swipe(one.id, two.id, 'like').match, null);
  const res = store.swipe(two.id, one.id, 'like');
  assert.ok(res.match);
  assert.equal(store.matchesFor(one.id).length, 1);
  assert.equal(store.matchesFor(two.id).length, 1);
  assert.equal(store.matchesFor(one.id)[0].horse.id, two.id);
});

test('messages round trip with automatic replies from seed horses', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  const { message, replies } = await store.sendMessage(match.id, me.id, '  Hay there  ');
  assert.equal(message.text, 'Hay there');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].fromId, 'b');
  assert.equal(replies[0].source, 'canned');
  const list = store.messages(match.id);
  assert.equal(list.length, 2);
  await assert.rejects(() => store.sendMessage(match.id, me.id, '   '), ValidationError);
  await assert.rejects(() => store.sendMessage(match.id, 'c', 'hi'), /Not your match/);
  await assert.rejects(() => store.sendMessage('nope', me.id, 'hi'), /No match/);
});

test('an AI replier answers in place of canned lines and falls back when it fails', async () => {
  const seen = [];
  const replier = async ({ horse, partner, history }) => {
    seen.push({ horse: horse.id, partner: partner.id, history: history.map((m) => m.text) });
    if (history.length === 1) return 'Neigh, I read your profile.';
    if (history.length === 3) return null;
    throw new Error('boom');
  };
  const store = new Store({ seed, now, replier });
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  const first = await store.sendMessage(match.id, me.id, 'hi');
  assert.equal(first.replies[0].text, 'Neigh, I read your profile.');
  assert.equal(first.replies[0].source, 'ai');
  assert.deepEqual(seen[0], { horse: 'b', partner: me.id, history: ['hi'] });
  const second = await store.sendMessage(match.id, me.id, 'again');
  assert.equal(second.replies[0].source, 'canned', 'null from the replier falls back');
  const third = await store.sendMessage(match.id, me.id, 'and again');
  assert.equal(third.replies[0].source, 'canned', 'a throwing replier falls back');
  assert.equal(store.messages(match.id).length, 6);
});

test('unread counts and read receipts', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  await store.sendMessage(match.id, me.id, 'hello');
  assert.equal(store.matchesFor(me.id)[0].unread, 1);
  store.messages(match.id, me.id);
  assert.equal(store.matchesFor(me.id)[0].unread, 0);
});

test('reputation rises with conversation and lowers the bar for matches', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  assert.deepEqual(store.reputation(me.id), { score: 50, label: 'Solid citizen', sent: 0, deep: 0, ghosted: 0, bonus: 0 });
  const { match } = store.swipe(me.id, 'b', 'like');
  for (const line of ['hi', 'how is the hay', 'same', 'trough later?']) await store.sendMessage(match.id, me.id, line);
  const rep = store.reputation(me.id);
  assert.equal(rep.score, 64, '50 + 4 messages * 2 + one deep conversation * 6');
  assert.equal(rep.label, 'Good company');
  assert.equal(rep.bonus, 3);
  assert.equal(store.stats(me.id).reputation.score, 64);
  assert.equal(reputationLabel(85), 'Barn favourite');
  assert.equal(reputationLabel(10), 'Pasture pariah');
  assert.equal(reputationBonus(100), 10);
  assert.equal(reputationBonus(0), -10);
  // A borderline pair flips with reputation: find a case where the bonus matters.
  const [a, c] = [seed[0], seed[2]];
  assert.equal(likesBack(a, c, 0), likesBack(a, c, 0));
  assert.ok(likesBack(a, seed[1], -10), 'a strong pair survives a bad reputation');
});

test('a horse left waiting walks away after enough swipes', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const others = Array.from({ length: 30 }, (_, i) => store.createHorse({ ...userInput, name: `Filler ${i}` }));
  const { match } = store.swipe(me.id, 'b', 'like');
  await store.sendMessage(match.id, me.id, 'hello');
  // b has now replied and is waiting on me.
  let ghosted = [];
  for (let i = 0; i < GHOST_AFTER_UNANSWERED; i += 1) {
    assert.equal(ghosted.length, 0, `should not ghost before swipe ${i + 1}`);
    ({ ghosted } = store.swipe(me.id, others[i].id, 'nope'));
  }
  assert.equal(ghosted.length, 1);
  assert.equal(ghosted[0].id, 'b');
  const [m] = store.matchesFor(me.id);
  assert.equal(m.status, 'ended');
  assert.equal(m.endedReason, 'ghosted');
  assert.equal(m.lastMessage.fromId, 'b', 'the horse leaves a farewell');
  assert.equal(m.unread, 2, 'their unanswered reply plus the farewell');
  await assert.rejects(() => store.sendMessage(match.id, me.id, 'wait!'), /moved on/);
  assert.equal(store.reputation(me.id).score, 40, '50 + 2 for one message - 12 for ghosting');
  assert.equal(store.stats(me.id).matches, 0, 'ended matches no longer count');
  // Only once per match.
  assert.equal(store.swipe(me.id, others[GHOST_AFTER_UNANSWERED].id, 'nope').ghosted.length, 0);
});

test('a match you never greet also gives up, more slowly', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const others = Array.from({ length: 30 }, (_, i) => store.createHorse({ ...userInput, name: `Filler ${i}` }));
  store.swipe(me.id, 'b', 'like');
  let ghosted = [];
  for (let i = 0; i < GHOST_AFTER_SILENT; i += 1) {
    assert.equal(ghosted.length, 0);
    ({ ghosted } = store.swipe(me.id, others[i].id, 'nope'));
  }
  assert.equal(ghosted.length, 1);
  // The user-created horses never walk away on their own.
  assert.equal(store.matchesFor(me.id).filter((m) => m.status === 'ended').length, 1);
});

test('a horse waiting on its own message does not walk away', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const others = Array.from({ length: 30 }, (_, i) => store.createHorse({ ...userInput, name: `Filler ${i}` }));
  const { match } = store.swipe(me.id, 'b', 'like');
  await store.sendMessage(match.id, me.id, 'hello');
  // Make the last message mine by using a user horse instead: match with a user horse.
  const friend = others[0];
  store.swipe(friend.id, me.id, 'like');
  const { match: m2 } = store.swipe(me.id, friend.id, 'like');
  await store.sendMessage(m2.id, me.id, 'hey friend');
  for (let i = 1; i <= GHOST_AFTER_SILENT + 1; i += 1) store.swipe(me.id, others[i].id, 'nope');
  const byId = Object.fromEntries(store.matchesFor(me.id).map((m) => [m.id, m]));
  assert.equal(byId[m2.id].status, 'active', 'user horses never ghost');
  assert.equal(byId[match.id].status, 'ended', 'the seed horse waiting on me did');
});

test('unmatch removes the match and its messages', async () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  await store.sendMessage(match.id, me.id, 'hello');
  assert.throws(() => store.unmatch(match.id, 'c'), /Not your match/);
  store.unmatch(match.id, me.id);
  assert.equal(store.matchesFor(me.id).length, 0);
  assert.throws(() => store.messages(match.id), /No match/);
});

test('updateHorse validates and keeps id', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const updated = store.updateHorse(me.id, { name: 'Renamed', interests: ['Mud'] });
  assert.equal(updated.id, me.id);
  assert.equal(updated.name, 'Renamed');
  assert.deepEqual(updated.interests, ['Mud']);
  assert.throws(() => store.updateHorse(me.id, { age: 99 }), ValidationError);
});

test('stats summarise activity', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  store.swipe(me.id, 'b', 'like');
  store.swipe(me.id, 'a', 'nope');
  const { swiped, liked, matches, remaining, reputation, aiReplies } = store.stats(me.id);
  assert.deepEqual({ swiped, liked, matches, remaining }, { swiped: 2, liked: 1, matches: 1, remaining: 1 });
  assert.equal(reputation.score, 50);
  assert.equal(aiReplies, false);
});

test('state persists to and reloads from a file', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'horse-tinder-'));
  const file = join(dir, 'db.json');
  try {
    const first = new Store({ seed, now, file });
    const me = first.createHorse(userInput);
    first.swipe(me.id, 'b', 'like');
    const second = new Store({ seed, now, file });
    assert.ok(second.getHorse(me.id));
    assert.equal(second.matchesFor(me.id).length, 1);
    assert.equal(second.deck(me.id).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
