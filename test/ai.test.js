import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersona, buildTurns, cleanReply, createClaudeReplier, DEFAULT_MODEL } from '../server/ai.js';
import { SEED_HORSES } from '../server/horses.js';

const horse = SEED_HORSES[0];
const partner = { ...SEED_HORSES[1], id: 'u1', name: 'Tester' };

test('persona carries both profiles and the in-character rules', () => {
  const p = buildPersona(horse, partner);
  assert.match(p, /You are Biscuit/);
  assert.match(p, /Willow Creek Stables/);
  assert.match(p, /became friends with Tester/);
  assert.match(p, /Never mention being an AI/);
  assert.match(p, /about ten years old/);
  assert.match(p, /trusted grown-up/);
  assert.doesNotMatch(p, /flirt/);
});

test('turns map the horse to assistant and always end on a user turn', () => {
  const history = [
    { fromId: 'h1', text: 'stray opener' },
    { fromId: 'u1', text: 'hi' },
    { fromId: 'h1', text: 'hello' },
    { fromId: 'u1', text: 'how are you' },
    { fromId: 'h1', text: 'trailing' },
  ];
  assert.deepEqual(buildTurns(history, 'h1'), [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'how are you' },
  ]);
  assert.deepEqual(buildTurns([], 'h1'), []);
});

test('cleanReply strips quotes and trims long output at a sentence', () => {
  assert.equal(cleanReply('"Neigh there."'), 'Neigh there.');
  const long = `${'Hay is great. '.repeat(60)}Trailing fragment without end`;
  const out = cleanReply(long);
  assert.ok(out.length <= 700);
  assert.ok(out.endsWith('.'));
});

test('replier returns null without credentials', () => {
  assert.equal(createClaudeReplier({ apiKey: undefined }), null);
});

test('replier calls the SDK with the persona and tidies the answer', async () => {
  const calls = [];
  const client = {
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: '  "Hay there, Tester! Trough at six?"  ' }] };
        },
      },
    },
  };
  const reply = createClaudeReplier({ client });
  const history = [{ fromId: 'u1', text: 'hello Biscuit' }];
  assert.equal(await reply({ horse, partner, history }), 'Hay there, Tester! Trough at six?');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEFAULT_MODEL);
  assert.match(calls[0].system, /You are Biscuit/);
  assert.deepEqual(calls[0].messages, [{ role: 'user', content: 'hello Biscuit' }]);
  assert.equal(calls[0].fallbacks, 'default');
  assert.deepEqual(calls[0].output_config, { effort: 'low' });
});

test('replier returns null on refusal, empty history, and errors', async () => {
  const warnings = [];
  const log = { warn: (m) => warnings.push(m) };
  let mode = 'refusal';
  const client = {
    beta: {
      messages: {
        create: async () => {
          if (mode === 'refusal') return { stop_reason: 'refusal', content: [] };
          throw new Error('rate limited');
        },
      },
    },
  };
  const reply = createClaudeReplier({ client, log });
  const history = [{ fromId: 'u1', text: 'hi' }];
  assert.equal(await reply({ horse, partner, history }), null);
  assert.equal(await reply({ horse, partner, history: [] }), null);
  mode = 'error';
  assert.equal(await reply({ horse, partner, history }), null);
  assert.equal(await reply({ horse, partner, history }), null);
  assert.equal(warnings.length, 1, 'warns once, not on every message');
});
