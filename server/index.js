import { createApp } from './app.js';
import { Store } from './store.js';

const port = Number(process.env.PORT) || 3000;
const file = process.env.DATA_FILE ?? 'data/db.json';
const store = new Store({ file: file === '' ? null : file });
const server = createApp({ store });

server.listen(port, () => {
  console.log(`🐴 Horse Tinder is trotting at http://localhost:${port}`);
  if (store.file) console.log(`   Persisting to ${store.file} (set DATA_FILE= to disable)`);
});
