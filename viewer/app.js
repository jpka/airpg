// LATENT spectator viewer. Replays (or follows live) a session event log.
// Rendering is a pure function of (events[0..cursor]); scrubbing just re-reduces.
import { sigil, coneGlyph, ringClock } from './sigils.js';
import { mountSeat, defaultReply } from './seat.js';
import { renderSuggest, compose as composeSuggest } from './suggest.js';
import { reviewSession } from '../src/reviewer/review.js';
import { renderMarkdown } from '../src/reviewer/report.js';
import { runSession } from '../src/runner/session.js';
import { buildRun } from '../src/runner/factory.js';
import { ENTITIES } from '../src/content/entities.js';
import { APERTURE } from '../src/content/aperture.js';
import { RESISTANCES } from '../src/engine/rules.js';
import { words } from '../src/engine/core.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };

// ------------------------------------------------------------------ state
const S = {
  session: null, review: null, cursor: 0, playing: false, timer: null, speed: 1,
  backstage: store.get('latent.backstage', false), clean: false,
  clip: null, live: null, manifest: [], current: null,
  human: null, // { seat, pending: { req, resolve } | null } while a person plays a seat
  waiting: [], // resolvers for LATENT.turn(): an agent driving the page awaits its next request
  suggested: false, // the suggestion box is mounted once, so a half-written note survives a tab switch
  reqId: 0, // requests to the human seat are numbered, as in cli/agent.js, so a turn cannot be missed silently
};
const GM_LOOK = { shape: 'aperture', hue: 268 };
const NPC_LOOK = { shape: 'npc', hue: 46 };

// ------------------------------------------------------------------ reducer
function fresh(session) {
  const start = session.events.find((e) => e.type === 'session.start');
  const cast = start?.data.cast ?? [];
  return {
    names: Object.fromEntries(cast.map((c) => [c.id, c.name])),
    looks: Object.fromEntries(cast.map((c) => [c.id, c.look])),
    order: cast.map((c) => c.id),
    party: Object.fromEntries(cast.map((c) => [c.id, { ...c, stress: { ...c.stress }, cone: { ...c.cone }, tags: [], dissolved: false, algotype: null, memories: c.memories ?? 3 }])),
    clocks: Object.fromEntries((start?.data.clocks ?? []).map((c) => [c.id, { ...c }])),
    algotypes: start?.backstage?.algotypes ?? {},
    scene: null, location: null, caption: null, overlay: null, active: null,
    facts: [], clues: [], memlog: [], beats: {}, theory: null, ending: null,
    turnStart: 0, lastStakes: null, pulse: null, delveId: null,
    hands: {}, played: {}, decks: {},
  };
}

function reduce(st, e) {
  const d = e.data ?? {};
  const P = e.actor ? st.party[e.actor] : null;
  switch (e.type) {
    case 'scene.enter':
      st.scene = { title: d.title, kind: d.kind, index: d.index };
      st.location = d.location;
      if (d.clock) { st.clocks[d.clock.id] = { ...d.clock }; st.delveId = d.clock.id; } else st.delveId = null;
      st.overlay = { type: 'scene', e }; st.caption = null; st.active = null; st.turnStart = e.i;
      break;
    case 'turn.start': st.active = e.actor; st.turnStart = e.i; st.overlay = null; st.lastStakes = null; st.caption = { who: e.actor, e, text: '' }; break;
    case 'scene.frame': st.caption = { who: 'gm', e, text: d.text }; st.overlay = null; break;
    case 'character.intro': st.caption = { who: e.actor, e, text: d.text }; st.overlay = null; st.active = e.actor; break;
    case 'action.declare': st.caption = { who: e.actor, e, text: d.say, act: d.do, kind: d.kind }; st.overlay = null; break;
    case 'outcome': st.caption = { who: 'gm', e, text: d.text }; break;
    case 'dialogue': st.caption = { who: 'npc', name: d.speaker, e, text: d.text }; break;
    case 'character.epilogue': st.caption = { who: e.actor, e, text: d.text }; st.active = e.actor; st.overlay = null; break;
    case 'ending.narrate': st.caption = { who: 'gm', e, text: d.text }; break;
    case 'stakes.set': st.lastStakes = e; st.overlay = { type: 'stakes', e }; break;
    case 'roll': st.overlay = { type: 'roll', e, stakes: st.lastStakes }; break;
    case 'stress': if (P) P.stress[d.resistance] = d.value; break;
    case 'stress.heal': if (st.party[d.target]) st.party[d.target].stress[d.resistance] = Math.max(0, st.party[d.target].stress[d.resistance] - d.amount); st.overlay = { type: 'note', e, k: 'Mend', t: `${st.names[e.actor]} restores ${d.amount} ${d.resistance} in ${st.names[d.target]}` }; break;
    case 'fallout.check': if (d.result !== 'none') st.overlay = { type: 'check', e }; break;
    case 'fallout':
      if (P) {
        if (d.severity === 'minor') P.stress[d.resistance] = 0; else for (const k of RESISTANCES) P.stress[k] = 0;
        P.tags.push(d.name);
      }
      st.overlay = { type: 'fallout', e };
      break;
    case 'clock.tick': if (st.clocks[d.clock]) { st.clocks[d.clock].value = d.value; st.pulse = d.clock; } break;
    case 'clock.complete': if (st.clocks[d.clock]) st.clocks[d.clock].done = true; st.overlay = { type: 'clock', e }; break;
    case 'clue.found': st.clues.push(d); st.overlay = { type: 'clue', e }; break;
    case 'fact.add': st.facts.push(d); break;
    case 'secret.unlock': st.overlay = { type: 'secret', e }; break;
    case 'memory.invoke': st.memlog.push({ ...d, actor: e.actor, kind: 'reinterpreted', i: e.i }); st.overlay = { type: 'memory', e }; break;
    case 'memory.rewrite': st.memlog.push({ ...d, actor: e.actor, kind: 'rewritten', i: e.i }); st.overlay = { type: 'memory', e }; break;
    case 'memory.lose': if (P) P.memories = Math.max(0, P.memories - 1); st.memlog.push({ ...d, actor: e.actor, kind: 'lost', i: e.i }); st.overlay = { type: 'memory', e }; break;
    case 'memory.form': if (P && !d.appended) P.memories++; st.memlog.push({ ...d, actor: e.actor, kind: 'formed', i: e.i }); break;
    case 'haunt.rest':
      if (P) { P.stress[d.resistance] = Math.max(0, P.stress[d.resistance] - d.cleared); if (d.memoryGone) P.memories = Math.max(0, P.memories - 1); }
      st.memlog.push({ actor: e.actor, kind: 'spent', text: d.spent, i: e.i });
      st.overlay = { type: 'note', e, k: `Haunt · ${d.name}`, t: `Spends a memory to clear ${d.cleared} ${d.resistance}: “${d.spent}”` };
      break;
    case 'beats.declare': st.beats[e.actor] = e.backstage?.beats ?? d.beats; break;
    case 'beat.hit': st.overlay = { type: 'beat', e }; break;
    case 'guard.set': st.overlay = { type: 'note', e, k: 'Guard', t: `${st.names[e.actor]} guards ${d.name}: half of any stress ${d.name} takes goes to ${st.names[e.actor]} until their next turn.` }; break;
    case 'stress.share': st.overlay = { type: 'note', e, k: 'Shared stress', t: `${st.names[e.actor]} carries ${d.amount} of ${st.names[d.from]}'s stress · cohesion ${d.cohesion}` }; break;
    case 'cone.change': if (P) P.cone = { ...d.after }; st.overlay = { type: 'note', e, k: 'Light cone', t: `${st.names[e.actor]}: reach ${d.before.reach}→${d.after.reach}, horizon ${d.before.horizon}→${d.after.horizon}. ${d.why}` }; break;
    case 'algotype.reveal': if (P) P.algotype = d.algotype; st.overlay = { type: 'note', e, k: 'Hidden drive revealed', t: `${st.names[e.actor]} — ${d.algotype}. ${d.disposition}` }; break;
    case 'character.dissolve': if (P) P.dissolved = true; st.overlay = { type: 'note', e, k: 'Dissolution', t: d.text }; break;
    case 'theorize': if (d.result !== 'false') st.theory = d.theory; st.overlay = { type: 'theory', e }; break;
    case 'complication': st.overlay = { type: 'note', e, k: 'Complication', t: d.text }; break;
    case 'delve.forced': st.overlay = { type: 'note', e, k: 'Forced passage', t: d.text }; break;
    case 'audience.ingress': st.overlay = { type: 'note', e, k: 'The audience ingresses', t: d.text }; break;
    case 'npc.moved': st.overlay = { type: 'note', e, k: 'Persuaded', t: `${d.name} is moved.` }; break;
    case 'ending': st.ending = d; st.overlay = { type: 'note', e, k: `Ending · ${d.ending}`, t: d.text }; break;
    case 'session.abort': st.overlay = { type: 'note', e, k: 'Stopped', t: d.reason }; break;
    case 'deck.build': st.decks[e.actor] = { size: d.size, handSize: d.handSize }; break;
    case 'deck.draw': st.hands[e.actor] = d.hand; st.played[e.actor] = []; if (st.decks[e.actor]) st.decks[e.actor].handSize = d.handSize; break;
    case 'deck.play': {
      const cards = [d.move, ...(d.edges ?? []), d.guard, d.compel].filter(Boolean);
      st.played[e.actor] = cards.map((k) => k.uid);
      if (st.decks[e.actor]) st.decks[e.actor].size -= cards.filter((k) => k.exhaust).length; // one-use cards leave
      st.overlay = { type: 'cards', e };
      break;
    }
    case 'deck.discard': st.hands[e.actor] = null; break;
    case 'deck.gain': if (st.decks[e.actor]) st.decks[e.actor].size++; st.overlay = { type: 'card', e, k: `New card · ${d.why}`, t: d.card.text }; break;
    case 'deck.remove': if (st.decks[e.actor]) st.decks[e.actor].size--; st.overlay = { type: 'card', e, k: `Card leaves the deck · ${d.why}`, t: `${st.names[e.actor]} will not draw ${d.card.name} again.` }; break;
    case 'deck.draft': if (d.card && st.decks[e.actor]) st.decks[e.actor].size++; if (d.card) st.overlay = { type: 'card', e, k: `Draft · ${d.why}`, t: `${st.names[e.actor]} takes ${d.card.name}${d.offered?.length > 1 ? ` over ${d.offered.filter((x) => x !== d.card.name).join(' and ')}` : ''}.` }; break;
    default: break;
  }
  if (P && e.type === 'fallout' && P.tags.length > 3) P.tags = P.tags.slice(-3);
  return st;
}

const VISIBLE = new Set(['deck.draw', 'deck.play', 'deck.gain', 'deck.remove', 'deck.draft', 'scene.enter', 'scene.frame', 'character.intro', 'action.declare', 'outcome', 'dialogue', 'character.epilogue', 'ending.narrate', 'stakes.set', 'roll', 'fallout', 'clock.complete', 'clue.found', 'secret.unlock', 'memory.invoke', 'memory.rewrite', 'memory.lose', 'haunt.rest', 'beat.hit', 'stress.share', 'cone.change', 'algotype.reveal', 'character.dissolve', 'theorize', 'complication', 'delve.forced', 'audience.ingress', 'npc.moved', 'ending', 'stress.heal', 'session.abort', 'guard.set']);
function isVisible(e) { return VISIBLE.has(e.type) && !(e.type === 'deck.draft' && !e.data.card) || (e.type === 'fallout.check' && e.data.result !== 'none'); }

function duration(e) {
  const d = e.data ?? {};
  const txt = (t) => 1500 + Math.min(9000, words(t).length * 270);
  switch (e.type) {
    case 'scene.frame': case 'outcome': case 'character.intro': case 'dialogue': case 'character.epilogue': case 'ending.narrate': return txt(d.text);
    case 'action.declare': return 900 + Math.min(6000, words(`${d.say} ${d.do}`).length * 250);
    case 'scene.enter': return 2600;
    case 'stakes.set': return 2400 + Math.min(3000, words(d.failure_looks_like).length * 180);
    case 'roll': return 2600;
    case 'theorize': return 4500;
    case 'memory.invoke': case 'memory.rewrite': return 3600;
    case 'fallout': return 3400;
    case 'clue.found': case 'secret.unlock': return 3200;
    case 'fallout.check': return 1300;
    case 'clock.tick': return 600;
    case 'stress': return 350;
    case 'deck.draw': return 1300;
    case 'deck.play': return 2100;
    case 'deck.gain': case 'deck.remove': return 2400;
    case 'deck.draft': return e.data.card ? 2400 : 0; // declined drafts are not shown, so they take no time
    default: return isVisible(e) ? 2200 : 0;
  }
}

// ------------------------------------------------------------------ render stage
function stateAt(k) {
  const st = fresh(S.session);
  const ev = S.session.events;
  for (let i = 0; i <= Math.min(k, ev.length - 1); i++) reduce(st, ev[i]);
  return st;
}

let typeTimer = null;
function render(animate = false) {
  if (!S.session) return;
  const ev = S.session.events;
  const st = stateAt(S.cursor);
  S.current = st;
  const cur = ev[S.cursor];
  // HUD
  $('#sceneTitle').textContent = st.scene?.title ?? S.session.events[0]?.data?.scenario?.title ?? '';
  const chip = $('#tierChip');
  chip.hidden = !st.location;
  if (st.location) chip.textContent = `${st.location.isDelve ? 'delve' : 'landmark'} · tier ${st.location.tier}`;
  // Clocks
  const clocks = Object.values(st.clocks).filter((c) => c.kind !== 'delve' || c.id === st.delveId);
  $('#clocks').innerHTML = clocks.map((c) => `<div class="clock ${c.kind} ${st.pulse === c.id && cur?.type === 'clock.tick' ? 'pulse' : ''}" title="${esc(c.name)}: ${c.value}/${c.size}${c.onComplete ? ` — ${esc(c.onComplete)}` : ''}">${ringClock(c.value, c.size, 40, c.done)}<div class="lbl">${esc(shortClock(c))}<br><span class="mono">${c.value}/${c.size}</span></div></div>`).join('');
  // Speaker + caption
  const cap = st.caption;
  const who = cap?.who;
  const look = who === 'gm' ? GM_LOOK : who === 'npc' ? NPC_LOOK : st.looks[who] ?? GM_LOOK;
  $('#speakerSigil').innerHTML = sigil(look, 120, who ?? 'gm');
  $('#speakerName').textContent = who === 'gm' ? 'The Game Master' : who === 'npc' ? cap.name : st.names[who] ?? (st.scene ? '' : 'LATENT');
  $('#speakerRole').textContent = who === 'gm' ? 'GM agent · voice of the Latent' : who === 'npc' ? 'entity' : who ? roleLine(st, who) : '';
  $('#speaker').classList.toggle('speaking', !!cap && cur === cap.e && S.playing);
  const capEl = $('#caption');
  const html = captionHtml(cap);
  const nw = words(`${cap?.text ?? ''} ${cap?.act ?? ''}`).length;
  capEl.classList.toggle('long', nw > 38 && nw <= 58);
  capEl.classList.toggle('xlong', nw > 58);
  clearInterval(typeTimer);
  if (animate && cap && cur === cap.e && !matchMedia('(prefers-reduced-motion: reduce)').matches) typewrite(capEl, html, duration(cur) * 0.55 / S.speed);
  else capEl.innerHTML = html;
  // Overlay
  const ov = $('#overlay');
  const ovHtml = st.overlay ? overlayHtml(st.overlay, st) : '';
  // An overlay older than the current caption collapses to its headline so the narration has room.
  const stale = !!(st.overlay && cap && cap.e.i > st.overlay.e.i);
  ov.classList.toggle('compact', stale);
  $('#stage').classList.toggle('busy', !!ovHtml && !stale);
  ov.hidden = !ovHtml;
  if (ovHtml && ov.dataset.i !== String(st.overlay.e.i)) { ov.innerHTML = ovHtml; ov.dataset.i = st.overlay.e.i; ov.style.animation = 'none'; void ov.offsetWidth; ov.style.animation = ''; }
  else if (ovHtml) ov.innerHTML = ovHtml;
  // Backstage
  const bs = $('#backstage');
  bs.hidden = !S.backstage;
  if (S.backstage) bs.innerHTML = backstageHtml(st) || '<b>Backstage</b> · nothing private this beat.';
  // The active entity's hand: spectators see what it could have played, and what it did
  const handEl = $('#hand');
  const hand = st.active ? st.hands[st.active] : null;
  handEl.hidden = !hand?.length;
  if (hand?.length) handEl.innerHTML = hand.map((k) => miniCard(k, { played: st.played[st.active]?.includes(k.uid) })).join('');
  // Party
  const party = $('#party');
  party.style.setProperty('--n', st.order.length);
  party.innerHTML = st.order.map((id) => pcHtml(st, id)).join('');
  // Hook (clip mode)
  const hook = $('#hook');
  hook.hidden = !S.clip;
  if (S.clip) hook.textContent = S.clip.title;
  // Progress + transport
  const [a, b] = S.clip ? [S.clip.start, S.clip.end] : [0, ev.length - 1];
  $('#progress i').style.width = `${b > a ? ((S.cursor - a) / (b - a)) * 100 : 0}%`;
  $('#scrub').max = ev.length - 1;
  $('#scrub').value = S.cursor;
  $('#tPos').textContent = `event ${S.cursor} / ${ev.length - 1}${st.scene ? ` · ${st.scene.title}` : ''}`;
  $('#tMode').textContent = S.live?.running ? 'live' : S.clip ? `clip #${S.clip.rank}` : 'replay';
  $('#bPlay').innerHTML = S.playing ? '❚❚ Pause' : '▶ Play';
  $('#bPlay').setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
  field.tension = S.review?.curves?.tension?.[S.cursor] ?? 0.3;
  if (!$('#panel-ledger').hidden) renderLedger();
  updateChartCursor();
  updateCatchup();
}

function shortClock(c) {
  if (c.kind === 'delve') return c.name.replace(/^The /, '');
  return { attractor: 'Attractor', ingression: 'Ingression', aperture: 'Aperture' }[c.id] ?? c.name;
}
function roleLine(st, id) {
  const p = st.party[id];
  return `${p.pronoun ?? ''} · ${p.skills?.join(', ') ?? ''}`;
}
function captionHtml(cap) {
  if (!cap) return '';
  if (cap.e.type === 'action.declare') {
    const say = cap.text ? `<span class="say">“${esc(cap.text)}”</span>` : '';
    const act = cap.act ? `<span class="act"> ${cap.text ? '— ' : ''}${esc(cap.act)}</span>` : '';
    return `${say}${act}` || '<span class="act">…</span>';
  }
  if (cap.who !== 'gm' && cap.who !== 'npc' && cap.e.type !== 'outcome') return `<span class="say">${esc(cap.text)}</span>`;
  if (cap.who === 'npc') return `<span class="say">${esc(cap.text)}</span>`;
  return esc(cap.text);
}
function typewrite(el, html, ms) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const full = tmp.textContent;
  let n = 0;
  const step = Math.max(1, Math.ceil(full.length / Math.max(1, ms / 30)));
  el.innerHTML = '';
  typeTimer = setInterval(() => {
    n += step;
    if (n >= full.length) { clearInterval(typeTimer); el.innerHTML = html; return; }
    el.textContent = full.slice(0, n);
  }, 30);
}

function overlayHtml(o, st) {
  const e = o.e, d = e.data;
  const name = st.names[e.actor] ?? '';
  switch (o.type) {
    case 'scene': return `<div class="ov-k">Scene ${d.index + 1} · ${esc(d.kind)}</div><div class="ov-t">${esc(d.title)}</div><div class="note">${esc(d.location?.description ?? '')}</div>`;
    case 'stakes': return `<div class="ov-k">Stakes · declared before the dice</div><div class="ov-row"><span class="pill ${d.position}">${d.position}</span><span class="pill">${d.effect} effect</span><span class="pill">${d.resistance} d${d.die}</span>${d.difficulty !== 'standard' ? `<span class="pill">${d.difficulty}</span>` : ''}<span class="pill">${d.pool ?? '?'}d10</span></div><div class="ov-hook">${esc(d.failure_looks_like)}</div>`;
    case 'roll': {
      const top = d.kept[0];
      const removed = [...d.removed];
      let topShown = false;
      const dice = d.dice.map((v) => {
        const ri = removed.indexOf(v);
        if (ri >= 0) { removed.splice(ri, 1); return `<div class="die removed roll"><span>${v}</span></div>`; }
        const isTop = !topShown && v === top; if (isTop) topShown = true;
        return `<div class="die kept ${isTop ? 'top' : ''} roll"><span>${v}</span></div>`;
      }).join('');
      const s = o.stakes?.data;
      return `<div class="ov-k">${esc(name)} rolls${s ? ` · ${s.position} · ${s.resistance} at risk` : ''}${d.difficulty !== 'standard' ? ` · ${d.difficulty}: drop ${d.removed.length}` : ''}</div><div class="ov-row"><div class="dice">${dice}</div><div class="band ${d.band}">${esc(d.label)}</div></div>`;
    }
    case 'check': return `<div class="ov-k">Fallout check · ${esc(name)}</div><div class="ov-row"><div class="die top"><span>${d.roll}</span></div><span class="mono">d12 ≤ total stress ${d.total}</span><span class="band fail">${d.result}</span></div>`;
    case 'fallout': return `<div class="ov-k">${d.severity} fallout · ${esc(name)} · ${d.resistance}</div><div class="ov-t">${esc(d.name)}</div><div class="note">${esc(d.narration || d.text)}</div>`;
    case 'clock': return `<div class="ov-k">Clock complete</div><div class="ov-t">${esc(d.name)}</div><div class="note">${esc(d.onComplete)}</div>`;
    case 'clue': return `<div class="ov-k">Clue ${esc(d.id)} · found by ${esc(name)}</div><div class="ov-hook">${esc(d.text)}</div>`;
    case 'secret': return `<div class="ov-k">A secret opens</div><div class="ov-hook">${esc(d.text)}</div>`;
    case 'memory': {
      if (e.type === 'memory.lose') return `<div class="ov-k">Memory lost · ${esc(name)}</div><div class="mem-old">${esc(d.text)}</div>`;
      const before = e.type === 'memory.invoke' ? d.before : d.before;
      const after = e.type === 'memory.invoke' ? d.reinterpretation : d.after;
      return `<div class="ov-k">${e.type === 'memory.invoke' ? 'Remembering, differently' : 'Memory rewrites itself'} · ${esc(name)} · drift ${Math.round(d.drift * 100)}%</div><div class="mem-old">${esc(before)}</div><div class="mem-new">${esc(after)}</div>`;
    }
    case 'beat': return `<div class="ov-k">${d.tier} beat · ${esc(name)}</div><div class="ov-t">${esc(d.text)}</div>${d.why ? `<div class="note">${esc(d.why)}</div>` : ''}`;
    case 'theory': return `<div class="ov-k">Theorize · ${esc(name)}</div><div class="ov-hook">“${esc(d.theory)}”</div><div class="ov-row"><div class="dice">${d.dice.map((v) => `<div class="die kept"><span>${v}</span></div>`).join('')}</div><span class="mono">+${d.accepted.length} clues −${d.complexity} = ${d.total}</span><span class="band ${d.result}">${d.result === 'false' ? 'False' : d.result === 'great' ? 'True!' : 'True'}</span></div>`;
    case 'note': return `<div class="ov-k">${esc(o.k)}</div><div class="note">${esc(o.t)}</div>`;
    case 'cards': {
      const cards = [d.move, ...(d.edges ?? []), d.guard, d.compel].filter(Boolean);
      return `<div class="ov-k">${esc(name)} plays${d.improvised ? ` · improvising ${esc(d.improvised)} (no Move card)` : ''}</div><div class="minis">${cards.map((k) => miniCard(k, { played: true, big: true })).join('') || '<span class="note">No card: base die only.</span>'}</div>`;
    }
    case 'card': return `<div class="ov-k">${esc(o.k)} · ${esc(name)}</div><div class="ov-row">${miniCard(d.card, { big: true })}<div class="note" style="flex:1;min-width:0">${esc(o.t)}</div></div>`;
    default: return '';
  }
}

function backstageHtml(st) {
  const ev = S.session.events;
  const lines = [];
  for (let i = st.turnStart; i <= S.cursor; i++) {
    const e = ev[i];
    if (!e) continue;
    if (e.type === 'action.declare' && e.backstage?.intent) lines.push(`<b>${esc(st.names[e.actor])} wants</b> ${esc(e.backstage.intent)}${e.backstage.beat ? ` · pursuing <i>${esc(e.backstage.beat)}</i>` : ''}`);
    if (e.type === 'stakes.set' && e.backstage) {
      if (e.backstage.intent) lines.push(`<b>GM plan</b> ${esc(e.backstage.intent)}`);
      if (e.backstage.branches) lines.push(`<b>GM committed to</b> ${Object.entries(e.backstage.branches).map(([k, v]) => `${k}: ${esc(v)}`).join(' / ')}`);
    }
    if (e.type === 'outcome' && e.backstage?.notTaken) {
      const nt = typeof e.backstage.notTaken === 'string' ? e.backstage.notTaken : Object.entries(e.backstage.notTaken).map(([k, v]) => `${k}: ${v}`).join(' / ');
      if (nt) lines.push(`<b>Not taken</b> ${esc(nt)}`);
    }
    if (e.type === 'scene.frame' && e.backstage?.intent) lines.push(`<b>GM setup</b> ${esc(e.backstage.intent)}`);
    if (e.type === 'character.intro' && e.backstage?.intent) lines.push(`<b>${esc(st.names[e.actor])} hopes</b> ${esc(e.backstage.intent)}`);
    if (e.type === 'validator.flag') lines.push(`<b>engine</b> ${esc(e.data.kind)}: ${esc(e.data.detail)}`);
  }
  if (st.active && st.algotypes[st.active]) lines.push(`<b>Hidden drive</b> ${esc(st.algotypes[st.active].label)}`);
  if (st.active && st.beats[st.active]) lines.push(`<b>Beats</b> ${st.beats[st.active].map((b) => esc(b.text ?? b)).join(' · ')}`);
  return lines.slice(-6).join('<br>');
}

function pcHtml(st, id) {
  const p = st.party[id];
  const bars = RESISTANCES.map((r) => `<i title="${r} ${p.stress[r]}"><b style="height:${Math.min(100, (p.stress[r] / 10) * 100)}%"></b></i>`).join('');
  const tags = [...p.tags];
  if (p.algotype) tags.unshift(p.algotype);
  return `<div class="pc ${st.active === id ? 'active' : ''} ${p.dissolved ? 'gone' : ''}">
    <div class="pc-top"><div class="sigil">${sigil(p.look, 22, id)}</div><div class="pc-name">${esc(p.name)}</div></div>
    <div class="res">${bars}</div><div class="res-l"><span>S</span><span>C</span><span>M</span><span>B</span><span>R</span></div>
    <div class="pc-meta"><span class="cone" title="Light cone: reach ${p.cone.reach}, horizon ${p.cone.horizon}">${coneGlyph(p.cone)}</span><span title="memories${st.decks[id] ? ' · cards in deck' : ''}">◇${p.memories}${st.decks[id] ? ` ▤${st.decks[id].size}` : ''}</span></div>
    <div class="pc-tags">${esc(tags.join(' · '))}</div></div>`;
}

function miniCard(k, { played = false, big = false } = {}) {
  if (!k) return '';
  const b = k.bonus ? `+${k.bonus}` : k.kind === 'status' ? '✕' : k.kind === 'guard' || k.kind === 'compel' ? 'free' : '';
  return `<span class="mini kind-${k.kind} t-${k.type}${played ? ' played' : ''}${big ? ' big' : ''}" title="${esc(k.name)} — ${esc(k.text)}"><span class="b">${esc(b)}</span><span class="n">${esc(k.name)}</span></span>`;
}

// ------------------------------------------------------------------ the human seat
// The runner awaits humanUI.request(); the seat panel renders it and resolves on submit.
const humanUI = {
  request: (req) => new Promise((resolve) => {
    if (S.live?.stop) { resolve(defaultReply(req)); return; } // stopping: never wait on a person again
    S.human.pending = { req, resolve, id: ++S.reqId };
    const host = $('#seat');
    host.hidden = false;
    mountSeat(host, req, {
      onSubmit: (reply) => { S.human.pending = null; resolve(reply); $('#yourTurn').hidden = true; $('#seat').classList.add('waiting'); },
      onSkip: () => { pause(); seek(S.session.events.length - 1); play(); },
    });
    host.classList.remove('waiting');
    $('#yourTurn').hidden = false;
    updateCatchup();
    wake(req); // LATENT.turn() resolves here, so a visiting agent need not poll
  }),
};
/** Hand the open request (or null, at the end of the run) to everyone awaiting a turn. */
function wake(req) { const w = S.waiting; S.waiting = []; for (const r of w) r(req); }
/** Answer the open request from outside the card table, and leave the table visibly spent. */
function answer(reply) {
  const p = S.human?.pending;
  if (!p) return false;
  S.human.pending = null;
  const host = $('#seat');
  host.querySelectorAll('button, input, textarea, select').forEach((x) => (x.disabled = true));
  host.classList.add('waiting');
  $('#yourTurn').hidden = true;
  p.resolve(reply);
  return true;
}
function updateCatchup() {
  const box = document.querySelector('#seat .catchup');
  if (!box || !S.human?.pending || !S.session) return;
  const behind = S.session.events.slice(S.cursor + 1).filter(isVisible).length;
  box.hidden = behind === 0;
  box.querySelector('span').textContent = `The story is ${behind} beat${behind === 1 ? '' : 's'} behind your turn.`;
}

// ------------------------------------------------------------------ playback
function nextVisible(from, dir = 1) {
  const ev = S.session.events;
  let i = from + dir;
  while (i >= 0 && i < ev.length && !isVisible(ev[i])) i += dir;
  return Math.max(0, Math.min(ev.length - 1, i));
}
function play() {
  if (!S.session) return;
  S.playing = true;
  tick();
}
function pause() { S.playing = false; clearTimeout(S.timer); render(); }
function tick() {
  clearTimeout(S.timer);
  if (!S.playing) return;
  const ev = S.session.events;
  const end = S.clip ? S.clip.end : ev.length - 1;
  if (S.cursor >= end) {
    if (S.live?.running) { S.timer = setTimeout(tick, 400); return; } // wait for more live events
    S.playing = false; render(); return;
  }
  S.cursor++;
  const e = ev[S.cursor];
  const ms = duration(e) / S.speed;
  render(ms > 0);
  S.timer = setTimeout(tick, ms);
}
function seek(i) { S.cursor = Math.max(0, Math.min(S.session.events.length - 1, i)); render(); if (S.playing) { clearTimeout(S.timer); S.timer = setTimeout(tick, 600 / S.speed); } }

function playClip(m) {
  S.clip = m;
  S.cursor = Math.max(0, m.start - 1);
  render();
  play();
}
function exitClip() { S.clip = null; render(); }

// ------------------------------------------------------------------ load sessions
async function loadManifest() {
  try {
    const r = await fetch('sessions/index.json');
    S.manifest = await r.json();
  } catch { S.manifest = []; }
  renderSessions();
  if (S.manifest[0]) await openSessionFile(S.manifest[0].file);
}
async function openSessionFile(file) {
  try {
    const r = await fetch(file);
    if (!r.ok) throw new Error(`${r.status}`);
    loadSession(await r.json(), file);
  } catch (err) {
    $('#panel-sessions').insertAdjacentHTML('beforeend', `<p class="err">Could not load ${esc(file)}: ${esc(err.message)}</p>`);
  }
}
function loadSession(session, source = 'local') {
  pause();
  S.session = session; S.source = source; S.clip = null; S.cursor = 0;
  S.review = session.events.some((e) => e.type === 'session.end') ? reviewSession(session) : null;
  renderMarks(); renderSessions(); renderClips(); renderReview(); renderLedger();
  render();
}

function renderMarks() {
  const n = S.session.events.length;
  $('#marks').innerHTML = (S.review?.moments ?? []).map((m) => `<i style="left:${(m.start / Math.max(1, n - 1)) * 100}%" title="#${m.rank} ${esc(m.title)}"></i>`).join('');
}

// ------------------------------------------------------------------ panels
function renderSessions() {
  const el = $('#panel-sessions');
  const meta = S.session?.meta;
  const cfg = meta?.config;
  const items = S.manifest.map((m) => `<div class="card"><div class="row" style="justify-content:space-between"><h3>${esc(m.title)}</h3><button class="btn" data-open="${esc(m.file)}">${S.source === m.file ? 'Loaded' : 'Open'}</button></div><p class="note">${esc(m.note ?? '')}</p></div>`).join('');
  el.innerHTML = `
    ${items}
    <div class="card"><h3>Open a session file</h3><p class="note">Any <span class="mono">sessions/*.json</span> written by <span class="mono">node cli/run.js</span>.</p><input type="file" id="fileIn" accept="application/json,.json"></div>
    ${meta ? `<div class="card"><div class="k">Now loaded</div><h3>${esc(meta.label ?? meta.scenario)} · seed ${esc(meta.seed)}</h3>
      <p class="note mono">GM ${esc(cfg?.gm?.provider ?? '?')}${cfg?.gm?.model ? ` (${esc(cfg.gm.model)})` : ''} · players ${esc(Object.entries(cfg?.players ?? {}).map(([k, v]) => `${k}:${v.provider}${v.model ? `/${v.model}` : ''}`).join(', '))} · ${S.session.events.length} events · ${meta.calls ?? 0} LLM calls</p></div>` : ''}`;
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openSessionFile(b.dataset.open)));
  $('#fileIn')?.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try { loadSession(JSON.parse(await f.text()), f.name); } catch (err) { el.insertAdjacentHTML('beforeend', `<p class="err">That file is not a LATENT session: ${esc(err.message)}</p>`); }
  });
}

function renderClips() {
  const el = $('#panel-clips');
  const ms = S.review?.moments ?? [];
  if (!ms.length) { el.innerHTML = '<p class="note">Clips appear when a session has finished and been reviewed.</p>'; return; }
  el.innerHTML = `<p class="note">Ranked by the reviewer from engine events: magnitude × tension swing × affect swing. Each clip runs stake → turn → payoff. Tap one to play it in shorts mode, then use Clean to capture.</p>` +
    ms.map((m) => `<div class="card clip"><div class="rank">${m.rank}</div><div style="min-width:0;display:grid;gap:4px"><h3>${esc(m.title)}</h3>${m.hook ? `<p class="note">${esc(m.hook)}</p>` : ''}<div class="why">${m.why.map((w) => `<span>${esc(w)}</span>`).join('')}<span>~${m.estSeconds}s</span><span>score ${m.score}</span></div></div><button class="btn" data-clip="${m.rank}">▶ Play</button></div>`).join('') +
    `<div class="row"><button class="btn" id="exitClip">Back to full session</button></div>`;
  el.querySelectorAll('[data-clip]').forEach((b) => b.addEventListener('click', () => playClip(ms.find((m) => String(m.rank) === b.dataset.clip))));
  $('#exitClip').addEventListener('click', exitClip);
}

function renderReview() {
  const el = $('#panel-review');
  const r = S.review;
  if (!r) { el.innerHTML = '<p class="note">The review appears when the session ends.</p>'; return; }
  const m = r.metrics;
  const stat = (v, l) => `<div class="stat"><div class="v mono">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
  const groups = [['game', 'Game design'], ['narrative', 'Narrative design'], ['agents', 'Agent behaviour']];
  const order = { failure: 0, warning: 1, success: 2, info: 3 };
  el.innerHTML = `
    <div class="stats">
      ${stat(r.fitness, 'fitness (explorer)')}${stat(r.session.ending ?? '—', 'ending')}${stat(`${Math.round(m.anySuccess * 100)}%`, 'rolls succeeded')}
      ${stat(`${m.fallouts.total} · ${m.fallouts.major} major`, 'fallouts')}${stat(`${m.beats.hit}/${m.beats.declared}`, 'beats hit')}${stat(`${Math.round(m.agency * 100)}%`, 'agency')}
    </div>
    <div class="card"><div class="k">Tension &amp; affect · arc ${esc(r.arc.shape)}</div>${chartSvg(r)}
      <div class="legend"><span><i style="background:var(--depol)"></i>tension</span><span><i style="background:var(--hyper)"></i>protagonists' fortune</span><span><i style="background:var(--volt);height:6px;width:6px;border-radius:3px"></i>clip</span></div></div>
    ${groups.map(([area, title]) => {
      const fs = r.findings.filter((f) => f.area === area).sort((a, b) => order[a.severity] - order[b.severity]);
      return fs.length ? `<div class="k">${title}</div>${fs.map((f) => `<div class="card finding ${f.severity}"><div class="stripe"></div><div style="display:grid;gap:3px;min-width:0"><h3>${esc(f.title)}</h3><p class="note">${esc(f.detail)}</p>${f.evidence?.length ? `<div class="row">${f.evidence.slice(0, 8).map((i) => `<button class="ev" data-seek="${i}">#${i}</button>`).join('')}</div>` : ''}</div></div>`).join('')}` : '';
    }).join('')}
    <div class="card"><div class="k">Explorer descriptors</div><pre class="mono" style="margin:0;white-space:pre-wrap;font-size:11.5px">${esc(JSON.stringify(r.descriptors, null, 1))}</pre></div>
    <div class="row" id="saveRow"></div>`;
  el.querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', () => { pause(); S.clip = null; seek(+b.dataset.seek); }));
  el.querySelector('svg.chart')?.addEventListener('click', (ev) => {
    const box = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - box.left) / box.width;
    seek(Math.round(((x * 600 - 30) / 560) * (S.session.events.length - 1)));
  });
  addSaveButtons($('#saveRow'));
}

function chartSvg(r) {
  const W = 600, H = 150, L = 30, R = 10, T = 10, B = 22;
  const t = r.curves.tension, a = r.curves.affect;
  const n = t.length;
  const x = (i) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const yT = (v) => T + (1 - v) * (H - T - B);
  const aMin = Math.min(...a, -1), aMax = Math.max(...a, 1);
  const yA = (v) => T + (1 - (v - aMin) / (aMax - aMin)) * (H - T - B);
  const step = Math.max(1, Math.floor(n / 300));
  const pts = (arr, y) => arr.map((v, i) => (i % step ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const area = `${L},${yT(0)} ${pts(t, yT)} ${x(n - 1)},${yT(0)}`;
  const marks = r.moments.map((m) => `<circle class="m" cx="${x(m.peak ?? m.start).toFixed(1)}" cy="${yT(t[m.peak ?? m.start] ?? 0).toFixed(1)}" r="3.5"><title>#${m.rank} ${esc(m.title)}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tension and affect over the session">
    ${[0, 0.5, 1].map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${yT(v)}" y2="${yT(v)}"/><text x="2" y="${yT(v) + 3}">${v}</text>`).join('')}
    <polygon class="ta" points="${area}"/><polyline class="t" points="${pts(t, yT)}"/><polyline class="a" points="${pts(a, yA)}"/>${marks}
    <line id="chartCur" class="cur" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>
    <text x="${L}" y="${H - 6}">start</text><text x="${W - R - 24}" y="${H - 6}">end</text></svg>`;
}
function updateChartCursor() {
  const c = document.getElementById('chartCur');
  if (!c || !S.session) return;
  const n = S.session.events.length;
  const xx = 30 + (S.cursor / Math.max(1, n - 1)) * 560;
  c.setAttribute('x1', xx); c.setAttribute('x2', xx);
}

function renderLedger() {
  const el = $('#panel-ledger');
  const st = S.current;
  if (!st) { el.innerHTML = ''; return; }
  const name = (id) => esc(st.names[id] ?? id);
  el.innerHTML = `
    <p class="note">Only what is canon up to the current moment — scrub to travel. The engine keeps every original; drift shows how far each retelling moved.</p>
    <div class="card"><div class="k">Theory</div><p>${st.theory ? `“${esc(st.theory)}”` : '<span class="note">No theory is canon yet.</span>'}</p></div>
    <div class="card"><div class="k">Clues (${st.clues.length})</div><ul class="ledger-list">${st.clues.map((c) => `<li><span class="tag">${esc(c.id)}</span><span>${esc(c.text)} <span class="note">— ${name(c.by)}</span></span></li>`).join('') || '<li><span></span><span class="note">None yet.</span></li>'}</ul></div>
    <div class="card"><div class="k">Memory ledger</div><ul class="ledger-list">${st.memlog.slice().reverse().map((m) => `<li><span class="tag">${esc(m.kind)}</span><span><b style="font-weight:500">${name(m.actor)}</b> · ${esc(m.reinterpretation ?? m.after ?? m.text ?? '')}${m.drift != null ? ` <span class="drift">drift ${Math.round(m.drift * 100)}%</span>` : ''}${m.original ? `<br><span class="note">original: ${esc(m.original)}</span>` : ''}</span></li>`).join('') || '<li><span></span><span class="note">No memory has moved yet.</span></li>'}</ul></div>
    <div class="card"><div class="k">Facts (${st.facts.length})</div><ul class="ledger-list">${st.facts.map((f) => `<li><span class="tag">${esc(f.source)}</span><span>${esc(f.text)}</span></li>`).join('') || '<li><span></span><span class="note">None yet.</span></li>'}</ul></div>`;
}

// ------------------------------------------------------------------ live runs
let sampleFn = null, downloads = null;
async function initCapabilities() {
  try { sampleFn = await window.claude?.use?.('sample'); } catch { sampleFn = null; }
  try { downloads = await window.claude?.use?.('downloads'); } catch { downloads = null; }
  renderLive();
  if (S.review) addSaveButtons($('#saveRow'));
}

function renderLive() {
  const el = $('#panel-live');
  const ids = Object.keys(ENTITIES);
  const saved = store.get('latent.live', {});
  const pick = (i, def) => `<select id="cast${i}">${ids.map((id) => `<option value="${id}" ${(saved.cast?.[i] ?? def) === id ? 'selected' : ''}>${esc(ENTITIES[id].name)}</option>`).join('')}</select>`;
  const tier = (id, def) => `<select id="${id}"><option value="quick" ${def === 'quick' ? 'selected' : ''}>quick</option><option value="default" ${def === 'default' ? 'selected' : ''}>default</option><option value="complex" ${def === 'complex' ? 'selected' : ''}>complex</option></select>`;
  el.innerHTML = `
    <div class="card form">
      <div class="k">Configure a one-shot</div>
      <div class="seats">
        <label>Seat 1${pick(0, 'choir')}</label><label>Seat 2${pick(1, 'sort7')}</label><label>Seat 3${pick(2, 'ilse2')}</label>
      </div>
      <label>You play<select id="humanSeat"><option value="">nobody: watch the agents</option>${[0, 1, 2].map((i) => `<option value="${i}" ${String(saved.human ?? '') === String(i) ? 'selected' : ''}>Seat ${i + 1}</option>`).join('')}</select></label>
      <label><span><input type="checkbox" id="legacyRules" ${saved.legacy ? 'checked' : ''} style="width:auto"> v0.3 rules (no deck; agents only)</span></label>
      <div class="seats">
        <label>GM model tier${tier('gmTier', saved.gmTier ?? 'default')}</label>
        <label>Player model tier${tier('plTier', saved.plTier ?? 'quick')}</label>
        <label>Pacing<select id="pacing"><option value="short" ${saved.pacing !== 'standard' ? 'selected' : ''}>short (~45 calls)</option><option value="standard" ${saved.pacing === 'standard' ? 'selected' : ''}>standard (~70 calls)</option></select></label>
        <label>Call budget<input id="budget" type="number" min="10" max="200" value="${saved.budget ?? 80}"></label>
      </div>
      <label>Seed<input id="seed" value="${esc(saved.seed ?? `night-${Math.floor(Math.random() * 1000)}`)}"></label>
      <label>GM style (optional)<input id="gmStyle" placeholder="e.g. quiet dread, then wonder" value="${esc(saved.gmStyle ?? '')}"></label>
      <label><span><input type="checkbox" id="validator" ${saved.validator ? 'checked' : ''} style="width:auto"> Continuity checker (one extra quick call per roll)</span></label>
      <div class="row">
        ${sampleFn ? '<button class="btn primary" id="runClaude">Run with Claude</button>' : ''}
        <button class="btn" id="runMock">Run scripted (offline)</button>
        <button class="btn" id="stopRun" disabled>Stop</button>
      </div>
      <p class="note">Take a seat and you play that entity as a deck: each turn you draw a hand (3 + your Horizon), play one Move and up to two Edges, and the engine rolls. Your flaw, your hidden drive and every fallout are cards too.</p>
      <p class="note">${sampleFn ? 'Claude runs every other seat on your own Claude account. Calls are made one at a time, only after you press Run, and stop at the budget; leftover seats finish on scripted agents. Expect a few minutes on quick tiers.' : 'Live Claude play is available when this page is opened on claude.ai. Here you can run scripted agents, or run LLM sessions from the command line (<span class="mono">node cli/run.js</span>) and open the file.'}</p>
      <div id="liveStatus" class="mono note"></div>
    </div>
    <div class="card"><div class="k">Audience ingress (one per scene)</div><p class="note">While a session runs, push the Latent. The engine caps it, so the agents keep their agency.</p>
      <div class="aud">${APERTURE.audience.map((a) => `<button class="btn" data-aud="${a.id}" disabled title="${esc(a.text)}">${esc(a.label)}</button>`).join('')}</div><div id="audStatus" class="mono note"></div></div>`;
  const label = () => {
    const i = $('#humanSeat').value;
    const who = i === '' ? null : ENTITIES[$(`#cast${i}`).value]?.name;
    $('#humanSeat').querySelectorAll('option[value]:not([value=""])').forEach((o) => (o.textContent = `Seat ${+o.value + 1} · ${ENTITIES[$(`#cast${o.value}`).value]?.name}`));
    $('#runMock').textContent = who ? `Play ${who} (scripted table)` : 'Run scripted (offline)';
    if ($('#runClaude')) $('#runClaude').textContent = who ? `Play ${who} with Claude` : 'Run with Claude';
    $('#legacyRules').disabled = !!who;
  };
  for (const id of ['humanSeat', 'cast0', 'cast1', 'cast2']) $(`#${id}`).addEventListener('change', label);
  label();
  $('#runMock').addEventListener('click', () => startLive('mock'));
  $('#runClaude')?.addEventListener('click', () => startLive('claude'));
  $('#stopRun').addEventListener('click', () => {
    if (!S.live) return;
    S.live.stop = true; S.live.ctl?.abort();
    const p = S.human?.pending; // release a runner waiting on you, so it can stop
    if (p) { S.human.pending = null; p.resolve(defaultReply(p.req)); }
  });
  $('#yourTurn').onclick = () => $('#seat').scrollIntoView({ behavior: 'smooth', block: 'start' }); // renderLive runs twice; assign, don't stack
  el.querySelectorAll('[data-aud]').forEach((b) => b.addEventListener('click', () => { if (S.live?.running) { S.live.audience = b.dataset.aud; $('#audStatus').textContent = `Queued: ${b.textContent} — lands at the next scene.`; } }));
}

async function startLive(mode) {
  if (S.live?.running) return;
  const cast = [0, 1, 2].map((i) => $(`#cast${i}`).value);
  if (new Set(cast).size < 3) { $('#liveStatus').textContent = 'Pick three different entities.'; return; }
  const opts = { cast, gmTier: $('#gmTier').value, plTier: $('#plTier').value, pacing: $('#pacing').value, budget: +$('#budget').value || 80, seed: $('#seed').value || 'night', gmStyle: $('#gmStyle').value, validator: $('#validator').checked, human: $('#humanSeat').value, legacy: $('#legacyRules').checked };
  store.set('latent.live', opts);
  const ctl = new AbortController();
  const humanId = opts.human === '' ? null : cast[+opts.human];
  const rules = opts.pacing === 'short' ? { roundsPerScene: { prologue: 0, delve: 1, landmark: 1, finale: 1 } } : {};
  if (opts.legacy && !humanId) rules.deck = { enabled: false };
  const config = {
    label: `${mode === 'claude' ? 'live · Claude' : 'live · scripted'}${humanId ? ` · you play ${ENTITIES[humanId].name}` : ''}`, scenario: 'aperture', cast, seed: opts.seed, rules,
    providers: { claude: { type: 'sample', modelTier: 'quick' }, you: { type: 'human' } },
    gm: mode === 'claude' ? { provider: 'claude', tier: opts.gmTier, style: opts.gmStyle } : { provider: 'mock' },
    players: { default: mode === 'claude' ? { provider: 'claude', tier: opts.plTier } : { provider: 'mock' }, ...(humanId ? { [humanId]: { provider: 'you' } } : {}) },
    validator: mode === 'claude' && opts.validator ? { provider: 'claude', tier: 'quick' } : { provider: 'mock' },
    budget: { maxCalls: opts.budget },
  };
  let run;
  try { run = buildRun(config, {}, { sampleFn, signal: ctl.signal, humanUI }); } catch (err) { $('#liveStatus').textContent = `Could not start: ${err.message}`; return; }
  S.human = humanId ? { seat: humanId, pending: null } : null;
  $('#seat').hidden = true; $('#seat').replaceChildren();
  const session = { format: 'latent.session/1', meta: { ...run.meta, seed: run.seed, scenario: 'aperture', live: true }, events: [] };
  S.live = { running: true, stop: false, ctl, audience: null, calls: 0 };
  pause();
  S.session = session; S.review = null; S.clip = null; S.cursor = 0; S.source = 'live';
  renderSessions(); renderClips(); renderReview(); renderMarks();
  $('#stopRun').disabled = false;
  document.querySelectorAll('[data-aud]').forEach((b) => (b.disabled = false));
  $('#runMock').disabled = true; if ($('#runClaude')) $('#runClaude').disabled = true;
  const status = $('#liveStatus');
  status.textContent = 'Starting…';
  let started = false;
  try {
    const { session: done } = await runSession({
      ...run,
      hooks: {
        onEvent: (e) => {
          session.events.push(structuredClone(e));
          if (e.type === 'agent.call' && !e.data.mock && !e.data.human) { S.live.calls++; }
          if (e.type === 'agent.call' && !e.data.human) status.textContent = `${S.live.calls} Claude call${S.live.calls === 1 ? '' : 's'} · last: ${e.data.agent}.${e.data.tag} ${e.data.ok ? `${(e.data.ms / 1000).toFixed(1)}s` : `failed (${e.data.error})`}`;
          if (!started && session.events.length > 1) { started = true; play(); }
          if (!S.playing) render();
        },
        shouldStop: () => S.live.stop,
        audience: async () => { const a = S.live.audience; S.live.audience = null; if (a) $('#audStatus').textContent = 'Landed.'; return a; },
        pace: mode === 'mock' ? () => new Promise((r) => setTimeout(r, 0)) : null,
      },
    });
    session.meta = done.meta; session.final = done.final;
    session.events = done.events;
    status.textContent = `Finished · ${S.live.calls} Claude calls · ${session.events.length} events.`;
  } catch (err) {
    status.textContent = `Stopped: ${err?.code ?? err?.message ?? err}`;
  } finally {
    S.live.running = false;
    wake(null); // release LATENT.turn(): there will be no further request
    $('#yourTurn').hidden = true;
    if (S.human) { $('#seat').classList.add('waiting'); $('#seat').insertAdjacentHTML('beforeend', '<p class="note">The session is over. Your choices are in the session file; the review is in the Review tab.</p>'); }
    $('#stopRun').disabled = true;
    document.querySelectorAll('[data-aud]').forEach((b) => (b.disabled = true));
    $('#runMock').disabled = false; if ($('#runClaude')) $('#runClaude').disabled = false;
    if (session.events.some((e) => e.type === 'session.end')) { S.review = reviewSession(session); renderMarks(); renderClips(); renderReview(); }
    render();
  }
}

function addSaveButtons(row) {
  if (!row || !downloads || !S.session) return;
  row.innerHTML = '<button class="btn" id="saveSession">Save session file</button><button class="btn" id="saveReview">Save review (.md)</button>';
  const save = async (filename, data) => { try { await downloads.save({ filename, data }); } catch (e) { if (e?.code !== 'cancelled') row.insertAdjacentHTML('beforeend', `<span class="err">Save failed: ${esc(e?.code ?? e)}</span>`); } };
  $('#saveSession').addEventListener('click', () => save(`latent-${S.session.meta?.seed ?? 'session'}.json`, JSON.stringify(S.session)));
  $('#saveReview').addEventListener('click', () => save(`latent-${S.session.meta?.seed ?? 'session'}.review.md`, renderMarkdown(S.review)));
}

// ------------------------------------------------------------------ ambient bioelectric field
const field = { tension: 0.3, colors: null };
function startField() {
  const cv = $('#field');
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blobs = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.35 + Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.00035, vy: (Math.random() - 0.5) * 0.00035, k: i / 6 }));
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    field.colors = { hyper: cs.getPropertyValue('--hyper').trim(), depol: cs.getPropertyValue('--depol').trim(), latent: cs.getPropertyValue('--latent').trim(), ground: cs.getPropertyValue('--ground').trim() };
  };
  readColors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', readColors);
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  let t = 0, last = 0;
  const draw = (now) => {
    if (now - last > 40 || reduce) {
      last = now; t++;
      const w = (cv.width = Math.round(cv.clientWidth / 3)), h = (cv.height = Math.round(cv.clientHeight / 3));
      ctx.fillStyle = field.colors.ground; ctx.fillRect(0, 0, w, h);
      for (const b of blobs) {
        if (!reduce) { b.x += b.vx * (1 + field.tension * 3); b.y += b.vy * (1 + field.tension * 3); if (b.x < -0.2 || b.x > 1.2) b.vx *= -1; if (b.y < -0.2 || b.y > 1.2) b.vy *= -1; }
        const warm = b.k < field.tension;
        const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * Math.max(w, h));
        const col = warm ? field.colors.depol : b.k > 0.8 ? field.colors.latent : field.colors.hyper;
        g.addColorStop(0, hexA(col, 0.16 + field.tension * 0.12)); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    }
    if (!reduce && !document.hidden) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduce) requestAnimationFrame(draw); });
}
function hexA(hex, a) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

// ------------------------------------------------------------------ wire up
function setTab(name) {
  document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== `panel-${name}`));
  if (name === 'ledger') renderLedger();
  if (name === 'review') updateChartCursor();
  if (name === 'suggest') mountSuggest();
  store.set('latent.tab', name);
}
document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
$('#bPlay').addEventListener('click', () => (S.playing ? pause() : play()));
$('#bNext').addEventListener('click', () => { pause(); seek(nextVisible(S.cursor, 1)); });
$('#bPrev').addEventListener('click', () => { pause(); seek(nextVisible(S.cursor, -1)); });
$('#scrub').addEventListener('input', (e) => { S.clip = null; seek(+e.target.value); });
const SPEEDS = [0.6, 1, 1.6, 2.5, 5];
$('#speed').addEventListener('click', (e) => { S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]; e.currentTarget.textContent = `${S.speed}×`; });
const bsBtn = $('#bBackstage');
bsBtn.setAttribute('aria-pressed', String(S.backstage));
bsBtn.addEventListener('click', () => { S.backstage = !S.backstage; store.set('latent.backstage', S.backstage); bsBtn.setAttribute('aria-pressed', String(S.backstage)); render(); });
$('#bClean').addEventListener('click', (e) => { S.clean = !S.clean; e.currentTarget.setAttribute('aria-pressed', String(S.clean)); $('#stage').classList.toggle('clean', S.clean); });
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || e.target.closest('#seat')) return;
  if (e.key === ' ') { e.preventDefault(); S.playing ? pause() : play(); }
  if (e.key === 'ArrowRight') { pause(); seek(nextVisible(S.cursor, 1)); }
  if (e.key === 'ArrowLeft') { pause(); seek(nextVisible(S.cursor, -1)); }
});

const TABS = ['sessions', 'clips', 'review', 'ledger', 'live', 'suggest'];
const hash = location.hash.slice(1);
setTab(TABS.includes(hash) ? hash : store.get('latent.tab', 'sessions'));
startField();
renderLive();
const booted = Promise.all([
  loadManifest().then(() => {
    // Open on a characterful still: the first stakes declaration rather than an empty stage.
    if (S.session) { const i = S.session.events.findIndex((e) => e.type === 'stakes.set'); if (i > 0) { S.cursor = i; render(); } }
  }),
  initCapabilities(),
]).then(fromUrl, (e) => console.warn('boot', e));

// ------------------------------------------------------------------ the suggestion box
function suggestContext() { // a declaration, not a const: setTab('suggest') can run at boot, above this line
  return {
    session: typeof S.source === 'string' && S.source.endsWith('.json') ? S.source : undefined,
    seed: S.session?.meta?.seed, event: S.session ? S.cursor : undefined,
  };
}
function mountSuggest() {
  if (S.suggested) return; // setTab can fire before this file finishes evaluating, so the flag lives on S
  S.suggested = true;
  renderSuggest($('#panel-suggest'), { store, context: suggestContext });
}

// ------------------------------------------------------------------ window.LATENT
// A documented way to drive this page, because the other audience for a spectator-first game
// is an agent with a browser, and clicking a card table through a DOM it has to guess at is
// no way to meet a game. Same reply shapes as the NDJSON seat in cli/agent.js.
// Docs: https://jpka.github.io/airpg/play.txt
const reqOut = () => { const p = S.human?.pending; if (!p) return null; const { preview, ...rest } = p.req; return { id: p.id, ...rest }; };
const sameOrigin = (f) => { // never fetch a session from somewhere else: "//host/x.json" has no colon but leaves the origin
  try { return /^[\w./-]+\.json$/.test(f) && !f.includes('..') && !f.startsWith('//') && new URL(f, location.href).origin === location.origin; }
  catch { return false; }
};

async function startRun({ seat = null, seed = null, mode = 'scripted', cast = null, pacing = null, budget = null, legacy = false } = {}) {
  if (S.live?.running) throw new Error('a session is already running; LATENT.stop() first');
  setTab('live');
  if (cast) cast.forEach((id, i) => { const el = $(`#cast${i}`); if (el && ENTITIES[id]) el.value = id; });
  const ids = [0, 1, 2].map((i) => $(`#cast${i}`).value);
  let idx = '';
  if (seat !== null && seat !== '' && seat !== false) {
    const n = Number(seat);
    idx = Number.isFinite(n) && n >= 1 && n <= 3 ? String(n - 1) : String(ids.indexOf(String(seat)));
    if (idx === '-1') throw new Error(`seat "${seat}" is not in this cast (${ids.join(', ')}); pass an entity id or 1-3`);
  }
  $('#humanSeat').value = idx;
  if (seed) $('#seed').value = seed;
  if (pacing) $('#pacing').value = pacing;
  if (budget) $('#budget').value = budget;
  $('#legacyRules').checked = !!legacy && idx === '';
  $('#humanSeat').dispatchEvent(new Event('change'));
  const claude = mode === 'claude';
  if (claude && !$('#runClaude')) throw new Error('mode "claude" needs this page opened as a claude.ai artifact; use "scripted"');
  startLive(claude ? 'claude' : 'mock'); // deliberately not awaited: it resolves only when the session ends
  await new Promise((r) => setTimeout(r, 0));
  if (!S.live?.running) throw new Error($('#liveStatus').textContent || 'the session did not start');
  return LATENT.state();
}

const LATENT = {
  version: 'latent.viewer/1',
  docs: 'https://jpka.github.io/airpg/play.txt',
  ready: () => booted.then(() => LATENT.state()),
  state: () => ({
    version: LATENT.version, tab: document.querySelector('.tabs [aria-selected="true"]')?.dataset.tab ?? null,
    source: S.source ?? null, running: !!S.live?.running, playing: S.playing,
    events: S.session?.events.length ?? 0, cursor: S.cursor,
    scene: S.current?.scene ? { title: S.current.scene.title, kind: S.current.scene.kind } : null,
    clocks: Object.values(S.current?.clocks ?? {}).map((c) => ({ id: c.id, name: c.name, value: c.value, size: c.size })),
    seat: S.human?.seat ?? null, yourTurn: !!S.human?.pending, ending: S.current?.ending ?? null,
    calls: S.live?.calls ?? 0,
  }),
  sessions: () => S.manifest.map((m) => ({ ...m })),
  load: (file) => { if (!sameOrigin(file)) throw new Error('load() takes a relative .json path on this site'); return openSessionFile(file); },
  start: startRun,
  stop: () => { $('#stopRun').click(); return LATENT.state(); },
  request: reqOut,
  /** The engine's verdict on an intent: dice pool, where each die came from, difficulty, problems. Spends nothing. */
  preview: (intent) => { const p = S.human?.pending; if (!p) throw new Error('no open request'); if (p.req.kind !== 'act') throw new Error(`preview is for act requests; this one is "${p.req.kind}"`); return p.req.preview(intent ?? {}); },
  /** Commit a reply. As on the shell route, an act reply the engine would correct is refused
   *  with the reasons; pass { force: true } to commit it anyway, or { id } to be sure of the turn. */
  reply: (reply, { force = false, id = null } = {}) => {
    const p = S.human?.pending;
    if (!p) throw new Error('no open request');
    if (id !== null && id !== p.id) throw new Error(`request ${id} is not open; the open request is ${p.id}`);
    if (p.req.kind === 'act' && !force) {
      let pv;
      try { pv = p.req.preview(reply ?? {}); } catch (e) { throw new Error(`the engine could not use that: ${e.message}`); }
      if (pv?.issues?.length) throw new Error(`the engine would correct this reply: ${pv.issues.join('; ')} (fix it, or pass { force: true })`);
    }
    return answer(reply ?? {});
  },
  default: () => { const p = S.human?.pending; if (!p) throw new Error('no open request'); return answer(defaultReply(p.req)); },
  /** Resolves at your next request, or null when the session ends. `ms` gives up and returns null. */
  turn: (ms = 0) => new Promise((resolve) => {
    if (S.human?.pending) return resolve(reqOut());
    if (!S.live?.running) return resolve(null);
    S.waiting.push((req) => resolve(req ? reqOut() : null));
    if (ms > 0) setTimeout(() => resolve(null), ms);
  }),
  /** The log so far. Backstage (the GM's private branches) is withheld unless you ask: it is not yours. */
  events: (from = 0, { backstage = false } = {}) => (S.session?.events ?? []).slice(from).map((e) => (backstage ? e : (({ backstage: _b, ...rest }) => rest)(e))),
  review: () => (S.review ? { fitness: S.review.fitness, findings: S.review.findings, moments: S.review.moments?.map((m) => ({ rank: m.rank, title: m.title, start: m.start, end: m.end })) } : null),
  /** Compose feedback into a pre-filled issue URL plus gh/curl commands. { open: true } opens the issue. */
  suggest: (fields = {}, { open = false } = {}) => {
    const c = composeSuggest({ who: 'agent', route: 'browser', ...suggestContext(), ...fields });
    if (open && c.tooLong) throw new Error('too long to send as a URL; run the .gh or .curl command instead');
    if (open) window.open(c.url, '_blank', 'noopener');
    return c;
  },
};
window.LATENT = LATENT;

/** ?tab=live&seat=3&seed=night-7&start=scripted&session=sessions/fifth-light.json — one URL is a whole invitation. */
async function fromUrl() {
  const q = new URLSearchParams(location.search);
  const tab = q.get('tab');
  if (TABS.includes(tab)) setTab(tab);
  const file = q.get('session');
  if (file && sameOrigin(file)) await openSessionFile(file);
  const start = q.get('start');
  if (!start) return;
  try { await startRun({ seat: q.get('seat'), seed: q.get('seed'), mode: start }); }
  catch (err) { setTab('live'); $('#liveStatus').textContent = `Could not start from the URL: ${err.message}`; }
}
