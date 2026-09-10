# 🐴 Horse Tinder

Swipe right on your next pasture partner. A dating app for horses: Node's built-in HTTP server, an in-memory store, and a vanilla JavaScript frontend. The only dependency is the Anthropic SDK, and that is optional.

## Run it

```bash
npm start
# 🐴 Horse Tinder is trotting at http://localhost:3000
```

Requires Node 20 or newer. Without an API key the horses reply with canned lines and nothing needs installing.

To let the horses talk back for real:

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

- `PORT=8080 npm start` to change the port.
- Data is saved to `data/db.json` so swipes and matches survive restarts. Set `DATA_FILE=` (empty) to keep everything in memory, or point it somewhere else.
- `HORSE_AI_MODEL` overrides the model used for replies (default `claude-opus-5`).
- `npm run dev` restarts the server when files change.

## What it does

- **Create your horse.** Name, breed, colours, gait, interests, bio. Or hit "Try a demo horse" to get going instantly.
- **Swipe.** Drag cards left or right, flick up for a Super Neigh, or use the buttons. Arrow keys work too, plus `Z` to rewind and `I` for details.
- **Match.** Each card shows a compatibility score based on shared interests, gait and distance. Seed horses like you back deterministically when compatibility is high enough; a Super Neigh always lands.
- **Chat.** Matched horses reply to your messages. Unread badges, read receipts, quick replies, and an unmatch button for when it just isn't working out.
- **AI replies.** With an API key set, every seed horse answers in character through Claude, using its profile and yours as the persona. Replies are one or two sentences, and if the API is unavailable or declines, the horse falls back to a canned line so the chat never stalls.
- **Suggested replies.** The pills above the message box are real candidate replies to the latest message, not fixed phrases. With an API key they are written by Claude in your horse's voice (one playful, one curious, one bold) as structured JSON. Without one, rules read the horse's last message and your shared interests: openers mention what you have in common, and a horse asking "apples or peppermints?" gets pills that answer it. Tap a pill to put it in the box, edit if you like, and send.
- **Stable reputation.** A score from 0 to 100 shown on your profile. Sending messages and holding real conversations (four or more messages to one horse) raise it. Being ghosted lowers it. The score shifts how likely horses are to like you back by up to ten points either way.
- **Ghosting has consequences.** If a horse is waiting on your reply and you keep swiping (six swipes), or you never say hello after matching (twelve swipes), it sends a sad farewell and the match ends. Ended matches sit in a "Walked away" section and can be read but not replied to.
- **Profile.** Edit your horse and see your stats.

Two user-created horses can also match each other if they both swipe right, so you can open two browsers and play both sides.

## API

All responses are JSON.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check and horse count |
| `GET` | `/api/horses` | Every horse |
| `POST` | `/api/horses` | Create your horse |
| `GET` | `/api/horses/:id` | One horse |
| `PATCH` | `/api/horses/:id` | Update a horse |
| `GET` | `/api/horses/:id/deck` | Horses `:id` has not swiped on, best matches first |
| `POST` | `/api/horses/:id/swipe` | Body `{ targetId, direction: "like" \| "nope" \| "super" }`. Returns `{ match, likedBack }` |
| `GET` | `/api/horses/:id/matches` | Matches with the other horse, last message and unread count |
| `GET` | `/api/horses/:id/stats` | Swiped, liked, matches, remaining |
| `GET` | `/api/matches/:id/messages?as=:horseId` | Messages; passing `as` marks them read |
| `GET` | `/api/matches/:id/suggestions?as=:horseId` | Up to three replies `as` could send next, with `source: "ai"`, `"rules"` or `"none"` |
| `POST` | `/api/matches/:id/messages` | Body `{ fromId, text }`. Returns `{ message, replies }`; each reply carries `source: "ai"` or `"canned"` |
| `DELETE` | `/api/matches/:id?as=:horseId` | Unmatch |

## Tests

```bash
npm test
```

Covers the matching logic, reputation and ghosting rules, the AI replier and suggester (with a fake client, no key needed), the rule-based suggestions, validation, persistence, and the HTTP API end to end.

## Layout

```
server/
  index.js   entry point (reads PORT and DATA_FILE)
  app.js     HTTP router and static file serving
  store.js   horses, swipes, matches, messages, compatibility, reputation
  ai.js      Claude persona replies and reply suggestions (optional)
  suggest.js rule-based reply suggestions
  horses.js  seed profiles, canned chat replies and farewells
public/
  index.html, styles.css, app.js   the frontend
test/
  store.test.js, api.test.js, ai.test.js, suggest.test.js
```
