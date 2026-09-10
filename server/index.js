import { createApp } from './app.js';
import { Store } from './store.js';
import { createClaudeReplier, createClaudeSuggester } from './ai.js';

const port = Number(process.env.PORT) || 3000;
const file = process.env.DATA_FILE ?? 'data/db.json';
const replier = createClaudeReplier();
const suggester = createClaudeSuggester();
const store = new Store({ file: file === '' ? null : file, replier, suggester });
const server = createApp({ store });

server.listen(port, () => {
  console.log(`🐴 Horse Tinder is trotting at http://localhost:${port}`);
  if (store.file) console.log(`   Persisting to ${store.file} (set DATA_FILE= to disable)`);
  console.log(replier
    ? '   AI replies: on (horses answer and reply suggestions come through Claude)'
    : '   AI replies: off (set ANTHROPIC_API_KEY to let horses talk back for real)');
});
