import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';

let server;
let base;

before(async () => {
  server = createApp({ store: new Store() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

test('serves the frontend shell and static assets', async () => {
  const home = await call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(home.data, /Horse Friends/);
  const css = await call('GET', '/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await call('GET', '/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('unknown non-API paths fall back to the SPA shell', async () => {
  const res = await call('GET', '/some/deep/link');
  assert.equal(res.status, 200);
  assert.match(res.data, /Horse Friends/);
});

test('path traversal is blocked', async () => {
  const res = await fetch(`${base}/../server/store.js`);
  const body = await res.text();
  assert.ok(!body.includes('class Store'));
});

test('health endpoint reports seeded horses', async () => {
  const res = await call('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(res.data.horses >= 16);
});

test('unknown API routes and methods', async () => {
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('DELETE', '/api/horses')).status, 405);
  assert.equal((await call('GET', '/api/horses/does-not-exist')).status, 404);
});

test('rejects invalid JSON and invalid horses', async () => {
  const raw = await fetch(`${base}/api/horses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(raw.status, 400);
  const bad = await call('POST', '/api/horses', { name: '', age: 5, sex: 'Mare' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /Name is required/);
});

test('full swipe, match and chat flow over HTTP', async () => {
  const created = await call('POST', '/api/horses', {
    name: 'Tester',
    age: 6,
    sex: 'Mare',
    gait: 'Lope',
    distance: 3,
    interests: ['Barrel racing', 'Carrots', 'Mud baths', 'Trail rides'],
  });
  assert.equal(created.status, 201);
  const me = created.data;

  const deck = await call('GET', `/api/horses/${me.id}/deck`);
  assert.equal(deck.status, 200);
  assert.ok(deck.data.length >= 16);
  assert.ok(deck.data.every((h) => h.id !== me.id));
  assert.ok(typeof deck.data[0].compatibility === 'number');

  // Super like guarantees a match with a seed horse.
  const target = deck.data[0];
  const swipe = await call('POST', `/api/horses/${me.id}/swipe`, { targetId: target.id, direction: 'super' });
  assert.equal(swipe.status, 200);
  assert.ok(swipe.data.match, 'super like should match');
  assert.deepEqual(swipe.data.ghosted, []);
  const matchId = swipe.data.match.id;

  const dup = await call('POST', `/api/horses/${me.id}/swipe`, { targetId: target.id, direction: 'like' });
  assert.equal(dup.status, 400);

  const matches = await call('GET', `/api/horses/${me.id}/matches`);
  assert.equal(matches.data.length, 1);
  assert.equal(matches.data[0].horse.id, target.id);
  assert.equal(matches.data[0].lastMessage, null);
  assert.equal(matches.data[0].status, 'active');

  const openers = await call('GET', `/api/matches/${matchId}/suggestions?as=${me.id}`);
  assert.equal(openers.status, 200);
  assert.equal(openers.data.source, 'rules');
  assert.equal(openers.data.suggestions.length, 3);
  assert.equal((await call('GET', `/api/matches/${matchId}/suggestions?as=h9`)).status, 400);

  const sent = await call('POST', `/api/matches/${matchId}/messages`, { fromId: me.id, text: 'Neigh!' });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.message.text, 'Neigh!');
  assert.equal(sent.data.replies.length, 2, 'a reply plus the one-time offer of help');
  assert.equal(sent.data.replies[1].kind, 'offer');
  assert.equal(sent.data.replies[1].text, deck.data[0].skill.offer);

  const help = await call('POST', `/api/matches/${matchId}/messages`, { fromId: me.id, text: 'Help me plan a wedding' });
  assert.equal(help.status, 201);
  assert.equal(help.data.message.kind, 'help');
  assert.equal(help.data.replies[0].kind, 'help');
  assert.equal(help.data.replies[0].text, deck.data[0].skill.fallback);

  const followUps = await call('GET', `/api/matches/${matchId}/suggestions?as=${me.id}`);
  assert.equal(followUps.data.suggestions.length, 3);
  assert.notDeepEqual(followUps.data.suggestions, openers.data.suggestions, 'suggestions change with the conversation');

  const after1 = await call('GET', `/api/horses/${me.id}/matches`);
  assert.equal(after1.data[0].unread, 3, 'chat reply, offer, and help reply');

  const msgs = await call('GET', `/api/matches/${matchId}/messages?as=${me.id}`);
  assert.equal(msgs.data.length, 5);
  const after2 = await call('GET', `/api/horses/${me.id}/matches`);
  assert.equal(after2.data[0].unread, 0);

  const stats = await call('GET', `/api/horses/${me.id}/stats`);
  assert.equal(stats.data.matches, 1);
  assert.equal(stats.data.swiped, 1);
  assert.equal(stats.data.reputation.score, 54, 'two messages sent');
  assert.equal(stats.data.aiReplies, false);

  const patched = await call('PATCH', `/api/horses/${me.id}`, { name: 'Tester II' });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.name, 'Tester II');

  const outsider = target.id === 'h2' ? 'h3' : 'h2';
  const forbidden = await call('DELETE', `/api/matches/${matchId}?as=${outsider}`);
  assert.equal(forbidden.status, 400);
  const removed = await call('DELETE', `/api/matches/${matchId}?as=${me.id}`);
  assert.equal(removed.status, 200);
  assert.equal((await call('GET', `/api/horses/${me.id}/matches`)).data.length, 0);
});
