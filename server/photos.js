import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHOTOS_DIR = resolve(fileURLToPath(new URL('../public/photos/', import.meta.url)));
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/**
 * Find real photos for seed horses. A photo for horse `h3` is any of
 * public/photos/h3.jpg|jpeg|png|webp. Optional public/photos/credits.json maps
 * ids to { author, license, source } so photographers get credited in the app.
 * @param {string} [dir]
 * @returns {{ [id: string]: { url: string, credit: object|null } }}
 */
export function loadPhotos(dir = PHOTOS_DIR) {
  if (!existsSync(dir)) return {};
  let credits = {};
  const creditsFile = join(dir, 'credits.json');
  if (existsSync(creditsFile)) {
    try { credits = JSON.parse(readFileSync(creditsFile, 'utf8')); } catch { credits = {}; }
  }
  const photos = {};
  for (const name of readdirSync(dir).sort()) {
    const m = /^(h\d+)\.([a-z0-9]+)$/i.exec(name);
    if (!m || !EXTENSIONS.includes(m[2].toLowerCase())) continue;
    const id = m[1].toLowerCase();
    if (photos[id]) continue; // first extension wins
    photos[id] = { url: `/photos/${name}`, credit: credits[id] || null };
  }
  return photos;
}
