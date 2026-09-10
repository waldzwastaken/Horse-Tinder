/* Horse Tinder frontend. No framework, no build step. */

const ME_KEY = 'horse-tinder:me';
const SWIPE_THRESHOLD = 110;
const SUPER_THRESHOLD = 120;
const COATS = ['#a0522d', '#b5651d', '#6b4423', '#3b2314', '#1b1b1f', '#7a7a80', '#d8d8dc', '#e8d9c0', '#d4a24c', '#d9b45a', '#c1440e', '#e3c5a0'];
const MANES = ['#3b2412', '#1e1208', '#0a0a0c', '#5a2d10', '#8b5a2b', '#3a3a3a', '#d0d0d4', '#f0f0f2', '#fff6e0', '#b8902e'];

const state = {
  me: null,
  tab: 'swipe',
  deck: [],
  matches: [],
  history: [],
  chatMatch: null,
  busy: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const tabs = $('#tabs');
const modalRoot = $('#modal-root');
const toastEl = $('#toast');

// ---------- helpers ----------

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Stylised horse head, drawn from coat and mane colours. */
export function horseSvg(coat = '#a0522d', mane = '#3b2412', opts = {}) {
  const dark = shade(coat, -45);
  const blaze = opts.blaze ? `<path d="M84 52 Q68 92 50 128" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"/>` : '';
  return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Horse">
    <path d="M118 40 C138 40 162 66 160 98 C172 130 162 162 170 220 L150 220 C152 170 148 130 150 106 C145 76 132 56 112 48 Z" fill="${mane}"/>
    <path d="M155 220 L155 112 Q155 62 121 46 L118 44 Q95 38 80 54 Q55 80 40 114 Q28 136 44 146 Q60 154 76 142 Q96 126 110 136 Q106 172 106 220 Z" fill="${coat}"/>
    <path d="M40 114 Q28 136 44 146 Q60 154 76 142 Q64 128 40 114 Z" fill="${dark}" opacity=".35"/>
    <path d="M112 46 L118 12 L132 44 Z" fill="${coat}"/>
    <path d="M115 42 L119 20 L127 41 Z" fill="${dark}" opacity=".5"/>
    <path d="M96 48 L98 18 L112 46 Z" fill="${coat}"/>
    <path d="M100 44 L101 26 L109 44 Z" fill="${dark}" opacity=".5"/>
    <path d="M98 42 C86 30 104 20 118 36 C112 44 102 46 98 42 Z" fill="${mane}"/>
    ${blaze}
    <circle cx="78" cy="80" r="6.5" fill="#1a1008"/>
    <circle cx="80.5" cy="77.5" r="2.2" fill="#fff"/>
    <ellipse cx="47" cy="132" rx="3.2" ry="5" fill="${dark}"/>
    <path d="M44 143 Q50 148 58 145" stroke="${dark}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  </svg>`;
}

function hasBlaze(horse) {
  return (horse.name || '').length % 3 === 0;
}

function avatar(horse, cls = 'avatar') {
  if (horse.photo) return `<div class="${cls} has-photo"><img src="${esc(horse.photo)}" alt="${esc(horse.name)}" loading="lazy"></div>`;
  return `<div class="${cls}" style="background:linear-gradient(135deg,${shade(horse.coat, 90)},${shade(horse.coat, 40)})">${horseSvg(horse.coat, horse.mane, { blaze: hasBlaze(horse) })}</div>`;
}

function creditHtml(horse) {
  const c = horse.photoCredit;
  if (!horse.photo || !c) return '';
  const who = c.author ? `Photo: ${esc(c.author)}` : 'Photo';
  const lic = c.license ? ` · ${esc(c.license)}` : '';
  return c.source ? `<a class="credit" href="${esc(c.source)}" target="_blank" rel="noopener">${who}${lic}</a>` : `<span class="credit">${who}${lic}</span>`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------- modal ----------

function openModal(html, { onClose } = {}) {
  closeModal();
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const backdrop = $('.modal-backdrop', modalRoot);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { closeModal(); onClose?.(); } });
  return $('.modal', modalRoot);
}
function closeModal() { modalRoot.innerHTML = ''; }

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const colors = ['#c8471f', '#e8742f', '#e3a92f', '#3f8f5a', '#2f7fc8', '#fff'];
  for (let i = 0; i < 70; i += 1) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    wrap.appendChild(p);
  }
  $('#app').appendChild(wrap);
  setTimeout(() => wrap.remove(), 3500);
}

// ---------- boot ----------

async function boot() {
  const savedId = localStorage.getItem(ME_KEY);
  if (savedId) {
    try {
      state.me = await api(`/api/horses/${encodeURIComponent(savedId)}`);
    } catch {
      localStorage.removeItem(ME_KEY);
    }
  }
  if (!state.me) {
    renderOnboarding();
    return;
  }
  tabs.hidden = false;
  await refreshMatches();
  setTab(state.tab);
}

function renderTopbar() {
  const right = $('#topbar-right');
  if (!state.me) { right.innerHTML = ''; return; }
  right.innerHTML = `<span>${esc(state.me.name)}</span>${avatar(state.me, 'mini-avatar')}`;
}

async function setTab(tab) {
  state.tab = tab;
  state.chatMatch = null;
  view.onclick = null;
  for (const b of tabs.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  renderTopbar();
  if (tab === 'swipe') await renderSwipe();
  else if (tab === 'matches') await renderMatches();
  else await renderProfile();
}

tabs.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) setTab(b.dataset.tab);
});

// ---------- onboarding ----------

function horseFormHtml(h = {}) {
  const coat = h.coat || COATS[0];
  const mane = h.mane || MANES[0];
  const opt = (list, val) => list.map((v) => `<option ${v === val ? 'selected' : ''}>${v}</option>`).join('');
  return `
    <div class="preview" id="preview">
      ${avatar({ coat, mane, name: h.name || '' })}
      <div><strong id="preview-name">${esc(h.name || 'Your horse')}</strong><div class="sub" id="preview-sub">${esc(h.breed || 'Pick your colours below')}</div></div>
    </div>
    <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" required maxlength="40" placeholder="e.g. Buttercup" value="${esc(h.name || '')}"></div>
    <div class="row">
      <div class="field"><label for="f-age">Age</label><input id="f-age" name="age" type="number" min="1" max="45" required value="${h.age || 5}"></div>
      <div class="field"><label for="f-sex">Kind</label><select id="f-sex" name="sex">${opt(['Mare', 'Stallion', 'Gelding'], h.sex || 'Mare')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label for="f-breed">Breed</label><input id="f-breed" name="breed" maxlength="40" placeholder="Quarter Horse" value="${esc(h.breed || '')}"></div>
      <div class="field"><label for="f-height">Height (hands)</label><input id="f-height" name="height" type="number" step="0.1" min="7" max="22" value="${h.height || 15}"></div>
    </div>
    <div class="row">
      <div class="field"><label for="f-gait">Favourite gait</label><select id="f-gait" name="gait">${opt(['Walk', 'Trot', 'Canter', 'Lope', 'Gallop'], h.gait || 'Trot')}</select></div>
      <div class="field"><label for="f-distance">Distance (miles)</label><input id="f-distance" name="distance" type="number" min="0" max="500" value="${h.distance ?? 5}"></div>
    </div>
    <div class="field"><label for="f-stable">Stable</label><input id="f-stable" name="stable" maxlength="60" placeholder="Willow Creek Stables" value="${esc(h.stable || '')}"></div>
    <div class="field">
      <label>Coat</label>
      <div class="color-row" data-color="coat">${COATS.map((c) => `<button type="button" class="swatch ${c === coat ? 'selected' : ''}" data-value="${c}" style="background:${c}" aria-label="Coat ${c}"></button>`).join('')}</div>
      <input type="hidden" name="coat" value="${coat}">
    </div>
    <div class="field">
      <label>Mane</label>
      <div class="color-row" data-color="mane">${MANES.map((c) => `<button type="button" class="swatch ${c === mane ? 'selected' : ''}" data-value="${c}" style="background:${c}" aria-label="Mane ${c}"></button>`).join('')}</div>
      <input type="hidden" name="mane" value="${mane}">
    </div>
    <div class="field"><label for="f-interests">Interests</label><input id="f-interests" name="interests" placeholder="Trail rides, Apples, Mud baths" value="${esc((h.interests || []).join(', '))}"><span class="hint">Comma separated. Shared interests boost your compatibility.</span></div>
    <div class="field"><label for="f-bio">Bio</label><textarea id="f-bio" name="bio" maxlength="280" placeholder="Tell the herd about yourself">${esc(h.bio || '')}</textarea></div>
    <div class="field"><label for="f-looking">Looking for</label><input id="f-looking" name="lookingFor" maxlength="80" placeholder="A pasture buddy" value="${esc(h.lookingFor || '')}"></div>
  `;
}

function wireHorseForm(form) {
  form.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    const row = sw.closest('.color-row');
    row.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s === sw));
    form.elements[row.dataset.color].value = sw.dataset.value;
    updatePreview(form);
  });
  form.addEventListener('input', () => updatePreview(form));
}

function updatePreview(form) {
  const f = form.elements;
  const prev = $('#preview', form);
  if (!prev) return;
  prev.querySelector('.avatar').outerHTML = avatar({ coat: f.coat.value, mane: f.mane.value, name: f.name.value });
  $('#preview-name', form).textContent = f.name.value || 'Your horse';
  $('#preview-sub', form).textContent = [f.breed.value, f.age.value ? `${f.age.value} yrs` : ''].filter(Boolean).join(' · ') || 'Pick your colours below';
}

function readHorseForm(form) {
  const f = form.elements;
  return {
    name: f.name.value,
    age: Number(f.age.value),
    sex: f.sex.value,
    breed: f.breed.value,
    height: Number(f.height.value),
    gait: f.gait.value,
    distance: Number(f.distance.value),
    stable: f.stable.value,
    coat: f.coat.value,
    mane: f.mane.value,
    interests: f.interests.value,
    bio: f.bio.value,
    lookingFor: f.lookingFor.value,
  };
}

function renderOnboarding() {
  tabs.hidden = true;
  renderTopbar();
  view.innerHTML = '';
  view.appendChild($('#tpl-onboarding').content.cloneNode(true));
  $('#hero-art').innerHTML = horseSvg('#b5651d', '#3b2412', { blaze: true });
  const form = $('#create-form');
  form.innerHTML = `${horseFormHtml({ interests: ['Trail rides', 'Apples'] })}
    <button class="btn btn-primary btn-block" type="submit">Meet the herd 🐴</button>
    <div class="or">or</div>
    <button class="btn btn-block" type="button" id="demo-btn">Try a demo horse</button>`;
  wireHorseForm(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const me = await api('/api/horses', { method: 'POST', body: readHorseForm(form) });
      localStorage.setItem(ME_KEY, me.id);
      state.me = me;
      toast(`Welcome to the herd, ${me.name}!`);
      await boot();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
  $('#demo-btn').addEventListener('click', async () => {
    const demo = {
      name: ['Buttercup', 'Chestnut', 'Storm', 'Pickles', 'Duchess', 'Rocket'][Math.floor(Math.random() * 6)],
      age: 5 + Math.floor(Math.random() * 6),
      sex: ['Mare', 'Stallion', 'Gelding'][Math.floor(Math.random() * 3)],
      breed: 'Quarter Horse',
      height: 15.1,
      gait: ['Trot', 'Canter', 'Lope'][Math.floor(Math.random() * 3)],
      distance: 5,
      stable: 'Demo Downs',
      coat: COATS[Math.floor(Math.random() * COATS.length)],
      mane: MANES[Math.floor(Math.random() * MANES.length)],
      interests: ['Trail rides', 'Apples', 'Mud baths', 'Sunsets'],
      bio: 'Just here to see what all the fuss is about. Will trade hay for jokes.',
      lookingFor: 'A pasture buddy',
    };
    try {
      const me = await api('/api/horses', { method: 'POST', body: demo });
      localStorage.setItem(ME_KEY, me.id);
      state.me = me;
      toast(`You are ${me.name} now. Go and meet the herd.`);
      await boot();
    } catch (err) {
      toast(err.message);
    }
  });
}

// ---------- swipe ----------

async function loadDeck() {
  state.deck = await api(`/api/horses/${state.me.id}/deck`);
}

async function renderSwipe() {
  view.innerHTML = `<div class="deck-wrap"><div class="deck" id="deck"></div><div class="actions" id="actions"></div></div>`;
  try {
    await loadDeck();
  } catch (err) {
    toast(err.message);
  }
  paintDeck();
}

function cardHtml(h) {
  const mine = new Set((state.me.interests || []).map((s) => s.toLowerCase()));
  return `<article class="card" data-id="${h.id}" tabindex="0" aria-label="${esc(h.name)}, ${h.age}">
    <div class="card-art ${h.photo ? 'has-photo' : ''}" style="background:linear-gradient(160deg,${shade(h.coat, 100)},${shade(h.coat, 30)})">
      <span class="compat">🍀 <b>${h.compatibility}%</b> friend match</span>
      <span class="dist">📍 ${h.distance} mi</span>
      <div class="stamp stamp-like">FRIEND</div>
      <div class="stamp stamp-nope">NOPE</div>
      <div class="stamp stamp-super">SUPER NEIGH</div>
      ${h.photo ? `<img class="card-photo" src="${esc(h.photo)}" alt="${esc(h.name)}, a ${esc(h.breed)}" draggable="false">` : horseSvg(h.coat, h.mane, { blaze: hasBlaze(h) })}
    </div>
    <div class="card-body">
      <div class="card-title"><h2>${esc(h.name)}</h2><span class="age">${h.age}</span>${h.type ? `<span class="type" title="${esc(h.typeName || '')}">${esc(h.type)}</span>` : ''}<span class="sex">${esc(h.sex)}</span></div>
      <div class="card-meta">${esc(h.breed)} · ${h.height} hh · ${esc(h.stable)}</div>
      ${h.skill ? `<div class="card-skill"><b>${esc(h.typeName || 'Skill')}</b> · ${esc(h.skill.name)}: ${esc(h.skill.tagline.charAt(0).toLowerCase() + h.skill.tagline.slice(1))}</div>` : ''}
      <p class="card-bio">${esc(h.bio)}</p>
      <div class="chips">${(h.interests || []).map((i) => `<span class="chip ${mine.has(i.toLowerCase()) ? 'shared' : ''}">${esc(i)}</span>`).join('')}</div>
    </div>
  </article>`;
}

function paintDeck() {
  const deck = $('#deck');
  const actions = $('#actions');
  if (!deck) return;
  if (!state.deck.length) {
    deck.innerHTML = `<div class="empty"><div class="big">🌾</div><h2>The pasture is empty</h2><p>You have met every horse in range. Go and chat with your friends.</p>
      <button class="btn btn-primary" id="go-matches">See friends</button></div>`;
    actions.innerHTML = '';
    $('#go-matches').addEventListener('click', () => setTab('matches'));
    return;
  }
  deck.innerHTML = state.deck.slice(0, 3).map(cardHtml).join('');
  actions.innerHTML = `
    <button class="action small action-rewind" id="act-rewind" title="Rewind (Z)" ${state.history.length ? '' : 'disabled'}>↩️</button>
    <button class="action action-nope" id="act-nope" title="Nope (←)">✖️</button>
    <button class="action action-super" id="act-super" title="Super Neigh (↑)">⭐</button>
    <button class="action action-like" id="act-like" title="Like (→)">💚</button>
    <button class="action small action-info" id="act-info" title="Details (I)">ℹ️</button>`;
  $('#act-nope').addEventListener('click', () => swipeTop('nope'));
  $('#act-like').addEventListener('click', () => swipeTop('like'));
  $('#act-super').addEventListener('click', () => swipeTop('super'));
  $('#act-info').addEventListener('click', () => showDetails(state.deck[0]));
  $('#act-rewind').addEventListener('click', rewind);
  attachDrag(deck.firstElementChild);
}

function attachDrag(card) {
  if (!card) return;
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, moved = false;
  const like = $('.stamp-like', card), nope = $('.stamp-nope', card), sup = $('.stamp-super', card);

  const onMove = (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const rot = dx / 14;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    like.style.opacity = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));
    nope.style.opacity = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));
    sup.style.opacity = Math.min(1, Math.max(0, -dy / SUPER_THRESHOLD - Math.abs(dx) / 200));
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    card.releasePointerCapture?.(card._pid);
    if (dx > SWIPE_THRESHOLD) swipeTop('like');
    else if (dx < -SWIPE_THRESHOLD) swipeTop('nope');
    else if (dy < -SUPER_THRESHOLD && Math.abs(dx) < 80) swipeTop('super');
    else {
      card.style.transform = '';
      like.style.opacity = nope.style.opacity = sup.style.opacity = 0;
    }
  };
  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    dx = dy = 0;
    card._pid = e.pointerId;
    card.setPointerCapture?.(e.pointerId);
    card.classList.add('dragging');
  });
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
  card.addEventListener('click', () => { if (!moved) showDetails(state.deck[0]); });
}

async function swipeTop(direction) {
  if (state.busy || !state.deck.length) return;
  state.busy = true;
  const horse = state.deck[0];
  const card = $('#deck .card');
  if (card) {
    card.classList.remove('dragging');
    const fly = direction === 'like' ? 'translate(120%, -10%) rotate(20deg)'
      : direction === 'nope' ? 'translate(-120%, -10%) rotate(-20deg)'
      : 'translate(0, -140%) rotate(-4deg)';
    card.style.transform = fly;
    card.classList.add('gone');
  }
  try {
    const result = await api(`/api/horses/${state.me.id}/swipe`, { method: 'POST', body: { targetId: horse.id, direction } });
    state.history.push({ horse, direction });
    state.deck.shift();
    setTimeout(() => {
      paintDeck();
      state.busy = false;
      if (result.ghosted?.length) {
        refreshMatches();
        const names = result.ghosted.map((h) => h.name).join(' and ');
        toast(`${names} got tired of waiting and wandered off. 🌾`, 3500);
      }
      if (result.match) {
        refreshMatches();
        showMatch(horse, result.match);
      } else if (direction === 'super' && !result.ghosted?.length) {
        toast(`${horse.name} felt that Super Neigh. 🌟`);
      }
    }, 280);
  } catch (err) {
    state.busy = false;
    toast(err.message);
    if (/already swiped/i.test(err.message)) { state.deck.shift(); paintDeck(); }
    else if (card) { card.style.transform = ''; card.classList.remove('gone'); }
  }
}

function rewind() {
  const last = state.history.pop();
  if (!last) return;
  // Swipes are final on the server; rewinding just brings the card back for another look.
  state.deck.unshift({ ...last.horse, rewound: true });
  paintDeck();
  toast(`Brought ${last.horse.name} back for another look.`);
}

function showDetails(h) {
  if (!h) return;
  const mine = new Set((state.me.interests || []).map((s) => s.toLowerCase()));
  openModal(`
    <div class="pair">${avatar(h)}</div>
    ${creditHtml(h)}
    <div class="detail">
      <h3>${esc(h.name)}, ${h.age}</h3>
      ${h.type ? `<div><span class="k">Personality</span><div><span class="type">${esc(h.type)}</span> ${esc(h.typeName || '')}${h.voice ? ` · ${esc(h.voice)}` : ''}</div></div>` : ''}
      ${h.skill ? `<div class="skill-box"><span class="k">Skill · ${esc(h.skill.name)}</span><div>${esc(h.skill.tagline)}. Become friends, then tap <b>Help</b> in chat.</div></div>` : ''}
      <div><span class="k">Breed</span><div>${esc(h.breed)} · ${esc(h.sex)} · ${h.height} hh</div></div>
      <div><span class="k">Stable</span><div>${esc(h.stable)} · ${h.distance} miles away</div></div>
      <div><span class="k">Favourite gait</span><div>${esc(h.gait)}</div></div>
      <div><span class="k">Looking for</span><div>${esc(h.lookingFor)}</div></div>
      <div><span class="k">About</span><div>${esc(h.bio)}</div></div>
      <div><span class="k">Interests</span><div class="chips">${(h.interests || []).map((i) => `<span class="chip ${mine.has(i.toLowerCase()) ? 'shared' : ''}">${esc(i)}</span>`).join('')}</div></div>
    </div>
    <div style="margin-top:16px"><button class="btn btn-block" id="close-detail">Close</button></div>`);
  $('#close-detail').addEventListener('click', closeModal);
}

function showMatch(horse, match) {
  confetti();
  const modal = openModal(`
    <h2>New friend!</h2>
    <p>You and ${esc(horse.name)} both want to be friends. Say hi!</p>
    <div class="pair">${avatar(state.me)}${avatar(horse)}</div>
    <button class="btn btn-primary btn-block" id="match-chat">Send a neigh 💬</button>
    <button class="btn btn-ghost btn-block" id="match-keep">Keep swiping</button>`);
  $('#match-chat', modal).addEventListener('click', async () => {
    closeModal();
    await refreshMatches();
    const m = state.matches.find((x) => x.id === match.id);
    if (m) openChat(m);
  });
  $('#match-keep', modal).addEventListener('click', closeModal);
}

// ---------- matches ----------

async function refreshMatches() {
  try {
    state.matches = await api(`/api/horses/${state.me.id}/matches`);
  } catch {
    state.matches = [];
  }
  const unread = state.matches.reduce((n, m) => n + (m.unread || 0), 0);
  const badge = $('#matches-badge');
  badge.hidden = unread === 0;
  badge.textContent = unread;
}

async function renderMatches() {
  await refreshMatches();
  if (!state.matches.length) {
    view.innerHTML = `<div class="empty"><div class="big">🐴🌾</div><h2>No friends yet</h2><p>Keep meeting horses. Somewhere out there is one who also loves mud baths.</p>
      <button class="btn btn-primary" id="go-swipe">Meet horses</button></div>`;
    $('#go-swipe').addEventListener('click', () => setTab('swipe'));
    return;
  }
  const active = state.matches.filter((m) => m.status === 'active');
  const ended = state.matches.filter((m) => m.status !== 'active');
  const fresh = active.filter((m) => !m.lastMessage);
  const convos = active.filter((m) => m.lastMessage);
  const row = (m) => `
      <button class="match-row ${m.status !== 'active' ? 'ended' : ''}" data-id="${m.id}">
        ${avatar(m.horse)}
        <div class="info"><strong>${esc(m.horse.name)}</strong><div class="last ${m.unread ? 'unread' : ''}">${m.lastMessage.fromId === state.me.id ? 'You: ' : ''}${esc(m.lastMessage.text)}</div></div>
        ${m.unread ? '<span class="dot"></span>' : ''}
      </button>`;
  view.innerHTML = `
    ${fresh.length ? `<div class="section-title">New friends</div><div class="new-matches">${fresh.map((m) => `
      <button class="new-match" data-id="${m.id}">${avatar(m.horse)}<span>${esc(m.horse.name)}</span></button>`).join('')}</div>` : ''}
    <div class="section-title">Messages</div>
    <div class="list">${convos.length ? convos.map(row).join('') : `<p class="or" style="padding:16px">Say hi to a new match to start a conversation. Horses do not wait forever.</p>`}
    ${ended.length ? `<div class="section-title muted">Wandered off</div>${ended.map(row).join('')}` : ''}</div>`;
  // Assigned, not added: renders happen often and stacked listeners would open a chat twice.
  view.onclick = (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const m = state.matches.find((x) => x.id === b.dataset.id);
    if (m) openChat(m);
  };
}

// ---------- chat ----------

function msgHtml(m) {
  const mine = m.fromId === state.me.id;
  const help = m.kind === 'help';
  const skill = state.chatMatch?.horse?.skill;
  const tag = help ? `<span class="msg-tag">${mine ? 'Asked for help' : `💡 ${esc(skill?.name || 'Help')}`}</span>` : '';
  return `<div class="msg ${mine ? 'me' : 'them'} ${help ? 'help' : ''}">${tag}${esc(m.text)}</div>`;
}

async function openChat(match) {
  state.chatMatch = match;
  view.onclick = null;
  const h = match.horse;
  const ended = match.status !== 'active';
  view.innerHTML = `<div class="chat">
    <div class="chat-head">
      <button class="icon-btn" id="chat-back" aria-label="Back">←</button>
      ${avatar(h)}
      <div class="who"><strong>${esc(h.name)}</strong><span class="sub">${ended ? 'wandered off' : `${esc(h.breed)} · ${esc(h.stable)} · friends since ${timeAgo(match.at)}`}</span></div>
      <button class="icon-btn" id="chat-unmatch" title="${ended ? 'Delete chat' : 'Say goodbye'}" aria-label="${ended ? 'Delete chat' : 'Say goodbye'}">🗑️</button>
    </div>
    <div class="messages" id="messages"><div class="msg-sys">You and ${esc(h.name)} are friends now. Say something nice.</div></div>
    ${ended ? `<div class="msg-sys ended-note">${esc(h.name)} has gone back to the herd. You can still read your chat.</div>` : `
    <div class="quick-replies" id="quick" aria-label="Suggested replies"><span class="quick-hint">Finding the words…</span></div>
    <form class="composer" id="composer">${h.skill ? `<button type="button" class="help-toggle" id="help-toggle" aria-pressed="false" title="${esc(h.skill.name)}: ${esc(h.skill.tagline)}">💡<span>Help</span></button>` : ''}<input id="chat-input" placeholder="Message ${esc(h.name)}" maxlength="500" autocomplete="off"><button type="submit">Send</button></form>`}
  </div>`;
  const list = $('#messages');
  const input = $('#chat-input');
  const endedNote = $('.ended-note', view);
  $('#chat-back').addEventListener('click', () => setTab('matches'));
  $('#chat-unmatch').addEventListener('click', () => {
    const modal = openModal(`<h2 style="font-size:24px">Say goodbye to ${esc(h.name)}?</h2><p>This deletes your chat. ${esc(h.name)} will go back to the field.</p>
      <button class="btn btn-danger btn-block" id="um-yes">Say goodbye</button><button class="btn btn-ghost btn-block" id="um-no">Never mind</button>`);
    $('#um-no', modal).addEventListener('click', closeModal);
    $('#um-yes', modal).addEventListener('click', async () => {
      try {
        await api(`/api/matches/${match.id}?as=${state.me.id}`, { method: 'DELETE' });
        closeModal();
        toast(`Said goodbye to ${h.name}.`);
        setTab('matches');
      } catch (err) { toast(err.message); }
    });
  });
  let helpMode = false;
  const helpToggle = $('#help-toggle');
  helpToggle?.addEventListener('click', () => {
    helpMode = !helpMode;
    helpToggle.setAttribute('aria-pressed', String(helpMode));
    helpToggle.classList.toggle('on', helpMode);
    input.placeholder = helpMode ? `Ask ${h.name} for help with…` : `Message ${h.name}`;
    if (helpMode) toast(`${h.name} · ${h.skill.name}: ${h.skill.tagline}`, 2600);
    input.focus();
  });
  const quick = $('#quick');
  quick?.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') { input.value = e.target.textContent; input.focus(); }
  });
  let suggestToken = 0;
  // Pills are real candidate replies to the latest message, refreshed whenever the horse speaks.
  async function loadSuggestions() {
    if (!quick) return;
    const token = ++suggestToken;
    try {
      const { suggestions } = await api(`/api/matches/${match.id}/suggestions?as=${state.me.id}`);
      if (token !== suggestToken || state.chatMatch?.id !== match.id) return;
      quick.innerHTML = suggestions.map((q) => `<button type="button">${esc(q)}</button>`).join('');
    } catch {
      if (token === suggestToken) quick.innerHTML = '';
    }
  }

  try {
    const msgs = await api(`/api/matches/${match.id}/messages?as=${state.me.id}`);
    list.insertAdjacentHTML('beforeend', msgs.map(msgHtml).join(''));
    if (endedNote) list.appendChild(endedNote);
    list.scrollTop = list.scrollHeight;
    refreshMatches();
    if (!ended) loadSuggestions();
  } catch (err) { toast(err.message); }

  let sending = false;
  $('#composer')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    input.value = '';
    // Show the message and a typing indicator right away: an AI reply can take a few seconds.
    const pending = document.createElement('div');
    pending.className = `msg me pending ${helpMode ? 'help' : ''}`;
    pending.innerHTML = `${helpMode ? '<span class="msg-tag">Asked for help</span>' : ''}${esc(text)}`;
    list.appendChild(pending);
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    list.appendChild(typing);
    list.scrollTop = list.scrollHeight;
    if (quick) quick.innerHTML = '<span class="quick-hint">Finding the words…</span>';
    suggestToken += 1;
    const startedAt = Date.now();
    try {
      const { replies, aiError } = await api(`/api/matches/${match.id}/messages`, { method: 'POST', body: { fromId: state.me.id, text, mode: helpMode ? 'help' : 'chat' } });
      pending.classList.remove('pending');
      const fellBack = state.aiReady && replies.some((r) => r.source === 'canned');
      const wait = Math.max(0, 900 - (Date.now() - startedAt));
      setTimeout(() => {
        typing.remove();
        if (state.chatMatch?.id !== match.id) return;
        list.insertAdjacentHTML('beforeend', replies.map(msgHtml).join(''));
        if (fellBack && !list.querySelector('.ai-note')) {
          list.insertAdjacentHTML('beforeend', `<div class="msg-sys ai-note">${esc(h.name)} answered from memory. Claude ${aiError ? `said: ${esc(aiError)}` : 'gave no reply'}.</div>`);
        }
        list.scrollTop = list.scrollHeight;
        api(`/api/matches/${match.id}/messages?as=${state.me.id}`).catch(() => {});
        loadSuggestions();
      }, wait);
    } catch (err) {
      pending.remove();
      typing.remove();
      toast(err.message);
      if (/moved on|gone back/i.test(err.message)) { await refreshMatches(); const m = state.matches.find((x) => x.id === match.id); if (m) openChat(m); }
    } finally {
      sending = false;
    }
  });
  input?.focus();
}

// ---------- profile ----------

async function renderProfile() {
  const me = state.me;
  let stats = { swiped: 0, liked: 0, matches: 0, remaining: 0, reputation: null };
  try { stats = await api(`/api/horses/${me.id}/stats`); } catch { /* ignore */ }
  view.innerHTML = `<div class="profile">
    <div class="profile-hero">${avatar(me)}<div><h2>${esc(me.name)}, ${me.age}</h2><div class="sub">${esc(me.breed)} · ${esc(me.sex)} · ${me.height} hh</div><div class="sub">${esc(me.stable)}</div></div></div>
    <div class="stats">
      <div class="stat"><b>${stats.swiped}</b><span>Met</span></div>
      <div class="stat"><b>${stats.liked}</b><span>Said yes</span></div>
      <div class="stat"><b>${stats.matches}</b><span>Friends</span></div>
      <div class="stat"><b>${stats.remaining}</b><span>Left</span></div>
    </div>
    ${stats.reputation ? `<div class="rep">
      <div class="rep-score"><b>${stats.reputation.score}</b><span>Friend score</span></div>
      <div class="rep-body">
        <strong>${esc(stats.reputation.label)}</strong>
        <p>Chatting with your friends raises it. Ignoring a friend who wrote to you lowers it. ${stats.reputation.bonus > 0 ? `Right now horses are <b>${stats.reputation.bonus} points</b> more likely to want to be your friend.` : stats.reputation.bonus < 0 ? `Right now horses are <b>${-stats.reputation.bonus} points</b> less likely to want to be your friend.` : 'Right now it is not changing anything.'}</p>
        <p class="rep-meta">${stats.reputation.sent} sent · ${stats.reputation.deep} proper chat${stats.reputation.deep === 1 ? '' : 's'} · ${stats.reputation.ghosted} wandered off</p>
      </div>
    </div>` : ''}
    <p style="color:var(--ink-2);font-size:14px">${esc(me.bio)}</p>
    <div class="chips">${(me.interests || []).map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
    <details class="panel"><summary>Edit profile</summary>
      <form class="form" id="edit-form">${horseFormHtml(me)}<button class="btn btn-primary btn-block" type="submit">Save changes</button></form>
    </details>
    <button class="btn btn-danger btn-block" id="switch-horse">Log out of this horse</button>
  </div>`;
  const form = $('#edit-form');
  wireHorseForm(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.me = await api(`/api/horses/${me.id}`, { method: 'PATCH', body: readHorseForm(form) });
      toast('Profile saved. Looking good.');
      renderProfile();
      renderTopbar();
    } catch (err) { toast(err.message); }
  });
  $('#switch-horse').addEventListener('click', () => {
    localStorage.removeItem(ME_KEY);
    state.me = null;
    state.history = [];
    state.matches = [];
    $('#matches-badge').hidden = true;
    renderOnboarding();
  });
}

// ---------- keyboard ----------

document.addEventListener('keydown', (e) => {
  if (!state.me || state.tab !== 'swipe' || state.chatMatch) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (modalRoot.childElementCount) { if (e.key === 'Escape') closeModal(); return; }
  if (e.key === 'ArrowRight') swipeTop('like');
  else if (e.key === 'ArrowLeft') swipeTop('nope');
  else if (e.key === 'ArrowUp') { e.preventDefault(); swipeTop('super'); }
  else if (e.key.toLowerCase() === 'z') rewind();
  else if (e.key.toLowerCase() === 'i') showDetails(state.deck[0]);
});

boot().catch((err) => {
  view.innerHTML = `<div class="empty"><div class="big">🐴</div><h2>Something spooked the server</h2><p>${esc(err.message)}</p></div>`;
});
