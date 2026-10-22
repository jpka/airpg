// The human seat: a deckbuilder table for one entity. mountSeat() renders one request
// (intro · act · fallout · epilogue) into `el` and calls onSubmit(reply) once, with
// the same JSON shape an LLM player returns. Text inputs are rendered once per
// request; only cards, follow-ups and the dice preview refresh as you choose.
import { sigil, coneGlyph } from './sigils.js';
import { SKILLS, RESISTANCES } from '../src/engine/rules.js';
import { jaccard } from '../src/engine/core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { move: 'Move', edge: 'Edge', guard: 'Guard', compel: 'Compel', status: 'Status' };
const ROLL_TARGETS = ['delve', 'clue', 'npc', 'clock', 'ally'];

/** A full-size card button. `extra` is the per-type line (memory text, inclination, here/not here). */
export function cardHtml(k, { pressed = false, disabled = false, warn = false, attr = '' } = {}) {
  const bonus = k.bonus ? `+${k.bonus}` : k.kind === 'status' ? '—' : k.kind === 'guard' || k.kind === 'compel' ? 'free' : '';
  let extra = '';
  if (k.type === 'memory') extra = `“${esc(k.memoryText)}”${k.invokedThisScene ? ' <b>(already invoked this scene)</b>' : ''}`;
  if (k.type === 'drive' && k.disposition) extra = `Your inclination: ${esc(k.disposition)}`;
  if (k.type === 'domain' && k.here !== undefined) extra = k.here ? '<b class="ok">✓ helps here</b>' : '<b class="no">✗ not here</b>';
  return `<button type="button" class="card-k kind-${k.kind} t-${k.type}${warn ? ' warn' : ''}" aria-pressed="${pressed}" ${disabled ? 'disabled' : ''} ${attr} title="${esc(k.text)}">
    <span class="ck-top"><span>${esc(k.type === 'knack' ? 'Knack' : k.type === 'flaw' ? 'Flaw' : k.type === 'drive' ? 'Drive' : KIND[k.kind] ?? k.kind)}</span><span class="ck-bonus">${esc(bonus)}</span></span>
    <span class="ck-name">${esc(k.name)}</span><span class="ck-text">${esc(k.text)}</span>${extra ? `<span class="ck-extra">${extra}</span>` : ''}</button>`;
}

function head(req, title) {
  const y = req.view.you;
  const bars = RESISTANCES.map((r) => `<span class="st"><i><b style="height:${Math.min(100, (y.stress[r] / 10) * 100)}%"></b></i>${r[0].toUpperCase()}${y.stress[r]}</span>`).join('');
  const d = y.deck;
  return `<div class="seat-head"><div class="sigil">${sigil(y.look, 40, y.id)}</div>
    <div style="min-width:0"><div class="k">${esc(title)}${req.view.scene ? ` · ${esc(req.view.scene.title)}` : ''}</div><h3>${esc(y.name)}</h3></div>
    ${d ? `<span class="chip mono" title="hand size grows with your Horizon">hand ${d.hand.length}/${d.handSize} · draw ${d.drawPile} · discard ${d.discardPile}</span>` : ''}</div>
    <div class="seat-status"><span class="stress">${bars}</span><span class="cone" title="Light cone: reach ${y.cone.reach}, horizon ${y.cone.horizon}">${coneGlyph(y.cone)} R${y.cone.reach} H${y.cone.horizon}</span>
    ${req.view.cohesion ? `<span class="pill">cohesion ${req.view.cohesion}</span>` : ''}${(y.conditions ?? []).map((c) => `<span class="pill bad">${esc(c)}</span>`).join('')}</div>
    <div class="catchup" hidden><span></span> <button type="button" class="btn" data-skip>Skip to now</button></div>`;
}

export function mountSeat(host, req, { onSubmit, onSkip }) {
  const el = document.createElement('div'); // fresh per request, so listeners never stack
  el.className = 'seat-body';
  host.replaceChildren(el);
  let sent = false;
  const done = (reply) => { if (sent) return; sent = true; el.querySelectorAll('button, input, textarea, select').forEach((x) => (x.disabled = true)); onSubmit(reply); };
  const R = { intro: mountIntro, act: mountAct, fallout: mountFallout, epilogue: mountEpilogue }[req.kind];
  R(el, req, done);
  el.querySelector('[data-skip]')?.addEventListener('click', onSkip);
  return el;
}

// ------------------------------------------------------------------ act

function mountAct(el, req, done) {
  const v = req.view, y = v.you, d = y.deck;
  const hand = d.hand;
  const firstRoll = req.targets.find((t) => ROLL_TARGETS.includes(t.target.split(':')[0]))?.target ?? 'none';
  const haunts = v.location?.haunts ?? [];
  const landmark = v.location?.isDelve === false && haunts.length && !y.restedThisScene;
  const theorizable = !v.theory && v.clues.length >= 2;
  const removable = d.cards.filter((k) => k.removable);
  const s = {
    play: new Set(), target: firstRoll, skill: y.skills[0] ?? 'Signal', say: '', do: '', intent: '', retell: '', retellFor: null,
    guard: v.allies[0]?.id ?? '', restOn: false, haunt: haunts[0]?.id ?? '', restMem: y.memories.at(-1)?.id ?? '', remove: '',
    theorize: false, theory: '', clues: new Set(v.clues.map((c) => c.id)), draft: null,
  };
  const card = (uid) => hand.find((k) => k.uid === uid);
  const sel = () => [...s.play].map(card).filter(Boolean);
  const memSel = () => sel().find((k) => k.type === 'memory');
  const moveSel = () => sel().find((k) => k.kind === 'move');
  const guardSel = () => sel().find((k) => k.kind === 'guard');
  const opts = (list, cur) => list.map(([val, label]) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const memOpts = opts(y.memories.map((m) => [m.id, `${m.id} · ${m.text.slice(0, 60)}`]), s.restMem);
  const removeOpts = `<option value="">keep every card</option>${opts(removable.map((k) => [k.uid, `${k.name} (${k.type}, ${k.zone})`]), '')}`;

  el.innerHTML = `${head(req, 'Your turn')}
    ${d.offer ? `<div class="offer"><div class="k">Reward · ${esc(d.offer.why)} — add one card to your deck</div>
      <div class="hand-grid">${d.offer.cards.map((k) => cardHtml(k, { attr: `data-offer="${esc(k.offerId)}"` })).join('')}</div>
      <p class="note">Drafted cards are shuffled into your draw pile. Choose none to keep your deck lean.${d.offer.queued ? ` ${d.offer.queued} more reward${d.offer.queued > 1 ? 's wait' : ' waits'} for your next turn.` : ''}</p></div>` : ''}
    <div data-when="!theorize"><div class="k">Your hand · <span data-edges></span></div>
      <div class="hand-grid" data-hand></div>
      <p class="note" data-when="improvise">No Move card chosen: you improvise. <label class="inline">Skill <select data-f="skill">${opts(SKILLS.map((x) => [x, x]), s.skill)}</select></label> base die only.</p>
      <div class="k">Target</div><div class="targets">${req.targets.map((t) => `<button type="button" class="tchip" data-target="${esc(t.target)}" aria-pressed="${t.target === s.target}" title="${esc(t.what)}"><b>${esc(t.target)}</b><span>${esc(t.what)}</span></button>`).join('')}</div>
    </div>
    <label data-when="memory">Retell the memory with a new emphasis <span class="drift" data-drift></span><textarea data-f="retell" rows="3"></textarea></label>
    <label data-when="guard">Guard whom (until your next turn you take half their stress)<select data-f="guard">${opts(v.allies.map((a) => [a.id, a.name]), s.guard)}</select></label>
    <div data-when="fullrest" class="seat-row"><label>Spend which memory<select data-f="restMem">${memOpts}</select></label><label>Set down a card<select data-f="remove">${removeOpts}</select></label></div>
    ${landmark ? `<div data-when="restable"><label class="inline"><input type="checkbox" data-f="restOn"> Also rest at a haunt (free, once per scene): spend a memory, clear stress, gain Resolve, set down a card</label>
      <div data-when="reston" class="seat-row"><label>Haunt<select data-f="haunt">${opts(haunts.map((h) => [h.id, `${h.name} · ${h.resistance} d${h.die}`]), s.haunt)}</select></label><label>Spend memory<select data-f="restMem">${memOpts}</select></label><label>Set down<select data-f="remove">${removeOpts}</select></label></div></div>` : ''}
    ${theorizable ? `<div><label class="inline"><input type="checkbox" data-f="theorize"> Theorize instead: name what is ingressing (2d6 + clues it explains − ${4})</label>
      <div data-when="theorize" class="form"><textarea data-f="theory" rows="2" placeholder="What is pouring through the Aperture, and what does it want a body for?"></textarea>
      <div class="clues">${v.clues.map((c) => `<label class="inline"><input type="checkbox" data-clue="${esc(c.id)}" checked> <b>${esc(c.id)}</b> ${esc(c.text)}</label>`).join('')}</div></div></div>` : ''}
    <div class="seat-row"><label>Say (in character)<input data-f="say" maxlength="200" placeholder="${esc(y.voice ?? '')}"></label><label>Do<input data-f="do" maxlength="200" placeholder="what you attempt"></label></div>
    <label>Private intent (spectators see it backstage)<input data-f="intent" maxlength="200"></label>
    <div class="preview" data-preview aria-live="polite"></div>
    <div class="row"><button type="button" class="btn primary" data-go>Play</button></div>`;

  const intentOf = () => {
    const t = s.theorize ? 'none' : s.target;
    const full = t.startsWith('haunt:');
    const m = memSel();
    const out = {
      intent: s.intent, say: s.say, do: s.do, target: t,
      play: s.theorize || full ? [] : [...s.play],
      skill: moveSel() ? null : s.skill,
      memory: full ? { id: s.restMem } : m ? { id: m.memory, reinterpretation: s.retell || m.memoryText } : null,
      guard: guardSel() && !s.theorize ? s.guard : null,
      theorize: s.theorize ? { theory: s.theory, clues: [...s.clues] } : null,
      rest: !full && s.restOn ? { haunt: s.haunt, memory: s.restMem, remove: s.remove || null } : null,
      remove: full ? s.remove || null : undefined,
      draft: s.draft,
    };
    if (!s.theorize && !out.do && !out.say && t !== 'none') out.do = moveSel() ? `${moveSel().skill.toLowerCase()}` : 'try';
    return out;
  };

  const refresh = () => {
    const p = req.preview(intentOf()) ?? {};
    const pd = p.deck ?? {};
    const allowed = pd.allowed ?? d.edgesAllowed;
    const edgesChosen = sel().filter((k) => k.kind === 'edge').length;
    el.querySelector('[data-edges]').textContent = `${hand.length} cards · Move: ${moveSel() ? moveSel().name : 'none'} · Edges ${edgesChosen}/${allowed}`;
    el.querySelector('[data-hand]').innerHTML = hand.map((k) => {
      const on = s.play.has(k.uid);
      const full = !on && k.kind === 'edge' && edgesChosen >= allowed && k.type !== 'memory' && !(k.focus < 0); // a slot-costing flaw frees its own slot
      return cardHtml(k, { pressed: on, disabled: !k.playable || full, warn: on && pd.dropped?.includes(k.uid), attr: `data-card="${esc(k.uid)}"` });
    }).join('');
    const when = {
      theorize: s.theorize, '!theorize': !s.theorize, memory: !!memSel() && !s.theorize && !s.target.startsWith('haunt:'), guard: !!guardSel() && !s.theorize,
      improvise: !s.theorize && !moveSel() && !!p.needsRoll && p.kind === 'act', fullrest: s.target.startsWith('haunt:') && !s.theorize,
      restable: !s.target.startsWith('haunt:'), reston: s.restOn && !s.target.startsWith('haunt:'),
    };
    el.querySelectorAll('[data-when]').forEach((x) => (x.hidden = !when[x.dataset.when]));
    const m = memSel();
    if (m && s.retellFor !== m.uid) { s.retellFor = m.uid; s.retell = m.memoryText; el.querySelector('[data-f=retell]').value = s.retell; }
    el.querySelector('[data-drift]').textContent = m ? `drift ${Math.round((1 - jaccard(m.memoryText, s.retell)) * 100)}%` : '';
    el.querySelectorAll('[data-target]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.target === s.target)));
    el.querySelectorAll('[data-offer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.offer === s.draft)));
    const dice = p.kind === 'act' && p.needsRoll
      ? `<span class="pv-pool">${p.pool}d10</span> <span class="mono">${esc((p.poolParts ?? []).join(' + '))}</span>${p.difficulty !== 'standard' ? ` <span class="pill">${esc(p.difficulty)}: drop ${p.difficulty === 'risky' ? 1 : 2}</span>` : ''} <span class="note">· the GM sets position and effect before the dice</span>`
      : p.kind === 'theorize' ? '<span class="pv-pool">2d6</span> <span class="mono">+ accepted clues − complexity · 7+ makes it canon</span>'
      : p.kind === 'rest' ? '<span class="pv-pool">Rest</span> <span class="note">spend a memory, clear stress, gain Resolve</span>'
      : '<span class="pv-pool">No roll</span> <span class="note">talk: the world answers, nothing is at stake</span>';
    el.querySelector('[data-preview]').innerHTML = `<div>${dice}</div>${(p.issues ?? []).length ? `<ul class="issues">${p.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}`;
    el.querySelector('[data-go]').textContent = p.kind === 'act' && p.needsRoll ? `Roll ${p.pool}d10` : p.kind === 'theorize' ? 'Theorize' : p.kind === 'rest' ? 'Rest' : 'Speak';
  };

  el.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-card]');
    if (c && !c.disabled) {
      const k = card(c.dataset.card);
      if (s.play.has(k.uid)) s.play.delete(k.uid);
      else { if (k.kind === 'move') for (const x of sel()) if (x.kind === 'move') s.play.delete(x.uid); s.play.add(k.uid); }
      refresh();
      el.querySelector(`[data-card="${CSS.escape(k.uid)}"]`)?.focus();
      return;
    }
    const t = ev.target.closest('[data-target]');
    if (t) { s.target = t.dataset.target; refresh(); return; }
    const o = ev.target.closest('[data-offer]');
    if (o) { s.draft = s.draft === o.dataset.offer ? null : o.dataset.offer; refresh(); return; }
    if (ev.target.closest('[data-go]')) done(intentOf());
  });
  el.addEventListener('input', (ev) => {
    const f = ev.target.dataset.f;
    if (f) {
      if (ev.target.type === 'checkbox') s[f] = ev.target.checked; else s[f] = ev.target.value;
      if (f === 'restMem') el.querySelectorAll('[data-f=restMem]').forEach((x) => (x.value = s.restMem));
      if (f === 'remove') el.querySelectorAll('[data-f=remove]').forEach((x) => (x.value = s.remove));
    }
    if (ev.target.dataset.clue) { if (ev.target.checked) s.clues.add(ev.target.dataset.clue); else s.clues.delete(ev.target.dataset.clue); }
    refresh();
  });
  refresh();
}

// ------------------------------------------------------------------ intro · fallout · epilogue

function mountIntro(el, req, done) {
  const y = req.view.you, cal = req.calling;
  const beats = cal.beats.filter((b) => b.tier !== 'zenith');
  const chosen = new Set(beats.slice(0, 2).map((b) => b.id));
  const deck = y.deck?.cards ?? [];
  el.innerHTML = `${head(req, 'You join the table')}
    <p class="note">${esc(y.pitch)}</p>
    <div class="k">Calling · ${esc(cal.name)}</div><p>${esc(cal.blurb)}</p>
    <div class="k">Choose two beats: the GM must open doors for them; hitting one earns a card</div>
    <div class="hand-grid">${beats.map((b) => `<button type="button" class="card-k kind-${b.tier === 'major' ? 'move' : 'edge'}" data-beat="${esc(b.id)}" aria-pressed="${chosen.has(b.id)}"><span class="ck-top"><span>${esc(b.tier)} beat</span><span class="ck-bonus">${b.tier === 'major' ? 'cone + draft' : 'Resolve'}</span></span><span class="ck-text">${esc(b.text)}</span></button>`).join('')}</div>
    <label>Introduce yourself to the audience (two sentences, in your voice)<textarea data-f="text" rows="3" placeholder="${esc(y.voice ?? '')}"></textarea></label>
    <label>What you privately hope happens to you tonight (backstage)<input data-f="intent"></label>
    ${deck.length ? `<details class="deck-list"><summary class="k">Your deck · ${deck.length} cards (it is who you are)</summary><div class="minis">${deck.map((k) => `<span class="mini kind-${k.kind} t-${k.type}"><span class="n">${esc(k.name)}</span></span>`).join('')}</div></details>` : ''}
    <div class="row"><button type="button" class="btn primary" data-go>Take your seat</button></div>`;
  const sync = () => el.querySelectorAll('[data-beat]').forEach((b) => b.setAttribute('aria-pressed', String(chosen.has(b.dataset.beat))));
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-beat]');
    if (b) { const id = b.dataset.beat; if (chosen.has(id)) chosen.delete(id); else { if (chosen.size >= 2) chosen.delete([...chosen][0]); chosen.add(id); } sync(); return; }
    if (ev.target.closest('[data-go]')) {
      const val = (f) => el.querySelector(`[data-f=${f}]`).value.trim();
      done({ text: val('text') || y.pitch, beats: [...chosen], intent: val('intent') || 'Find out what I am for.' });
    }
  });
}

function mountFallout(el, req, done) {
  const y = req.view.you, rewrite = req.need.type === 'memory_rewrite';
  let pick = y.memories[0]?.id;
  el.innerHTML = `${head(req, rewrite ? 'Fallout · Confabulation' : 'Fallout · Erasure')}
    <p>${rewrite ? 'A memory rewrites itself to fit what just happened. Choose which, and write it as you now remember it.' : 'A memory is taken. You choose which; its card leaves your deck and a Gap takes its place.'}</p>
    <div class="hand-grid">${y.memories.map((m) => `<button type="button" class="card-k kind-edge t-memory" data-mem="${esc(m.id)}" aria-pressed="${m.id === pick}"><span class="ck-top"><span>Memory</span><span class="ck-bonus">${esc(m.id)}</span></span><span class="ck-text">${esc(m.text)}</span></button>`).join('')}</div>
    <label>${rewrite ? 'As you now remember it' : 'What you say as it goes'}<textarea data-f="text" rows="2"></textarea></label>
    <div class="row"><button type="button" class="btn primary" data-go>${rewrite ? 'Rewrite' : 'Let it go'}</button></div>`;
  const ta = el.querySelector('[data-f=text]');
  if (rewrite) ta.value = y.memories[0]?.text ?? '';
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mem]');
    if (b) { pick = b.dataset.mem; el.querySelectorAll('[data-mem]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mem === pick))); if (rewrite) ta.value = y.memories.find((m) => m.id === pick)?.text ?? ''; return; }
    if (ev.target.closest('[data-go]')) done(rewrite ? { memory: pick, rewritten: ta.value.trim() || '…' } : { memory: pick, last_words: ta.value.trim() || 'I will know it by the gap.' });
  });
}

function mountEpilogue(el, req, done) {
  el.innerHTML = `${head(req, 'Afterimage')}
    <label>Your last line to the audience<textarea data-f="text" rows="2"></textarea></label>
    <label>One memory you keep from tonight (it becomes a card)<input data-f="memory"></label>
    <div class="row"><button type="button" class="btn primary" data-go>End</button></div>`;
  el.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-go]')) return;
    const val = (f) => el.querySelector(`[data-f=${f}]`).value.trim();
    done({ text: val('text') || '…', memory: val('memory') || 'We went down to the Aperture and came back.' });
  });
}

/** What to answer if the operator stops the run while a human request is open. */
export function defaultReply(req) {
  if (req.kind === 'intro') return { text: req.view.you.pitch, beats: req.calling.beats.filter((b) => b.tier !== 'zenith').slice(0, 2).map((b) => b.id) };
  if (req.kind === 'fallout') return { memory: req.view.you.memories[0]?.id, rewritten: '…', last_words: '…' };
  if (req.kind === 'epilogue') return { text: '…' };
  return { say: '', target: 'none' };
}
