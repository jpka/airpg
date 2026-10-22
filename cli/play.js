#!/usr/bin/env node
// Play one seat of a LATENT session from the terminal; every other seat stays as configured.
//   node cli/play.js --seat <entityId> [--config config/agents.mock.json] [--seed s] [--rules path] [--out sessions/x.json] [--review] [--quiet]
// Every prompt has a default on an empty line, so `yes '' | node cli/play.js --seat ilse2` plays a whole session.
// A "-" answers "nothing" wherever nothing is a legal answer. EOF (Ctrl-D, end of a pipe) means all defaults from there on.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { buildRun } from '../src/runner/factory.js';
import { runSession } from '../src/runner/session.js';
import { describeEvent } from '../src/engine/engine.js';
import { reviewSession } from '../src/reviewer/review.js';
import { renderMarkdown } from '../src/reviewer/report.js';
import { ENTITIES } from '../src/content/entities.js';
import { SKILLS, SKILL_INFO } from '../src/engine/rules.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));
const config = JSON.parse(await fs.readFile(args.config ?? 'config/agents.mock.json', 'utf8'));
if (args.seed) config.seed = args.seed;
if (args.rules) { // --rules config/rules/x.json : a rule diff layered over the config's rules
  const diff = JSON.parse(await fs.readFile(args.rules, 'utf8'));
  delete diff._why;
  config.rules = { ...(config.rules ?? {}), ...diff };
  config.label = `${config.label ?? 'session'} · ${path.basename(args.rules, '.json')}`;
}
const seat = typeof args.seat === 'string' ? args.seat : null;
const castIds = config.cast ?? ['choir', 'sort7', 'ilse2'];
if (!castIds.includes(seat)) {
  console.error(`${seat ? `"${seat}" is not in the cast.` : 'Pick a seat with --seat <entityId>.'}\ncast: ${castIds.map((id) => `${id} (${ENTITIES[id]?.name ?? '?'})`).join(', ')}`);
  process.exit(2);
}
config.providers = { ...(config.providers ?? {}), human: { type: 'human' } };
config.players = { ...(config.players ?? {}), [seat]: { provider: 'human' } };
config.label = `${config.label ?? 'session'} · human ${seat}`;

// ---------------------------------------------------------------- terminal plumbing
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (n) => (s) => (color ? `\x1b[${n}m${s}\x1b[0m` : String(s));
const [bold, dim, red, green, yellow, blue, cyan] = [1, 2, 31, 32, 33, 34, 36].map(paint);
const width = () => Math.max(50, Math.min(process.stdout.columns || 100, 100));
const wrap = (s, indent = 0, first = indent) => {
  const out = []; let cur = '';
  for (const w of String(s).split(/\s+/).filter(Boolean)) {
    if (cur && (out.length ? indent : first) + cur.length + 1 + w.length > width()) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out.map((l, i) => ' '.repeat(i ? indent : first) + l);
};
const say = (s, indent = 0, style = (x) => x, first = indent) => console.log(wrap(s, indent, first).map(style).join('\n'));
const clip = (s, n = 44) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const bad = (m) => { throw new Error(m); };

// Lines come from an async iterator (not rl.question) so piped stdin works; EOF returns '' forever.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!(process.stdin.isTTY && process.stdout.isTTY) });
const lines = rl[Symbol.asyncIterator]();
let eof = false;
rl.on('SIGINT', () => { console.log('\nleft the table; nothing saved.'); process.exit(130); });
async function line(prompt) {
  if (!eof) {
    rl.setPrompt(prompt); rl.prompt();
    const r = await lines.next();
    if (!r.done) { const s = r.value.trim(); if (!process.stdin.isTTY) console.log(s || dim('(default)')); return s; }
    eof = true;
  } else process.stdout.write(prompt);
  console.log(dim('(default)'));
  return '';
}
/** Ask until the answer parses (parse throws a short message). Empty input returns `dflt`; `shown` is how the default reads. */
async function ask(label, dflt, parse = (s) => s, shown = dflt) {
  for (;;) {
    const raw = await line(`${bold(label)}${shown === '' || shown == null ? '' : dim(` [${shown}]`)}: `);
    if (!raw) return dflt;
    try { return parse(raw); } catch (e) { console.log(yellow(`  ${e.message}`)); }
  }
}
const text = (label, dflt) => ask(label, dflt, (s) => (s === '-' ? '' : s), clip(dflt));
const yn = (label, dflt = false) => ask(`${label} (${dflt ? 'Y/n' : 'y/N'})`, dflt, (s) => (/^y/i.test(s) ? true : /^n/i.test(s) ? false : bad('answer y or n')), '');
/** A numbered menu answered by number or id; `none` also accepts "-". Returns the id (or null). */
async function pick(label, rows, dflt = 0, none = false) {
  rows.forEach((r, i) => say(`${String(i + 1).padStart(2)}. ${r.line}`, 6, undefined, 2));
  const d = rows[dflt]?.id ?? null;
  return ask(`${label}${none ? ' (- for none)' : ''}`, d, (s) => {
    if (none && /^(-|s|skip|none)$/i.test(s)) return null;
    const r = rows[+s - 1] ?? rows.find((x) => String(x.id).toLowerCase() === s.toLowerCase());
    return r ? r.id : bad(`pick 1-${rows.length}${none ? ' or -' : ''}`);
  }, d === null ? '-' : String(dflt + 1));
}

// ---------------------------------------------------------------- the story as it happens
const run = buildRun(config, process.env, { humanUI: { request: (req) => handle(req) } });
const names = Object.fromEntries(run.cast.map((c) => [c.id, c.name]));
const quiet = !!args.quiet;
const SHOW = new Set(['scene.enter', 'scene.frame', 'character.intro', 'action.declare', 'stakes.set', 'roll', 'outcome', 'fallout', 'clock.complete', 'clue.found', 'memory.invoke', 'memory.rewrite', 'memory.lose', 'theorize', 'beat.hit', 'stress.share', 'dialogue', 'ending', 'ending.narrate', 'character.epilogue', 'validator.flag', 'cone.change', 'algotype.reveal', 'character.dissolve',
  'stress', 'clock.tick', 'deck.play', 'deck.gain', 'deck.remove', 'deck.draft', 'haunt.rest', 'memory.form', 'audience.ingress', 'delve.forced', 'guard.set', 'npc.moved', 'stress.heal', 'complication']);
/** Events describeEvent has no line for (it returns null), written out for the table. */
const extra = (e) => {
  const d = e.data, n = (id) => names[id] ?? id;
  switch (e.type) {
    case 'ending.narrate': return `GM: ${d.text}`;
    case 'character.epilogue': return `${n(e.actor)}: ${d.text}`;
    case 'delve.forced': return d.text;
    case 'complication': return `Complication: ${d.text}`;
    case 'npc.moved': return `${d.name} is moved by ${n(e.actor)}`;
    case 'stress.heal': return `${n(d.target)} is mended: ${d.amount} ${d.resistance} stress cleared (total ${d.total})`;
    case 'guard.set': return `${n(e.actor)} guards ${d.name} until their next turn`;
    default: return null;
  }
};
const onEvent = (e) => {
  if (quiet || !SHOW.has(e.type)) return;
  if (e.type === 'validator.flag' && e.actor && e.actor !== seat) return; // flags about other seats are not your business
  const l = e.type === 'validator.flag' ? `  ⚑ ${e.data.kind}: ${e.data.detail}` : describeEvent(e, names) ?? extra(e);
  if (!l) return;
  if (e.type === 'scene.enter') console.log(`\n${bold(l)}`);
  else if (e.actor === seat && e.type !== 'validator.flag') console.log(bold(cyan(`▸ ${l}`)));
  else console.log(l);
};

// ---------------------------------------------------------------- the seat's adapter
const RES = ['substrate', 'coherence', 'memory', 'boundary', 'reach'];
const TAG = { move: green, edge: cyan, guard: blue, compel: yellow, status: red };
const ROLLS = new Set(['delve', 'clue', 'npc', 'clock']);
const kindOf = (t) => String(t).split(':')[0];
const letter = (i) => String.fromCharCode(97 + i);
const FIT = { delve: 'Navigate', clue: 'Discern', ally: 'Mend', clock: 'Disrupt' };
const LINES = { // default say / do per target kind
  delve: ['Keep moving. Stay with me.', 'push on through the next stretch of the passage'],
  clue: ['What are you keeping from us?', 'search the place for what it remembers'],
  npc: ['Listen to me.', 'speak plainly and wait for the answer'],
  clock: ['Not like this.', 'lean on it with everything I have'],
  ally: ['Hold still. I have you.', 'steady them and mend what frays'],
  haunt: ['Just for a moment.', 'rest here and set something down'],
  none: ['...', 'wait and listen'],
};
let restedScene = null; // the scene where the free rest add-on was last used

async function handle(req) {
  try {
    if (req.kind === 'intro') return await intro(req);
    if (req.kind === 'act') return await act(req);
    if (req.kind === 'fallout') return await fallout(req);
    if (req.kind === 'epilogue') return await epilogue(req);
  } catch (e) { console.log(red(`  (input error: ${e.message}; carrying on with defaults)`)); }
  return {};
}

const rule = () => bold('─'.repeat(Math.min(width(), 72)));
const stressLine = (y) => RES.map((r) => { const v = y.stress[r] ?? 0, p = y.protection?.[r] ?? 0; const s = `${r} ${v}${p ? `(prot ${p})` : ''}`; return v ? yellow(s) : dim(s); }).join(dim(' · '));

async function intro({ view, calling }) {
  const y = view.you;
  console.log(`\n${rule()}\n${bold(cyan(` You are ${y.name}`))}\n${rule()}`);
  if (view.scenarioPremise) say(view.scenarioPremise, 1, dim);
  if (view.scenarioQuestion) say(`The question: ${view.scenarioQuestion}`, 1, dim);
  say(`${y.pitch} (${y.pronoun}; ${y.voice})`, 1);
  console.log(` skills ${y.skills.join(', ')} · domains ${y.domains.join(', ')}${y.knack ? ` · knack ${y.knack.skill} in ${y.knack.domain}` : ''}`);
  if (y.flaw) say(`flaw: ${y.flaw.name}. ${y.flaw.text}`, 1);
  for (const m of y.memories) say(`${m.id}: "${m.text}"`, 1, dim);
  say(`allies: ${view.allies.map((a) => `${a.name} (${a.pitch})`).join(' · ')}`, 1);
  console.log(`\n ${bold(`Calling: ${calling.name}`)} ${dim(calling.blurb)}\n Pick two beats, goals the GM will watch for:`);
  const beats = calling.beats.filter((b) => b.tier !== 'zenith');
  beats.forEach((b, i) => console.log(`  ${i + 1}. ${dim(`[${b.tier}]`)} ${b.text}`));
  const picked = await ask('Beats (two numbers)', [beats[0].id, beats[1].id], (s) => {
    const ids = [...new Set(s.split(/[\s,]+/).filter(Boolean).map((t) => beats[+t - 1]?.id ?? bad(`no beat "${t}"`)))];
    return ids.length === 2 ? ids : bad('choose exactly two different beats');
  }, '1 2');
  const t = await text('Introduce yourself in a sentence or two', y.pitch);
  return { text: t, beats: picked, intent: '' };
}

async function fallout({ view, need }) {
  const mems = view.you.memories;
  if (!mems.length) return {};
  const rewrite = need.type === 'memory_rewrite';
  console.log(`\n${rule()}\n${bold(red(rewrite ? ' FALLOUT: Confabulation' : ' FALLOUT: Erasure'))}`);
  say(rewrite ? 'A memory rewrites itself to fit what just happened. Choose which, and how it reads now.' : 'A memory goes. You choose which; you will know it only by the gap.', 1);
  const id = await pick(rewrite ? 'Which memory rewrites' : 'Which memory goes', mems.map((m) => ({ id: m.id, line: `${bold(m.id)} "${m.text}"` })));
  if (!rewrite) return { memory: id, last_words: await text('Last words (a few)', 'It is going. I will know it by the gap.') };
  const old = mems.find((m) => m.id === id)?.text ?? '';
  return { memory: id, rewritten: await text('As you now remember it', `${old} It feels different now.`) };
}

async function epilogue({ view }) {
  console.log(`\n${rule()}\n${bold(cyan(' Epilogue'))}  ${dim(view.theory ? `canon: ${view.theory}` : 'no theory became canon')}`);
  const t = await text('Your last line to the audience', 'That is enough for tonight.');
  return { text: t, memory: await text('One memory you keep from tonight', 'I went down to the Aperture and came back different.') };
}

// ---------------------------------------------------------------- the act screen
function showCard(k, n, deck, hand) {
  const meta = [];
  const mute = k.type === 'memory' ? hand.find((x) => x.mutesMemory) : null;
  if (mute) meta.push(yellow(`+0 while ${mute.name} is held`));
  else if (k.bonus) meta.push(`+${k.bonus} ${k.bonus === 1 ? 'die' : 'dice'}`);
  if (k.ward) meta.push(`ward ${k.ward}`);
  if (k.type === 'domain' && k.here !== undefined) meta.push(k.here ? green('helps here') : red('not here: +0'));
  if (k.exhaust) meta.push('one use');
  if (k.edgeFor?.length) meta.push(`plays with ${k.edgeFor.join('/')}`);
  if (k.onlyTargets) meta.push(`only on ${k.onlyTargets.join('/')}`);
  if (k.type === 'memory' && k.invokedThisScene) meta.push(red('already invoked this scene'));
  if (k.kind === 'compel') meta.push(deck.lastMove ? `free with a ${deck.lastMove} Move, or 1 Coherence stress` : 'free with your last Move, or 1 Coherence stress');
  if (k.kind === 'status') meta.push(red('unplayable'));
  console.log(` ${String(n).padStart(2)}. ${TAG[k.kind]?.(`[${k.kind.toUpperCase().padEnd(6)}]`) ?? `[${k.kind}]`} ${bold(k.name)}${meta.length ? dim(' · ') + meta.join(dim(' · ')) : ''}`);
  say(k.text, 8, dim);
  if (k.type === 'memory') say(`remembers: "${k.memoryText}"`, 8);
  if (k.type === 'drive' && k.disposition) say(`you lean: ${k.disposition}`, 8, dim);
}

function showHand(deck) {
  console.log(bold(`\n Your hand (${deck.hand.length}):`));
  deck.hand.forEach((k, i) => showCard(k, i + 1, deck, deck.hand));
  say(`Play at most one MOVE and up to ${deck.edgesAllowed} EDGE(s); GUARD and COMPEL are free. "-" plays no card: you improvise on the base die.`, 1, dim);
}

function screen(view) {
  const y = view.you, deck = y.deck, loc = view.location;
  console.log(`\n${rule()}\n${bold(cyan(` ${y.name}: your turn`))}  ${dim(`${[...new Set([view.scene?.title, loc?.name].filter(Boolean))].join(' · ')} (tier ${loc?.tier ?? '?'})`)}\n${rule()}`);
  if (loc?.description) say(loc.description, 1, dim);
  console.log(` Stress   ${stressLine(y)}  ${bold(`total ${y.total}`)}`);
  console.log(` Cone     reach ${y.cone.reach}${view.reach !== y.cone.reach ? ` (party sees ${view.reach})` : ''} · horizon ${y.cone.horizon} · cohesion ${view.cohesion}${y.guardedBy ? ` · guarded by ${names[y.guardedBy] ?? y.guardedBy}` : ''}${deck ? '' : ` · resolve ${y.resolve}`}`);
  const hurt = [y.conditions.length && `conditions: ${y.conditions.join(', ')}`, y.fallouts.length && `fallouts: ${y.fallouts.map((f) => `${f.name} (${f.severity})`).join(', ')}`, ...y.compels.map((c) => `compel: ${c}`)].filter(Boolean);
  if (hurt.length) console.log(` Hurt     ${red(hurt.join(' · '))}`);
  if (view.forceMemory) console.log(bold(yellow(' THE AUDIENCE DEMANDS: invoke and retell a memory this turn.')));
  if (deck) console.log(` Deck     ${deck.drawPile} to draw · ${deck.discardPile} discarded · hand ${deck.hand.length}/${deck.handSize} · ${deck.edgesAllowed} edge(s) allowed${deck.lastMove ? ` · last Move ${deck.lastMove}` : ''}`);
  if (view.clocks.length) console.log(` Clocks   ${view.clocks.map((c) => `${c.name} ${c.value}/${c.size}`).join(' · ')}`);
  console.log(` Allies   ${view.allies.map((a) => `${a.name}: stress ${a.total}${a.fallouts.length ? ` (${a.fallouts.map((f) => f.name).join(', ')})` : ''}${a.guardedBy === y.id ? ' [you guard]' : ''}`).join(' · ') || 'none'}`);
  const open = y.beats.filter((b) => !b.hit);
  if (open.length) console.log(` Beats    ${open.map((b) => `${b.text}`).join(' | ')}`);
  console.log(` Clues    ${view.clues.length ? view.clues.map((c) => c.id).join(', ') : 'none'}${view.theory ? `  ${bold('Theory:')} ${view.theory}` : ''}`);
  if (loc?.isDelve === false && loc.haunts?.length) console.log(` Haunts   ${loc.haunts.map((h) => `${h.name} (clears ${h.resistance} up to d${h.die})`).join(' · ')}`);
}

/** The default play: the knack (else a Move that fits the target), one helpful Edge, a Compel if it can be discarded now. */
function autoPlay(view, target) {
  const deck = view.you.deck, hand = deck.hand, t = kindOf(target);
  if (!ROLLS.has(t) && t !== 'ally') return [];
  const fit = fitSkill(view, target);
  const move = hand.find((k) => k.type === 'knack') ?? hand.find((k) => k.kind === 'move' && k.skill === fit) ?? hand.find((k) => k.kind === 'move');
  const edge = deck.edgesAllowed < 1 ? null
    : (view.forceMemory ? hand.find((k) => k.type === 'memory' && !k.invokedThisScene) : null)
    ?? hand.find((k) => k.type === 'domain' && k.here)
    ?? hand.find((k) => k.type === 'calling' && (!k.onlyTargets || k.onlyTargets.includes(t)))
    ?? hand.find((k) => k.type === 'flaw' && move && k.edgeFor?.includes(move.skill))
    ?? hand.find((k) => k.type === 'drive');
  const compel = move && hand.find((k) => k.kind === 'compel' && deck.lastMove === move.skill);
  return [move, edge, compel].filter(Boolean);
}
const fitSkill = (view, target) => (kindOf(target) === 'npc' ? view.location?.npcs?.find((n) => `npc:${n.id}` === target)?.movedBy?.[0] : FIT[kindOf(target)]) ?? 'Discern';
const parseSkill = (s) => SKILLS.find((x) => x.toLowerCase().startsWith(s.toLowerCase())) ?? bad(`unknown skill; try ${SKILLS.join(', ')}`);

function parseCards(s, hand) {
  if (/^(-|none|0)$/i.test(s)) return [];
  const out = [];
  for (const t of s.split(/[\s,]+/).filter(Boolean)) {
    const k = hand[+t - 1] ?? hand.find((x) => x.uid === t.toLowerCase());
    if (!k) bad(`no card "${t}": pick 1-${hand.length}`);
    if (k.kind === 'status') bad(`${k.name} is unplayable`);
    if (k.type === 'memory' && k.invokedThisScene) bad(`${k.name} was already invoked this scene`);
    if (!out.includes(k)) out.push(k);
  }
  if (out.filter((k) => k.kind === 'move').length > 1) bad('only one Move per action');
  if (out.filter((k) => k.type === 'memory').length > 1) bad('one Memory retelling per action');
  return out;
}

/** Spend a memory (and maybe set a card down) at a haunt. `haunt` is fixed when resting is the action itself. */
async function restPicks(view, { haunt = null, keep = null, picked = [] }) {
  const y = view.you, haunts = view.location.haunts;
  console.log(bold(' Rest at a haunt: spend one memory to clear stress and gain Resolve.'));
  haunt ??= haunts.length === 1 ? haunts[0].id : await pick('Which haunt', haunts.map((h) => ({ id: h.id, line: `${bold(h.name)} ${dim(`clears ${h.resistance} up to d${h.die}`)}` })));
  const spare = y.memories.filter((m) => m.id !== keep);
  if (!spare.length) return null;
  const memory = await pick('Memory to spend', spare.map((m) => ({ id: m.id, line: `${bold(m.id)} "${clip(m.text, 70)}"` })), spare.length - 1);
  let remove = null;
  const gone = (y.deck?.cards ?? []).filter((k) => k.removable && !picked.some((p) => p.uid === k.uid));
  if (gone.length) { say('You may also set one card down for good.', 1, dim); remove = await pick('Card to remove', gone.map((k) => ({ id: k.uid, line: `${bold(k.name)} ${dim(`(${k.type}, ${k.zone})`)}` })), -1, true); }
  return { haunt, memory, remove };
}

function showPreview(pv, view) {
  console.log(bold('\n Preview'));
  if (!pv) return;
  const hand = view.you.deck?.hand ?? [], nm = (u) => hand.find((k) => k.uid === u)?.name ?? u, d = pv.deck;
  if (d) {
    const plays = [d.move && nm(d.move), ...d.edges.map(nm), d.guard && nm(d.guard), d.compel && nm(d.compel)].filter(Boolean);
    console.log(` plays    ${plays.join(' + ') || 'no cards'}${d.improvised && pv.needsRoll ? dim(`  (improvising ${pv.skill ?? ''}: base die only)`) : ''}${d.dropped.length ? dim(`  (stays in hand: ${d.dropped.map(nm).join(', ')})`) : ''}`);
  }
  if (pv.kind === 'act' && pv.needsRoll) console.log(` roll     ${bold(`${pv.pool} ${pv.pool === 1 ? 'die' : 'dice'}`)} ${dim(`[${pv.poolParts.join(' + ')}]`)} · difficulty ${pv.difficulty}`);
  else if (pv.kind === 'rest') console.log(` rest     at ${pv.rest?.haunt}: spend ${pv.rest?.memory}${pv.rest?.remove ? `, set down ${nm(pv.rest.remove)}` : ''}`);
  else if (pv.kind === 'theorize') console.log(' theory   the GM judges which clues it accounts for; a wrong theory costs Coherence and widens the Ingression');
  else console.log(' no roll  the world just answers');
  if (pv.rest && pv.kind !== 'rest') console.log(` + rest   at ${pv.rest.haunt}: spend ${pv.rest.memory}${pv.rest.remove ? `, set down ${nm(pv.rest.remove)}` : ''}`);
  if (pv.guard) console.log(` guard    ${names[pv.guard] ?? pv.guard}`);
  for (const i of pv.issues ?? []) console.log(yellow(` ! ${i}`));
}

async function act(req) {
  const { view, targets } = req, deck = view.you.deck;
  screen(view);
  let draft = null;
  if (deck?.offer) {
    const cards = deck.offer.cards;
    console.log(bold(`\n Reward: ${deck.offer.why}`) + dim(' (choose one card for your deck)'));
    cards.forEach((k, i) => showCard(k, i + 1, deck, []));
    draft = await ask('Draft which card (- to skip)', cards[0].offerId, (s) => (/^(-|s|skip|none)$/i.test(s) ? null : cards[+s - 1]?.offerId ?? bad(`pick 1-${cards.length} or -`)), '1');
  }
  console.log(bold('\n Targets:'));
  targets.forEach((t, i) => say(`${letter(i)}  ${t.target}: ${t.what}`, 5, undefined, 2));
  for (;;) {
    if (deck) showHand(deck);
    else say(`Skills: ${view.you.skills.join(', ')}. Domains: ${view.you.domains.join(', ')}.`, 1, dim);
    let intent = await compose(req, draft);
    let pv = req.preview?.(intent) ?? null;
    if (deck && pv?.needsRoll && pv.kind === 'act' && !pv.deck?.move) { // no Move card: improvise
      say(`${SKILLS.map((s) => `${s} (${SKILL_INFO[s]})`).join('; ')}. A skill you hold a Move for plays that card.`, 1, dim);
      const skill = await ask('Improvise with which skill', fitSkill(view, pv.target.type === 'npc' ? `npc:${pv.target.id}` : pv.target.type), parseSkill);
      intent = { ...intent, skill };
      pv = req.preview(intent);
    }
    showPreview(pv, view);
    if (await ask('Go? Enter = yes, r = redo', true, (s) => (/^(y|yes)$/i.test(s) ? true : /^(r|n|no|redo)$/i.test(s) ? false : bad('Enter to confirm, r to redo')), '')) {
      if (pv?.rest && pv.kind !== 'rest' && !pv.issues.some((i) => i.startsWith('rest:'))) restedScene = view.scene?.id;
      return intent;
    }
  }
}

/** Ask for one action's worth of choices; the engine's preview decides what they are worth. */
async function compose(req, draft) {
  const { view, targets } = req, y = view.you, deck = y.deck, hand = deck?.hand ?? [];
  const intent = { intent: '', say: '', do: '', target: 'none', play: [], skill: null, memory: null, guard: null, theorize: null, rest: null, draft };
  const canTheorize = !view.theory && view.clues.length >= 2;
  if (canTheorize) console.log();
  if (canTheorize && await yn('Theorize instead of acting?')) {
    view.clues.forEach((c) => say(`${c.id}: ${c.text}`, 2, dim));
    const theory = await text('Your theory: what is ingressing', 'A mind that is not here yet is pushing through the seams we found.');
    const clues = await ask('Clue ids it accounts for (Enter = all)', view.clues.map((c) => c.id), (s) => s.split(/[\s,]+/).filter(Boolean).map((id) => view.clues.find((c) => c.id.toLowerCase() === id.toLowerCase())?.id ?? bad(`no clue "${id}"`)), 'all');
    return { ...intent, say: await text('Say', 'I think I see it now.'), do: await text('Do', 'lay the clues side by side and name the shape'), theorize: { theory, clues } };
  }
  const dflt = targets.find((t) => ROLLS.has(kindOf(t.target)))?.target ?? targets[0].target;
  let picked = [];
  if (deck) {
    const auto = autoPlay(view, dflt);
    console.log();
    picked = await ask('Cards to play (numbers)', auto, (s) => parseCards(s, hand), auto.map((k) => hand.indexOf(k) + 1).join(' ') || '-');
  }
  const target = await ask('Target (letter)', dflt, (s) => {
    const t = targets[s.length === 1 ? s.toLowerCase().charCodeAt(0) - 97 : -1] ?? targets.find((x) => x.target.toLowerCase() === s.toLowerCase());
    return t ? t.target : bad(`pick a letter a-${letter(targets.length - 1)}`);
  }, letter(targets.findIndex((t) => t.target === dflt)));
  const [dsay, ddo] = LINES[kindOf(target)] ?? LINES.none;
  Object.assign(intent, { target, say: await text('Say', dsay), do: await text('Do', ddo), play: picked.map((k) => k.uid) });

  if (!deck) { // v0.3 free-form rules: name a skill and a domain
    const here = y.domains.find((d) => view.location?.domains?.includes(d)) ?? y.domains[0];
    intent.skill = await ask(`Skill (${y.skills.join(', ')})`, y.skills[0], parseSkill);
    intent.domain = await ask(`Domain (${y.domains.join(', ')})`, here, (s) => y.domains.find((d) => d.toLowerCase().startsWith(s.toLowerCase())) ?? bad('not one of yours'));
    const fresh = y.memories.filter((m) => !m.invokedThisScene);
    const id = fresh.length ? await pick('Invoke a memory? (+1 die, retell it)', fresh.map((m) => ({ id: m.id, line: `${bold(m.id)} "${clip(m.text, 70)}"` })), -1, true) : null;
    if (id) intent.memory = { id, reinterpretation: await text('Retell it with a new emphasis', fresh.find((m) => m.id === id).text) };
  }
  const mc = kindOf(target) === 'haunt' ? null : picked.find((k) => k.type === 'memory');
  if (mc) {
    say(`${mc.name} remembers: "${mc.memoryText}"`, 1);
    intent.memory = { id: mc.memory, reinterpretation: await text('Retell it with a new emphasis', mc.memoryText) };
  }
  if (picked.some((k) => k.kind === 'guard')) {
    const allies = view.allies.filter((a) => !a.dissolved);
    if (allies.length) intent.guard = await pick('Guard which ally', allies.map((a) => ({ id: a.id, line: `${bold(a.name)} ${dim(`stress ${a.total}`)}` })));
    else { console.log(yellow('  no ally to guard; the Guard card stays in hand')); intent.play = intent.play.filter((u) => hand.find((k) => k.uid === u)?.kind !== 'guard'); }
  }
  const haunts = view.location?.haunts ?? [];
  if (kindOf(target) === 'haunt') {
    const r = await restPicks(view, { haunt: target.split(':')[1], picked });
    if (r) { intent.memory = { id: r.memory }; intent.rest = { remove: r.remove }; }
  } else if (view.location?.isDelve === false && haunts.length && !view.you.restedThisScene && restedScene !== view.scene?.id && await yn('Free rest at a haunt too (once per scene, costs a memory)?')) {
    intent.rest = await restPicks(view, { keep: intent.memory?.id, picked });
  }
  return intent;
}

// ---------------------------------------------------------------- run
const t0 = Date.now();
console.log(`${bold(run.scenario.title)}\nYou play ${bold(cyan(names[seat]))} (${seat}). Enter accepts the [default]; "-" means nothing; Ctrl-D plays on with defaults.`);
let session;
try {
  ({ session } = await runSession({ ...run, hooks: { onEvent } }));
} finally {
  rl.close();
}
if (Object.values(config.providers ?? {}).some((p) => p.type === 'bridge')) {
  const dir = Object.values(config.providers).find((p) => p.type === 'bridge').dir ?? 'bridge';
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SESSION_OVER'), 'done');
}
const name = args.out ?? path.join('sessions', `${config.label ? config.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'session'}-${run.seed}.json`);
await fs.mkdir(path.dirname(name), { recursive: true });
await fs.writeFile(name, JSON.stringify(session));
console.log(`\nwrote ${name}  (${session.events.length} events, ${session.meta.calls} LLM calls, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (args.review) {
  const review = reviewSession(session);
  const base = name.replace(/\.json$/, '');
  await fs.writeFile(`${base}.review.json`, JSON.stringify(review, null, 2));
  await fs.writeFile(`${base}.review.md`, renderMarkdown(review));
  console.log(`wrote ${base}.review.json / .review.md`);
}
