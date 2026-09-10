# 🐴 Horse Tinder

Swipe right on your next pasture partner. A dating app for horses, built with zero dependencies: Node's built-in HTTP server, an in-memory store, and a vanilla JavaScript frontend.

## Run it

```bash
npm start
# 🐴 Horse Tinder is trotting at http://localhost:3000
```

Requires Node 20 or newer. Nothing to install.

- `PORT=8080 npm start` to change the port.
- Data is saved to `data/db.json` so swipes and matches survive restarts. Set `DATA_FILE=` (empty) to keep everything in memory, or point it somewhere else.
- `npm run dev` restarts the server when files change.

## What it does

- **Create your horse.** Name, breed, colours, gait, interests, bio. Or hit "Try a demo horse" to get going instantly.
- **Swipe.** Drag cards left or right, flick up for a Super Neigh, or use the buttons. Arrow keys work too, plus `Z` to rewind and `I` for details.
- **Match.** Each card shows a compatibility score based on shared interests, gait and distance. Seed horses like you back deterministically when compatibility is high enough; a Super Neigh always lands.
- **Chat.** Matched horses reply to your messages. Unread badges, read receipts, quick replies, and an unmatch button for when it just isn't working out.
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
| `POST` | `/api/matches/:id/messages` | Body `{ fromId, text }`. Returns `{ message, replies }` |
| `DELETE` | `/api/matches/:id?as=:horseId` | Unmatch |

## Tests

```bash
npm test
```

Covers the matching logic, validation, persistence, and the HTTP API end to end.

## Layout

```
server/
  index.js   entry point (reads PORT and DATA_FILE)
  app.js     HTTP router and static file serving
  store.js   horses, swipes, matches, messages, compatibility
  horses.js  seed profiles and canned chat replies
public/
  index.html, styles.css, app.js   the frontend
test/
  store.test.js, api.test.js
```
