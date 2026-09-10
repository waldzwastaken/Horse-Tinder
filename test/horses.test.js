import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_HORSES, TYPE_NAMES } from '../server/horses.js';
import { buildPersona } from '../server/ai.js';
import { Store } from '../server/store.js';

test('every seed horse has a distinct personality type and a complete skill', () => {
  const types = SEED_HORSES.map((h) => h.type);
  assert.equal(new Set(types).size, 16, 'all sixteen types are used once');
  for (const h of SEED_HORSES) {
    assert.match(h.type, /^[EI][NS][FT][JP]$/, `${h.name} has a valid type`);
    assert.ok(TYPE_NAMES[h.type], `${h.name}'s type has a name`);
    assert.ok(h.voice.length > 10, `${h.name} has a voice`);
    for (const key of ['name', 'tagline', 'prompt', 'fallback']) assert.ok(h.skill[key]?.length > 5, `${h.name} skill has ${key}`);
    assert.ok(h.interests.length >= 4);
    assert.ok(h.bio.length > 40);
  }
});

test('store attaches type names to seed horses, including previously saved ones', () => {
  const store = new Store();
  const reg = store.getHorse('h8');
  assert.equal(reg.type, 'INTJ');
  assert.equal(reg.typeName, 'The Strategist');
  assert.equal(reg.skill.name, 'Strategy');
});

test('persona carries the type, voice and skill, and asks for the help tag', () => {
  const horse = new Store().getHorse('h6');
  const partner = { name: 'Tester', age: 6, sex: 'Mare', breed: 'Cob', stable: 'Test Barn', bio: 'Testing.', interests: ['Oats'] };
  const persona = buildPersona(horse, partner);
  assert.match(persona, /ISFJ, The Gentle Giant/);
  assert.match(persona, /How you talk: Steady/);
  assert.match(persona, /good at one thing: Heavy lifter/);
  assert.match(persona, /four to six pieces in order/);
  assert.match(persona, /one or two short sentences/);
  assert.match(persona, /exact tag \[help\]/);
  assert.match(persona, /do not keep bringing it up/);
  assert.doesNotMatch(persona, /flirt/);
  assert.match(persona, /suitable for a ten-year-old/);
  assert.doesNotMatch(persona, /\n\n\n/, 'no triple blank lines');
  assert.doesNotMatch(buildPersona({ ...horse, skill: null }, partner), /\[help\]/);
});

test('without AI the horse helps when the message asks for it, and offers its skill once', async () => {
  let clock = 0;
  const seen = [];
  const replier = async ({ horse }) => { seen.push(horse.id); return null; };
  const store = new Store({ now: () => (clock += 1), replier });
  const me = store.createHorse({ name: 'Tester', age: 6, sex: 'Mare', interests: ['Oats'], gait: 'Walk' });
  const { match } = store.swipe(me.id, 'h6', 'super');
  const { message, replies } = await store.sendMessage(match.id, me.id, 'I have to move house and I cannot start');
  assert.equal(message.kind, 'help');
  assert.equal(replies[0].kind, 'help');
  assert.equal(replies[0].text, store.getHorse('h6').skill.fallback);
  assert.equal(replies[1].kind, 'offer', 'the first exchange ends with the horse offering its skill');
  assert.equal(replies[1].text, store.getHorse('h6').skill.offer);
  assert.deepEqual(seen, ['h6']);
  const chat = await store.sendMessage(match.id, me.id, 'thanks, also apples or carrots?');
  assert.equal(chat.message.kind, 'chat');
  assert.equal(chat.replies.length, 1, 'the offer is made only once');
  assert.match(chat.replies[0].text, /holding|Apples|Carrots|Peppermints/);
});

test('with AI the horse decides what counts as help through the tag', async () => {
  let clock = 0;
  let answer = '[help] Open the box. Take out one thing. Tell me when it is done.';
  const store = new Store({ now: () => (clock += 1), replier: async () => answer });
  const me = store.createHorse({ name: 'Tester', age: 6, sex: 'Mare', interests: ['Oats'], gait: 'Walk' });
  const { match } = store.swipe(me.id, 'h6', 'super');
  const tagged = await store.sendMessage(match.id, me.id, 'ugh, moving day');
  assert.equal(tagged.message.kind, 'help', 'the sent message is relabelled from the reply');
  assert.equal(tagged.replies[0].kind, 'help');
  assert.equal(tagged.replies[0].source, 'ai');
  assert.equal(tagged.replies[0].text, 'Open the box. Take out one thing. Tell me when it is done.');
  answer = 'Ha, same. The trough is the best bit of my day.';
  const plain = await store.sendMessage(match.id, me.id, 'help, what is your favourite part of the day?');
  assert.equal(plain.message.kind, 'chat', 'an untagged reply means the horse judged it small talk');
  assert.equal(plain.replies[0].kind, 'chat');
});
