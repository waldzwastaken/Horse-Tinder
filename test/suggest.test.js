import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestReplies, cannedReply, looksLikeHelpRequest, splitHelpTag } from '../server/suggest.js';
import { buildSuggestionPrompt, parseSuggestions, createClaudeSuggester, SUGGESTION_SCHEMA } from '../server/ai.js';
import { Store } from '../server/store.js';
import { SEED_HORSES } from '../server/horses.js';

const horse = SEED_HORSES[0]; // Biscuit: Barrel racing, Carrots, Mud baths, Trail rides
const partner = { id: 'u1', name: 'Tester', age: 6, sex: 'Mare', breed: 'Cob', stable: 'Test Barn', bio: 'Testing.', interests: ['Trail rides', 'Apples'], gait: 'Trot' };

test('openers use shared interests and the other horse', () => {
  const out = suggestReplies(horse, partner, []);
  assert.equal(out.length, 3);
  assert.match(out[0], /trail rides/);
  assert.match(out[1], /Biscuit/);
  assert.match(out[2], /lope/);
  const stranger = suggestReplies({ ...horse, interests: ['Opera'] }, partner, []);
  assert.match(stranger[0], /Hay there, Biscuit! How's life at Willow Creek Stables\?/);
});

test('replies answer the horse\'s latest message', () => {
  const carrots = suggestReplies(horse, partner, [{ fromId: 'h1', text: 'Be honest: apples or peppermints?' }]);
  assert.equal(carrots.length, 3);
  assert.ok(carrots.includes('Apples, no contest.'));
  const mud = suggestReplies(horse, partner, [{ fromId: 'u1', text: 'hi' }, { fromId: 'h1', text: 'I just rolled in the mud and I feel amazing. You?' }]);
  assert.ok(mud.includes('Mud is a lifestyle.'));
  const trough = suggestReplies(horse, partner, [{ fromId: 'h1', text: 'Wanna meet at the water trough later?' }]);
  assert.ok(trough.includes('Trough at sunset?'));
});

test('nudges when the partner spoke last, generics otherwise, never duplicates', () => {
  const nudge = suggestReplies(horse, partner, [{ fromId: 'u1', text: 'hello?' }]);
  assert.ok(nudge.some((s) => /Still there/.test(s)));
  const generic = suggestReplies(horse, partner, [{ fromId: 'h1', text: 'ok' }]);
  assert.equal(generic.length, 3);
  assert.equal(new Set(generic).size, 3);
  const later = suggestReplies(horse, partner, [{ fromId: 'h1', text: 'ok' }, { fromId: 'u1', text: 'ok' }, { fromId: 'h1', text: 'ok' }]);
  assert.notDeepEqual(generic, later, 'generic pool rotates with conversation length');
});

test('suggestion prompt carries both horses, the transcript and the JSON ask', () => {
  const p = buildSuggestionPrompt(horse, partner, [{ fromId: 'u1', text: 'hi' }, { fromId: 'h1', text: 'hello' }]);
  assert.match(p, /on behalf of Tester/);
  assert.match(p, /matched with Biscuit/);
  assert.match(p, /Tester: hi\nBiscuit: hello/);
  assert.match(p, /JSON only/);
  assert.match(buildSuggestionPrompt(horse, partner, []), /no messages yet/);
});

test('parseSuggestions validates and tidies model output', () => {
  assert.deepEqual(parseSuggestions('{"replies":[" \\"One\\" ","Two","Two","Three","Four"]}'), ['One', 'Two', 'Three']);
  assert.deepEqual(parseSuggestions(['A', 'B']), ['A', 'B']);
  assert.equal(parseSuggestions('not json'), null);
  assert.equal(parseSuggestions({ replies: [] }), null);
  assert.equal(parseSuggestions({ nope: true }), null);
  const long = parseSuggestions({ replies: ['x'.repeat(200)] });
  assert.ok(long[0].length <= 70);
});

test('suggester asks for structured JSON and falls back on refusal or error', async () => {
  const calls = [];
  let mode = 'ok';
  const client = { beta: { messages: { create: async (params) => {
    calls.push(params);
    if (mode === 'refusal') return { stop_reason: 'refusal', content: [] };
    if (mode === 'error') throw new Error('down');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"replies":["Hay there!","Trough later?","Race me."]}' }] };
  } } } };
  const warnings = [];
  const suggest = createClaudeSuggester({ client, log: { warn: (m) => warnings.push(m) } });
  const history = [{ fromId: 'h1', text: 'hello' }];
  assert.deepEqual(await suggest({ horse, partner, history }), ['Hay there!', 'Trough later?', 'Race me.']);
  assert.deepEqual(calls[0].output_config.format, { type: 'json_schema', schema: SUGGESTION_SCHEMA });
  assert.equal(calls[0].messages.length, 1);
  assert.equal(calls[0].fallbacks, 'default');
  mode = 'refusal';
  assert.equal(await suggest({ horse, partner, history }), null);
  mode = 'error';
  assert.equal(await suggest({ horse, partner, history }), null);
  assert.equal(warnings.length, 1);
  assert.equal(createClaudeSuggester({ apiKey: undefined }), null);
});

test('store serves AI suggestions, falls back to rules, and none once ended', async () => {
  let clock = 0;
  const now = () => (clock += 1);
  let fail = false;
  const suggester = async () => (fail ? null : ['AI one', 'AI two', 'AI three']);
  const store = new Store({ now, suggester });
  const me = store.createHorse({ name: 'Tester', age: 6, sex: 'Mare', interests: ['Trail rides', 'Apples'], gait: 'Trot' });
  const { match } = store.swipe(me.id, 'h1', 'super');
  const ask = SEED_HORSES.find((h) => h.id === 'h1').skill.ask;
  assert.deepEqual(await store.suggestions(match.id, me.id), { suggestions: ['AI one', 'AI two', ask], source: 'ai' }, 'the last pill always asks for help');
  fail = true;
  const rules = await store.suggestions(match.id, me.id);
  assert.equal(rules.source, 'rules');
  assert.equal(rules.suggestions.length, 3);
  assert.equal(rules.suggestions[2], ask);
  await assert.rejects(() => store.suggestions(match.id, 'h2'), /Not your match/);
  const plain = new Store({ now });
  const me2 = plain.createHorse({ name: 'Plain', age: 6, sex: 'Mare', interests: ['Carrots'], gait: 'Trot' });
  const { match: m2 } = plain.swipe(me2.id, 'h1', 'super');
  await plain.sendMessage(m2.id, me2.id, 'apples or carrots?');
  const after = await plain.suggestions(m2.id, me2.id);
  assert.equal(after.source, 'rules');
  assert.equal(after.suggestions.length, 3);
  assert.equal(after.suggestions[0], ask, 'right after the offer, the ask comes first');
  assert.match(after.suggestions[1], /Not right now/);
  // Ghost the match and confirm suggestions dry up.
  const fillers = Array.from({ length: 8 }, (_, i) => plain.createHorse({ name: `F${i}`, age: 5, sex: 'Mare' }));
  for (const f of fillers) plain.swipe(me2.id, f.id, 'nope');
  assert.deepEqual(await plain.suggestions(m2.id, me2.id), { suggestions: [], source: 'none' });
});

test('canned replies answer the question that was asked', () => {
  const ask = (text, h = horse) => cannedReply(h, partner, [{ fromId: 'u1', text }]);
  assert.match(ask('Be honest, Biscuit: apples or carrots?'), /Carrots/);
  assert.match(ask('apples or carrots?', SEED_HORSES[2]), /Peppermints/, 'Daisy prefers peppermints');
  assert.match(ask('Race you to the far fence?', SEED_HORSES[3]), /I do not lose/, 'Copper gallops');
  assert.match(ask('Race you?', SEED_HORSES[5]), /I arrive/, 'Big Red walks');
  assert.match(ask('Where do you live?'), /Willow Creek Stables/);
  assert.match(ask('You have a lovely mane'), /Tester/);
  assert.match(ask('hi'), /trail rides/);
  assert.match(ask('Do you like hay?'), /alfalfa/, 'hay outranks the generic yes');
  assert.match(ask('Would you come over?'), /Yes/);
  assert.equal(ask('xyzzy'), null, 'no rule, no answer');
  assert.equal(cannedReply(horse, partner, []), null);
  // The horse's own last message is ignored; it answers the partner's.
  assert.match(cannedReply(horse, partner, [{ fromId: 'u1', text: 'trough later?' }, { fromId: 'h1', text: 'mud!' }]), /Trough/);
});

test('store uses context-aware canned replies before the general pool', async () => {
  let clock = 0;
  const store = new Store({ now: () => (clock += 1) });
  const me = store.createHorse({ name: 'Tester', age: 6, sex: 'Mare', interests: ['Apples'], gait: 'Trot' });
  const { match } = store.swipe(me.id, 'h1', 'super');
  const { replies } = await store.sendMessage(match.id, me.id, 'Be honest, Biscuit: apples or carrots?');
  assert.match(replies[0].text, /Carrots/);
  assert.equal(replies[0].source, 'canned');
  const { replies: generic } = await store.sendMessage(match.id, me.id, 'xyzzy');
  assert.ok(generic[0].text.length > 0);
});

test('help requests are spotted by keyword, and the help tag is split from replies', () => {
  assert.ok(looksLikeHelpRequest('Can you help me with my homework?'));
  assert.ok(looksLikeHelpRequest('I am stuck on level 4'));
  assert.ok(looksLikeHelpRequest("I don't understand fractions"));
  assert.ok(looksLikeHelpRequest('how does a volcano work'));
  assert.ok(!looksLikeHelpRequest('apples or carrots?'));
  assert.ok(!looksLikeHelpRequest('Neigh! Nice mane.'));
  assert.deepEqual(splitHelpTag('[help] Do the first sock.'), { text: 'Do the first sock.', help: true });
  assert.deepEqual(splitHelpTag('[HELP]: Two steps.'), { text: 'Two steps.', help: true });
  assert.deepEqual(splitHelpTag('  Just hay talk. '), { text: 'Just hay talk.', help: false });
  assert.deepEqual(splitHelpTag(null), { text: '', help: false });
});
