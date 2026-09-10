# 🐴 Horse Friends

Find your herd. A friendship app for horses, aimed at ten-year-olds: Node's built-in HTTP server, an in-memory store, and a vanilla JavaScript frontend. The only dependency is the Anthropic SDK, and that is optional.

## Run it

```bash
npm start
# 🐴 Horse Friends is trotting at http://localhost:3000
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

## Made for a ten-year-old

The app is framed around friendship, not dating: you meet horses, become friends, chat, and ask them for help. Every prompt sent to Claude tells the horse it is talking to a ten-year-old, to use simple words, to keep everything friendly and never romantic, never to ask for personal details, and to point a child who seems upset toward a trusted grown-up. The scripted fallback lines follow the same rules. Skills are the things a kid actually needs help with: getting started on homework, explaining fractions, calming down, being brave for a tryout, writing a thank-you card.

## What it does

- **Sixteen personalities, sixteen skills.** Every seed horse is built around one personality type, from Biscuit the ESTP daredevil to Sir Reginald the INTJ strategist. The type shapes the bio, the voice in chat, and a skill the horse can help you with: Big Red splits a big project into steps, Muffin decides when you can't, Willow gets you brave for the tryout. Cards show the type and skill.
- **Just ask.** There is no help button. After your first exchange each horse mentions what it is good at, one of the suggested replies is always a way to ask, and when you do ask the horse helps properly, still in character. With Claude on, the horse reads your message and decides whether you want a chat or real help; without it, a keyword rule picks the horse's scripted method for its skill.
- **Create your horse.** Name, breed, colours, gait, interests, bio. Or hit "Try a demo horse" to get going instantly.
- **Meet.** Drag cards left or right, flick up for a Super Neigh, or use the buttons. Arrow keys work too, plus `Z` to rewind and `I` for details.
- **Make friends.** Each card shows a friend-match score based on shared interests, gait and distance. Seed horses say yes deterministically when the score is high enough; a Super Neigh always lands.
- **Chat.** Your horse friends reply to your messages. Unread badges, read receipts, suggested replies, and a goodbye button.
- **AI replies.** With an API key set, every seed horse answers in character through Claude, using its profile and yours as the persona. Replies are one or two sentences. If the API is unavailable or declines, the horse falls back to a scripted answer that still responds to what you said (ask "apples or carrots?" and a carrot lover says carrots), and only then to a general line, so the chat never stalls or loses the thread.
- **Suggested replies.** The pills above the message box are real candidate replies to the latest message, not fixed phrases. With an API key they are written by Claude in your horse's voice (one playful, one curious, one bold) as structured JSON. Without one, rules read the horse's last message and your shared interests: openers mention what you have in common, and a horse asking "apples or peppermints?" gets pills that answer it. Tap a pill to put it in the box, edit if you like, and send.
- **Friend score.** A score from 0 to 100 shown on your profile. Sending messages and holding real conversations (four or more messages to one horse) raise it. Being ghosted lowers it. The score shifts how likely horses are to like you back by up to ten points either way.
- **Ghosting has consequences.** If a horse is waiting on your reply and you keep swiping (six swipes), or you never say hello after matching (twelve swipes), it sends a farewell and wanders back to the herd. Ended friendships sit in a "Wandered off" section and can be read but not replied to.
- **Profile.** Edit your horse and see your stats.

Two user-created horses can also match each other if they both swipe right, so you can open two browsers and play both sides.

## Real photos

The horses ship as drawings until you add photographs. Drop one file per horse into `public/photos/` named by id (`h1.jpg` for Biscuit through `h16.jpg` for Starlight), commit them, and restart. Every card, avatar and profile switches to the photo, and an optional `credits.json` credits the photographer in the horse's profile. See `public/photos/README.md` for the id-to-horse list and formats. The hosted single-file build downsizes each photo to 720px and embeds it.

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
| `POST` | `/api/matches/:id/messages` | Body `{ fromId, text }`. Returns `{ message, replies }`; each message carries `kind` (`"chat"`, `"help"` or `"offer"`) and each reply `source: "ai"` or `"canned"` |
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
  suggest.js rule-based reply suggestions and scripted horse answers
  horses.js  seed profiles (type, voice, skill), canned chat replies and farewells
  photos.js  finds real photos in public/photos and their credits
public/
  index.html, styles.css, app.js   the frontend
test/
  store.test.js, api.test.js, ai.test.js, suggest.test.js, horses.test.js, photos.test.js
```
