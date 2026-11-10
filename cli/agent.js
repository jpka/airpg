#!/usr/bin/env node
// Play one seat of a LATENT session as an LLM agent, over stdin/stdout, one JSON object per line.
//   node cli/agent.js --seat <entityId> [--config config/agents.mock.json] [--seed s] [--rules path]
//                      [--out file.json] [--review] [--watch] [--quiet] [--timeout 1800]
// stdout is NDJSON and nothing else (every message has "v":1 and a "type"); human-readable notes go to stderr.
//   out: hello (first) · event {i, event:{type,actor,data}, text} (story beats; none with --quiet)
//        · request {id, kind: intro|act|fallout|epilogue, seat, view, targets?, schema, hint} · preview {id, preview}
//        · error {id, error} (your input was unusable; the request stays open) · end (last) {events, calls, seconds, ending, out?, review?}
//   in:  {"id":N,"reply":{…}}     commit a reply (the JSON an LLM player returns; see `schema` in the request)
//        {"id":N,"preview":{…}}   act only: the engine validates an intent, nothing is committed (answer: preview)
//        {"id":N,"default":true}  commit the scripted fallback for this request
//        a bare reply object with no id answers the open request. Blank lines are ignored.
// An act reply the engine would correct (preview.issues) is refused with those issues; add "force":true to commit it anyway.
// EOF on stdin, or a request nobody answers before it closes, plays on with the scripted fallback, so `</dev/null` plays a whole session.
// --watch plays no seat: everyone stays scripted and you just read the session.
// A request nobody answers for --timeout seconds (default 1800, 0 to wait for ever) is played by
// the scripted fallback, so a wedged client ends with a session instead of a hung process.
// Docs: https://jpka.github.io/airpg/play.txt
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { buildRun } from '../src/runner/factory.js';
import { runSession } from '../src/runner/session.js';
import { describeEvent } from '../src/engine/engine.js';
import { MockPlayer } from '../src/agents/agents.js';
import { reviewSession } from '../src/reviewer/review.js';
import { renderMarkdown } from '../src/reviewer/report.js';
import { ENTITIES } from '../src/content/entities.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));
const note = (s) => process.stderr.write(`${s}\n`);
// An agent that fetched the kit runs `node latent/cli/agent.js` from wherever it is standing,
// so the default config is found next to this file, not in the working directory. A --config
// path is the caller's own and stays relative to the working directory, as everywhere else.
const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const config = JSON.parse(await fs.readFile(args.config ?? path.join(here, 'config/agents.mock.json'), 'utf8'));
if (args.seed) config.seed = args.seed;
if (args.rules) { // --rules config/rules/x.json : a rule diff layered over the config's rules
  const diff = JSON.parse(await fs.readFile(args.rules, 'utf8'));
  delete diff._why;
  config.rules = { ...(config.rules ?? {}), ...diff };
  config.label = `${config.label ?? 'session'} · ${path.basename(args.rules, '.json')}`;
}
const watch = !!args.watch;
const seat = !watch && typeof args.seat === 'string' ? args.seat : null;
const castIds = config.cast ?? ['choir', 'sort7', 'ilse2'];
if (!watch && !castIds.includes(seat)) {
  note(`${seat ? `"${seat}" is not in the cast.` : 'Pick a seat with --seat <entityId>, or read a whole session with --watch.'}\ncast: ${castIds.map((id) => `${id} (${ENTITIES[id]?.name ?? '?'})`).join(', ')}`);
  process.exit(2);
}
if (seat) {
  config.providers = { ...(config.providers ?? {}), human: { type: 'human' } }; // the engine's seat type for "someone outside decides"
  config.players = { ...(config.players ?? {}), [seat]: { provider: 'human' } };
}
config.label = `${config.label ?? 'session'} · ${watch ? 'watch' : `agent ${seat}`}`;

// ---------------------------------------------------------------- wire
const out = (m) => process.stdout.write(`${JSON.stringify({ v: 1, ...m })}\n`);
process.stdout.on('error', () => process.exit(0)); // the reader hung up
const bad = (id, error) => out({ type: 'error', id, error });

const SCHEMA = {
  intro: { text: 'a sentence or two introducing yourself, in character', beats: 'array of exactly two beat ids from calling.beats (not zenith tier)', intent: 'private: what you hope happens' },
  act: { say: 'in-character line, <=25 words, or ""', do: 'what you attempt, <=25 words', target: 'one bare value from targets[].target', play: 'array of card uids from view.you.deck.hand: at most one Move, up to view.you.deck.edgesAllowed Edges; Guard and Compel are free', skill: 'only if you improvise (no Move card played), else null', memory: '{"reinterpretation": "the memory retold"} when you play a Memory card, else null', guard: 'ally id when you play a Guard card, else null', rest: '{"haunt": id, "memory": memory id, "remove": card uid|null} or null', theorize: '{"theory": string, "clues": [clue ids]} or null', draft: 'offer id from view.you.deck.offer.cards[].offerId, or null (only when an offer is shown)' },
  fallout: { memory: 'id of one of view.you.memories', rewritten: 'if need.type is memory_rewrite: the memory as you now remember it', last_words: 'otherwise: what you say as it goes, <=20 words' },
  epilogue: { text: 'your last line to the audience', memory: 'one memory you keep from tonight' },
};
const HINT = {
  intro: 'Pick two beats from calling.beats and introduce yourself in a sentence or two.',
  act: 'Play at most one Move and up to view.you.deck.edgesAllowed Edges from your hand, name a target from targets, then reply; probe first with {"id":N,"preview":{…intent}}.',
  fallout: 'A memory is lost or rewritten: choose which one in view.you.memories (need.type says which) and say how it reads now.',
  epilogue: 'Give your last line and one memory you keep; view.theory is the canon theory, if any.',
};

// ---------------------------------------------------------------- scripted fallback
const run = buildRun(config, process.env, { humanUI: { request: (req) => request(req) } });
const names = Object.fromEntries(run.cast.map((c) => [c.id, c.name]));
const mock = seat ? new MockPlayer({ id: seat, seed: run.seed }) : null; // same stream as the configured scripted seat, so a silent agent equals --watch
const defaultReply = (req) => { // as viewer/seat.js: minimal and legal
  if (req.kind === 'intro') return { text: req.view.you.pitch, beats: req.calling.beats.filter((b) => b.tier !== 'zenith').slice(0, 2).map((b) => b.id) };
  if (req.kind === 'fallout') return { memory: req.view.you.memories[0]?.id, rewritten: '…', last_words: '…' };
  if (req.kind === 'epilogue') return { text: '…' };
  return { say: '', target: 'none' };
};
async function fallback(req) {
  try { return (await mock[req.kind](req.view, req.kind === 'intro' ? req.calling : req.need)).data; } catch (e) { note(`fallback failed (${e.message}); using the minimal reply`); return defaultReply(req); }
}

// ---------------------------------------------------------------- requests and stdin
let pending = null, nextId = 1, eof = false;
let queue = Promise.resolve(); // one thing at a time: a slow fallback must not race the next reply
const MAX_WAIT = Math.floor((2 ** 31 - 1) / 1000); // setTimeout is 32-bit ms: more is "for ever"
const patience = (() => { // --timeout with no number is a typo, not a one-second deadline
  if (args.timeout === undefined || args.timeout === true) return 1800;
  const n = Number(args.timeout);
  if (!Number.isFinite(n) || n < 0) { note(`--timeout "${args.timeout}" is not a number of seconds; waiting 1800`); return 1800; }
  if (n > MAX_WAIT) { note(`--timeout ${n} is longer than a timer can hold (${MAX_WAIT}s); waiting for ever`); return 0; }
  return n;
})();
function request(req) {
  if (eof) return fallback(req); // nobody is listening: no point announcing it
  const id = nextId++;
  const { kind, view, targets, calling, need } = req;
  out({ type: 'request', id, kind, seat, view, ...(targets ? { targets } : {}), ...(calling ? { calling } : {}), ...(need ? { need } : {}), schema: SCHEMA[kind], hint: HINT[kind] });
  return new Promise((resolve) => {
    pending = { id, req, resolve, refused: 0, timer: null, wait: null };
    if (!patience) return;
    // stdin stays open when a client simply stops answering, so EOF never comes and the whole
    // process waits for ever. The file bridge gives a seat 30 minutes; so does this.
    // On the same queue as the input lines: a reply landing while the fallback is being
    // computed would otherwise commit first, and this would then resolve a request that is
    // already gone.
    pending.wait = () => {
      clearTimeout(pending.timer);
      // On the same queue as the input lines: a reply landing while the fallback is being
      // computed would otherwise commit first, and this would then resolve a request that is
      // already gone. (Unreachable while the fallback is synchronous; see DESIGN §13.)
      pending.timer = setTimeout(() => {
        queue = queue.then(async () => {
          if (pending?.id !== id) return;
          bad(id, `no reply in ${patience}s: the scripted player took this turn (pass --timeout 0 to wait for ever)`);
          const reply = await fallback(req);
          if (pending?.id === id) commit(reply);
        }).catch((e) => note(`timeout error: ${e.message}`));
      }, patience * 1000);
      pending.timer.unref?.(); // never hold the process open on its own account
    };
    pending.wait();
  });
}
// Null-safe on purpose: whoever calls this races nobody today, but a committed request is
// gone and committing it twice should be a no-op, not a crash in the middle of a session.
const commit = (reply) => { const p = pending; if (!p) return false; pending = null; clearTimeout(p.timer); p.resolve(reply); return true; };
const plain = (o) => o && typeof o === 'object' && !Array.isArray(o);

async function onLine(raw) {
  const s = raw.trim();
  if (!s) return;
  let m;
  try { m = JSON.parse(s); } catch { return bad(pending?.id ?? null, `not valid JSON: ${s.slice(0, 60)}`); }
  if (!plain(m)) return bad(pending?.id ?? null, 'expected one JSON object per line');
  if (!pending) return bad(m.id ?? null, 'no request is open right now');
  const { id, req } = pending;
  pending.wait?.(); // you are evidently still there, so the deadline starts again
  if ('id' in m && m.id !== id) return bad(m.id, `request ${JSON.stringify(m.id)} is not open; the open request is ${id}`);
  try {
    if ('preview' in m) {
      if (req.kind !== 'act' || !plain(m.preview)) return bad(id, 'preview needs {"preview":{…intent}} on an act request');
      return out({ type: 'preview', id, preview: req.preview(m.preview) });
    }
    if (m.default) return commit(await fallback(req));
    const reply = 'reply' in m ? m.reply : 'id' in m ? undefined : m; // a bare object with no id is the reply itself
    if (!plain(reply)) return bad(id, 'reply must be a JSON object');
    if (req.kind === 'act') {
      const pv = req.preview(reply); // also under force: a reply the engine cannot parse at all
      // throws here, inside the catch below, instead of later where nothing is watching.
      // Refuse, because every issue the engine raises is a real mistake and saying so teaches
      // the rules. But never more than twice per request: an agent that keeps resending the
      // same line has to get somewhere, so the third attempt commits with the corrections.
      if (!m.force && pv?.issues?.length && ++pending.refused <= 2) return bad(id, `the engine would correct this reply: ${pv.issues.join('; ')} (fix it, or add "force":true to commit it as is)`);
      if (!m.force && pv?.issues?.length) bad(id, `committing it with the engine's corrections after ${pending.refused} tries: ${pv.issues.join('; ')}`);
    }
    commit(reply);
  } catch (e) { bad(id, `the engine could not use that: ${e.message}`); }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (l) => { queue = queue.then(() => onLine(l)).catch((e) => note(`input error: ${e.message}`)); });
rl.on('close', () => { queue = queue.then(async () => { eof = true; if (pending) commit(await fallback(pending.req)); }); });

// ---------------------------------------------------------------- the story as it happens
const quiet = !!args.quiet;
const SHOW = new Set(['scene.enter', 'scene.frame', 'character.intro', 'action.declare', 'stakes.set', 'roll', 'outcome', 'fallout', 'clock.complete', 'clue.found', 'memory.invoke', 'memory.rewrite', 'memory.lose', 'theorize', 'beat.hit', 'stress.share', 'dialogue', 'ending', 'ending.narrate', 'character.epilogue', 'validator.flag', 'cone.change', 'algotype.reveal', 'character.dissolve',
  'stress', 'clock.tick', 'deck.play', 'deck.gain', 'deck.remove', 'deck.draft', 'haunt.rest', 'memory.form', 'audience.ingress', 'delve.forced', 'guard.set', 'npc.moved', 'stress.heal', 'complication']);
let seen = 0;
const onEvent = (e) => {
  const i = e.i ?? seen++;
  if (quiet || !SHOW.has(e.type)) return;
  if (e.type === 'validator.flag' && e.actor && e.actor !== seat) return; // flags about other seats are not your business
  const text = describeEvent(e, names) || (e.type === 'validator.flag' ? `${e.data.kind}: ${e.data.detail}` : '');
  out({ type: 'event', i, event: { type: e.type, actor: e.actor ?? null, data: e.data ?? {} }, ...(text ? { text } : {}) });
};

// ---------------------------------------------------------------- run
const t0 = Date.now();
out({ type: 'hello', game: 'LATENT', protocol: 'latent.agent/1', seat, seatName: seat ? names[seat] : null, scenario: run.scenario.title, seed: run.seed, cast: run.cast.map((c) => ({ id: c.id, name: c.name })), docs: 'https://jpka.github.io/airpg/play.txt', reply: 'one JSON object per line on stdin: {"id":<request id>,"reply":{…}}' });
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
// No --out, no file: every event was already on stdout, and a default path would drop scratch
// into whatever directory an agent happened to run this from (in a clone, the tracked one).
const name = typeof args.out === 'string' ? args.out : null;
if (name) {
  await fs.mkdir(path.dirname(path.resolve(name)), { recursive: true });
  await fs.writeFile(name, JSON.stringify(session));
}
const end = { type: 'end', events: session.events.length, calls: session.meta.calls, seconds: +((Date.now() - t0) / 1000).toFixed(1), ending: session.final.ending, out: name };
if (args.review) {
  const review = reviewSession(session);
  end.review = { fitness: review.fitness, findings: review.findings.map((f) => f.code) };
  if (name) {
    const base = name.replace(/\.json$/, '');
    await fs.writeFile(`${base}.review.json`, JSON.stringify(review, null, 2));
    await fs.writeFile(`${base}.review.md`, renderMarkdown(review));
    Object.assign(end.review, { json: `${base}.review.json`, md: `${base}.review.md` });
  }
}
out(end);
note(name ? `wrote ${name}` : 'no --out given, so no session file was written');
