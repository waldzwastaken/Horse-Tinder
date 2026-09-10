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

test('persona carries the type, voice and skill, and switches into help mode', () => {
  const horse = new Store().getHorse('h6');
  const partner = { name: 'Tester', age: 6, sex: 'Mare', breed: 'Cob', stable: 'Test Barn', bio: 'Testing.', interests: ['Oats'] };
  const chat = buildPersona(horse, partner);
  assert.match(chat, /ISFJ, The Gentle Giant/);
  assert.match(chat, /How you talk: Steady/);
  assert.match(chat, /heavy lifter is your thing/);
  assert.match(chat, /one or two short sentences/);
  const help = buildPersona(horse, partner, { mode: 'help' });
  assert.match(help, /asked you for help, and this is your skill: Heavy lifter/);
  assert.match(help, /four to six ordered pieces/);
  assert.match(help, /at most four short sentences/);
  assert.doesNotMatch(help, /flirty/);
  assert.doesNotMatch(help, /\n\n\n/, 'no triple blank lines');
});

test('help mode uses the skill and its scripted fallback', async () => {
  let clock = 0;
  const seen = [];
  const replier = async ({ horse, mode }) => { seen.push({ horse: horse.id, mode }); return null; };
  const store = new Store({ now: () => (clock += 1), replier });
  const me = store.createHorse({ name: 'Tester', age: 6, sex: 'Mare', interests: ['Oats'], gait: 'Walk' });
  const { match } = store.swipe(me.id, 'h6', 'super');
  const { message, replies } = await store.sendMessage(match.id, me.id, 'I have to move house and I cannot start', 'help');
  assert.equal(message.kind, 'help');
  assert.equal(replies[0].kind, 'help');
  assert.equal(replies[0].text, store.getHorse('h6').skill.fallback);
  assert.deepEqual(seen, [{ horse: 'h6', mode: 'help' }]);
  const chat = await store.sendMessage(match.id, me.id, 'thanks, also apples or carrots?');
  assert.equal(chat.message.kind, 'chat');
  assert.match(chat.replies[0].text, /holding|Apples|Carrots|Peppermints/);
  await assert.rejects(() => store.sendMessage(match.id, me.id, 'x', 'therapy'), /Mode must be/);
});
