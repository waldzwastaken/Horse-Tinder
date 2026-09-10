import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_HORSES, HORSE_REPLIES } from './horses.js';

const VALID_SEX = ['Mare', 'Stallion', 'Gelding'];
const VALID_GAIT = ['Walk', 'Trot', 'Canter', 'Lope', 'Gallop'];
const DIRECTIONS = ['like', 'nope', 'super'];

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

/** Small deterministic string hash (FNV-1a), used so seed horses "like back" consistently. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Compatibility score from 0 to 100 between two horses.
 * Shared interests dominate, a shared gait helps, and distance drags it down a little.
 */
export function compatibility(a, b) {
  const aInterests = new Set((a.interests || []).map((s) => s.toLowerCase()));
  const shared = (b.interests || []).filter((s) => aInterests.has(s.toLowerCase())).length;
  const maxPossible = Math.max(1, Math.min(aInterests.size, (b.interests || []).length));
  let score = 40 + Math.round((shared / maxPossible) * 45);
  if (a.gait && b.gait && a.gait === b.gait) score += 10;
  const dist = Math.abs((a.distance || 0) - (b.distance || 0));
  score -= Math.min(15, Math.floor(dist / 4));
  return Math.max(0, Math.min(100, score));
}

/**
 * Whether horse `b` would swipe right on horse `a`. Deterministic for a given pair,
 * so the outcome does not change between page loads.
 */
export function likesBack(a, b) {
  const score = compatibility(a, b);
  const jitter = hashString(`${a.id}::${b.id}`) % 40; // 0..39
  return score + jitter >= 75;
}

function clean(str, max) {
  return String(str ?? '').trim().slice(0, max);
}

export function validateHorseInput(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('Body must be an object');
  const name = clean(input.name, 40);
  if (!name) throw new ValidationError('Name is required');
  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 1 || age > 45) throw new ValidationError('Age must be a whole number between 1 and 45');
  const sex = clean(input.sex, 20);
  if (!VALID_SEX.includes(sex)) throw new ValidationError(`Sex must be one of ${VALID_SEX.join(', ')}`);
  const gait = clean(input.gait, 20) || 'Trot';
  if (!VALID_GAIT.includes(gait)) throw new ValidationError(`Gait must be one of ${VALID_GAIT.join(', ')}`);
  const height = Number(input.height ?? 15);
  if (!Number.isFinite(height) || height < 7 || height > 22) throw new ValidationError('Height must be between 7 and 22 hands');
  const interestsRaw = Array.isArray(input.interests)
    ? input.interests
    : String(input.interests ?? '').split(',');
  const interests = [...new Set(interestsRaw.map((s) => clean(s, 30)).filter(Boolean))].slice(0, 8);
  const coat = /^#[0-9a-f]{6}$/i.test(input.coat || '') ? input.coat.toLowerCase() : '#a0522d';
  const mane = /^#[0-9a-f]{6}$/i.test(input.mane || '') ? input.mane.toLowerCase() : '#3b2412';
  return {
    name,
    age,
    sex,
    gait,
    height,
    interests,
    coat,
    mane,
    breed: clean(input.breed, 40) || 'Mixed breed',
    stable: clean(input.stable, 60) || 'A barn somewhere',
    distance: Math.max(0, Math.min(500, Math.round(Number(input.distance) || 0))),
    bio: clean(input.bio, 280) || 'Just a horse looking for a horse.',
    lookingFor: clean(input.lookingFor, 80) || 'Someone to share the pasture with',
  };
}

export class Store {
  /**
   * @param {{ file?: string, seed?: object[], now?: () => number }} [opts]
   */
  constructor(opts = {}) {
    this.file = opts.file || null;
    this.now = opts.now || (() => Date.now());
    this.state = {
      horses: [],
      swipes: [], // { fromId, toId, direction, at }
      matches: [], // { id, horseIds: [a, b], at }
      messages: [], // { id, matchId, fromId, text, at }
      counter: 0,
    };
    const seed = opts.seed ?? SEED_HORSES;
    if (this.file && existsSync(this.file)) {
      this.state = JSON.parse(readFileSync(this.file, 'utf8'));
    } else {
      this.state.horses = seed.map((h) => ({ ...h, seed: true, createdAt: 0 }));
    }
  }

  persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  nextId(prefix) {
    this.state.counter += 1;
    return `${prefix}${this.state.counter}`;
  }

  listHorses() {
    return this.state.horses;
  }

  getHorse(id) {
    const horse = this.state.horses.find((h) => h.id === id);
    if (!horse) throw new NotFoundError(`No horse with id ${id}`);
    return horse;
  }

  createHorse(input) {
    const data = validateHorseInput(input);
    const horse = { id: this.nextId('u'), ...data, seed: false, createdAt: this.now() };
    this.state.horses.push(horse);
    this.persist();
    return horse;
  }

  updateHorse(id, input) {
    const horse = this.getHorse(id);
    const data = validateHorseInput({ ...horse, ...input });
    Object.assign(horse, data);
    this.persist();
    return horse;
  }

  /** Horses `id` has not swiped on yet, excluding itself, ordered by compatibility. */
  deck(id) {
    const me = this.getHorse(id);
    const swiped = new Set(this.state.swipes.filter((s) => s.fromId === id).map((s) => s.toId));
    return this.state.horses
      .filter((h) => h.id !== id && !swiped.has(h.id))
      .map((h) => ({ ...h, compatibility: compatibility(me, h) }))
      .sort((a, b) => b.compatibility - a.compatibility || a.distance - b.distance);
  }

  /**
   * Record a swipe. Returns { match: Match|null, likedBack: boolean }.
   * Seed horses decide deterministically; user-created horses match only if they swiped right too.
   */
  swipe(fromId, toId, direction) {
    if (!DIRECTIONS.includes(direction)) throw new ValidationError(`Direction must be one of ${DIRECTIONS.join(', ')}`);
    if (fromId === toId) throw new ValidationError('A horse cannot swipe on itself');
    const me = this.getHorse(fromId);
    const them = this.getHorse(toId);
    const existing = this.state.swipes.find((s) => s.fromId === fromId && s.toId === toId);
    if (existing) throw new ValidationError('Already swiped on this horse');

    this.state.swipes.push({ fromId, toId, direction, at: this.now() });
    let match = null;
    let likedBack = false;
    if (direction !== 'nope') {
      if (them.seed) {
        likedBack = direction === 'super' || likesBack(me, them);
      } else {
        likedBack = this.state.swipes.some(
          (s) => s.fromId === toId && s.toId === fromId && s.direction !== 'nope',
        );
      }
      if (likedBack) match = this.ensureMatch(fromId, toId);
    }
    this.persist();
    return { match, likedBack };
  }

  ensureMatch(a, b) {
    let match = this.findMatch(a, b);
    if (!match) {
      match = { id: this.nextId('m'), horseIds: [a, b], at: this.now() };
      this.state.matches.push(match);
    }
    return match;
  }

  findMatch(a, b) {
    return this.state.matches.find((m) => m.horseIds.includes(a) && m.horseIds.includes(b)) || null;
  }

  getMatch(matchId) {
    const match = this.state.matches.find((m) => m.id === matchId);
    if (!match) throw new NotFoundError(`No match with id ${matchId}`);
    return match;
  }

  /** Matches for a horse, decorated with the other horse and the last message. */
  matchesFor(id) {
    this.getHorse(id);
    return this.state.matches
      .filter((m) => m.horseIds.includes(id))
      .map((m) => {
        const otherId = m.horseIds.find((x) => x !== id);
        const msgs = this.state.messages.filter((x) => x.matchId === m.id);
        return {
          id: m.id,
          at: m.at,
          horse: this.getHorse(otherId),
          lastMessage: msgs.length ? msgs[msgs.length - 1] : null,
          unread: msgs.filter((x) => x.fromId !== id && !x.read).length,
        };
      })
      .sort((a, b) => (b.lastMessage?.at ?? b.at) - (a.lastMessage?.at ?? a.at));
  }

  unmatch(matchId, requesterId) {
    const match = this.getMatch(matchId);
    if (!match.horseIds.includes(requesterId)) throw new ValidationError('Not your match');
    this.state.matches = this.state.matches.filter((m) => m.id !== matchId);
    this.state.messages = this.state.messages.filter((m) => m.matchId !== matchId);
    this.persist();
  }

  messages(matchId, readerId) {
    const match = this.getMatch(matchId);
    if (readerId && !match.horseIds.includes(readerId)) throw new ValidationError('Not your match');
    const list = this.state.messages.filter((m) => m.matchId === matchId);
    if (readerId) {
      let changed = false;
      for (const m of list) {
        if (m.fromId !== readerId && !m.read) {
          m.read = true;
          changed = true;
        }
      }
      if (changed) this.persist();
    }
    return list;
  }

  /** Send a message. If the other horse is a seed horse it replies automatically. */
  sendMessage(matchId, fromId, text) {
    const match = this.getMatch(matchId);
    if (!match.horseIds.includes(fromId)) throw new ValidationError('Not your match');
    const body = clean(text, 500);
    if (!body) throw new ValidationError('Message cannot be empty');
    const msg = { id: this.nextId('msg'), matchId, fromId, text: body, at: this.now(), read: false };
    this.state.messages.push(msg);

    const otherId = match.horseIds.find((x) => x !== fromId);
    const other = this.getHorse(otherId);
    const replies = [];
    if (other.seed) {
      const count = this.state.messages.filter((m) => m.matchId === matchId && m.fromId === otherId).length;
      const idx = (hashString(`${matchId}:${count}`) + count) % HORSE_REPLIES.length;
      const reply = {
        id: this.nextId('msg'),
        matchId,
        fromId: otherId,
        text: HORSE_REPLIES[idx],
        at: this.now() + 1,
        read: false,
      };
      this.state.messages.push(reply);
      replies.push(reply);
    }
    this.persist();
    return { message: msg, replies };
  }

  stats(id) {
    const swipes = this.state.swipes.filter((s) => s.fromId === id);
    return {
      swiped: swipes.length,
      liked: swipes.filter((s) => s.direction !== 'nope').length,
      matches: this.state.matches.filter((m) => m.horseIds.includes(id)).length,
      remaining: this.deck(id).length,
    };
  }
}
