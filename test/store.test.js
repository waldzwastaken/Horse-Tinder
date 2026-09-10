import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, compatibility, likesBack, hashString, validateHorseInput, ValidationError } from '../server/store.js';

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

test('messages round trip with automatic replies from seed horses', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  const { message, replies } = store.sendMessage(match.id, me.id, '  Hay there  ');
  assert.equal(message.text, 'Hay there');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].fromId, 'b');
  const list = store.messages(match.id);
  assert.equal(list.length, 2);
  assert.throws(() => store.sendMessage(match.id, me.id, '   '), ValidationError);
  assert.throws(() => store.sendMessage(match.id, 'c', 'hi'), /Not your match/);
  assert.throws(() => store.sendMessage('nope', me.id, 'hi'), /No match/);
});

test('unread counts and read receipts', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  store.sendMessage(match.id, me.id, 'hello');
  assert.equal(store.matchesFor(me.id)[0].unread, 1);
  store.messages(match.id, me.id);
  assert.equal(store.matchesFor(me.id)[0].unread, 0);
});

test('unmatch removes the match and its messages', () => {
  const store = makeStore();
  const me = store.createHorse(userInput);
  const { match } = store.swipe(me.id, 'b', 'like');
  store.sendMessage(match.id, me.id, 'hello');
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
  assert.deepEqual(store.stats(me.id), { swiped: 2, liked: 1, matches: 1, remaining: 1 });
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
