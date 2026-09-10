import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPhotos } from '../server/photos.js';
import { Store } from '../server/store.js';

test('loadPhotos maps files named by horse id and attaches credits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'horse-photos-'));
  try {
    for (const f of ['h1.jpg', 'h2.png', 'h2.jpg', 'H3.JPEG', 'notes.txt', 'h4.gif', 'hx.jpg']) writeFileSync(join(dir, f), 'x');
    writeFileSync(join(dir, 'credits.json'), JSON.stringify({ h2: { author: 'A. Photographer', license: 'CC BY 4.0' } }));
    const photos = loadPhotos(dir);
    assert.deepEqual(Object.keys(photos).sort(), ['h1', 'h2', 'h3']);
    assert.equal(photos.h1.url, '/photos/h1.jpg');
    assert.equal(photos.h1.credit, null);
    assert.equal(photos.h2.url, '/photos/h2.jpg', 'first extension in sorted order wins');
    assert.equal(photos.h2.credit.author, 'A. Photographer');
    assert.equal(photos.h3.url, '/photos/H3.JPEG');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(loadPhotos(join(tmpdir(), 'does-not-exist-' + Date.now())), {});
});

test('store attaches photos to seed horses and leaves the rest on drawings', () => {
  const store = new Store({ photos: { h2: { url: '/photos/h2.jpg', credit: { author: 'Someone' } } } });
  assert.equal(store.getHorse('h2').photo, '/photos/h2.jpg');
  assert.equal(store.getHorse('h2').photoCredit.author, 'Someone');
  assert.equal(store.getHorse('h1').photo, null);
  const deck = store.deck('h1');
  assert.ok(deck.some((h) => h.id === 'h2' && h.photo));
});
