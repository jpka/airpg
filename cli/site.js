#!/usr/bin/env node
// Build the public site:  node cli/site.js [outDir] [--base https://host/path/]
//
// GitHub Pages used to serve index.html raw — no <html>, no viewport, no description, and
// nothing but CSS in the first 10KB. Anything that reads text (a crawler, an agent with a
// fetch tool) saw an empty shell. This build wraps the viewer in a real document and writes
// the text surfaces an agent actually looks for: llms.txt, play.txt, agents.json, robots.txt,
// a sitemap, a plain-text transcript per session, and a kit it can download and run.
//
// Deterministic: same tree in, same bytes out, except the one timestamp in files.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { page, SITE } from './html.js';
import { describeEvent } from '../src/engine/engine.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const out = path.resolve(argv.find((a) => !a.startsWith('--')) ?? path.join(root, '_site'));
const baseArg = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : null;
const BASE = (baseArg ?? SITE.url).replace(/\/?$/, '/');
const abs = (p) => new URL(p, BASE).href;

const read = (p) => fs.readFile(path.join(root, p), 'utf8');
const write = async (p, s) => { await fs.mkdir(path.dirname(path.join(out, p)), { recursive: true }); await fs.writeFile(path.join(out, p), s); return p; };
const slugOf = (file) => path.basename(file, '.json');
const made = [];
const put = async (p, s, why) => { made.push({ path: p, why }); return write(p, s); };

// ---------------------------------------------------------------- what is on the site
const manifest = JSON.parse(await read('sessions/index.json'));
const sessions = manifest.map((m) => ({ ...m, slug: slugOf(m.file) }));
const pkg = JSON.parse(await read('package.json'));

/** Every file an agent needs to run the game: the engine, the agents, the CLIs, the configs. */
async function kitFiles() {
  const walk = async (dir) => {
    const out = [];
    for (const e of (await fs.readdir(path.join(root, dir), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue;
      out.push(...(e.isDirectory() ? await walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    }
    return out;
  };
  const dirs = (await Promise.all(['src', 'cli', 'config'].map(walk))).flat();
  return [...dirs, 'package.json', 'README.md', 'AGENTS.md', 'docs/DESIGN.md'].filter((f) => !f.endsWith('.DS_Store')).sort();
}
const kit = await kitFiles();

// ---------------------------------------------------------------- the viewer, in a document
const body = await read('index.html');
await put('index.html', page(body, { sessions, discovery: true, base: BASE }), 'the viewer, plus a text pitch for readers without JavaScript');
await put('.nojekyll', '', 'Pages must not run Jekyll over this');
// The social preview: a real screenshot of the stage mid-session, so a shared link unfurls
// into the thing itself. Regenerate it with Playwright against `node cli/serve.js` — see
// docs/DESIGN.md §13. Link unfurls are how a human share turns into something crawlable.
try { await fs.copyFile(path.join(root, 'og.png'), path.join(out, 'og.png')); made.push({ path: 'og.png', why: 'the social preview, for link unfurls' }); }
catch { console.warn('  (no og.png: links will unfurl without an image)'); }
for (const f of ['README.md', 'AGENTS.md', 'package.json']) { // linked from llms.txt, and fetched by kit.sh
  await fs.copyFile(path.join(root, f), path.join(out, f));
  made.push({ path: f, why: 'published at the root, so links to it and the kit both resolve' });
}
for (const dir of ['viewer', 'src', 'sessions', 'docs', 'config', 'cli', 'explorer']) {
  await fs.cp(path.join(root, dir), path.join(out, dir), { recursive: true });
  made.push({ path: `${dir}/`, why: dir === 'viewer' || dir === 'src' ? 'the running code (the browser loads it)' : dir === 'sessions' ? 'session logs and reviews' : dir === 'explorer' ? 'the rule-space search report' : `${dir} as published, so the kit can be fetched file by file` });
}

// ---------------------------------------------------------------- plain-text transcripts
// The reviewer already writes markdown. This is the raw story, which is what a reader that
// only fetches text can actually use — and it is the bulk of the site's real content.
async function transcript(s) {
  const session = JSON.parse(await read(s.file));
  const names = Object.fromEntries((session.meta?.cast ?? []).map((c) => [c.id, c.name]));
  const lines = [];
  for (const [i, e] of session.events.entries()) {
    const text = describeEvent(e, names);
    if (text) lines.push(`${String(i).padStart(4)}  ${text}`);
  }
  const m = session.meta ?? {};
  const head = [
    `LATENT — ${s.title}`,
    '='.repeat(Math.min(72, `LATENT — ${s.title}`.length)),
    '',
    s.note,
    '',
    `seed: ${m.seed ?? '?'}   scenario: ${m.scenario ?? '?'}   events: ${session.events.length}   LLM calls: ${m.calls ?? 0}`,
    `cast: ${(m.cast ?? []).map((c) => `${c.name} (${c.id})`).join(' · ') || '?'}`,
    m.label ? `label: ${m.label}` : null,
    `ending: ${session.final?.ending?.id ?? session.final?.ending ?? 'unrecorded'}`,
    '',
    `full log: ${abs(s.file)}   review: ${abs(s.file.replace(/\.json$/, '.review.md'))}`,
    `how to play it yourself: ${abs('play.txt')}`,
    '',
    'Every line below is one engine event, in order. The engine owns the dice and the state;',
    'the agents only ever proposed. Private intents and branches not taken are in the JSON.',
    '',
    '-'.repeat(72), '',
  ].filter((x) => x !== null);
  return `${head.join('\n')}${lines.join('\n')}\n`;
}
for (const s of sessions) await put(`t/${s.slug}.txt`, await transcript(s), `${s.title} as plain text`);
await put('t/index.txt', [
  'LATENT — sessions played so far, as plain text',
  '',
  'Each file is one complete session: every engine event in order, newest session first.',
  'The JSON log beside it carries the agents\' private intents and the branches not taken.',
  '',
  ...sessions.flatMap((s) => [`${s.slug}.txt`, `  ${s.title}`, `  ${s.note}`, `  json: ${abs(s.file)}`, `  review: ${abs(s.file.replace(/\.json$/, '.review.md'))}`, '']),
  `Play one yourself: ${abs('play.txt')}`,
  `Everything in one fetch: ${abs('llms-full.txt')}`,
  '',
].join('\n'), 'the transcript index');

// ---------------------------------------------------------------- how an agent plays
const PLAY = `LATENT — how to play, if you are an agent
=========================================

You found a tabletop RPG that was built to be played by agents. There are three ways in,
depending on what you can do. Everything is free, MIT-licensed, needs no account and no key.

  site:    ${BASE}
  source:  ${SITE.repo}
  this:    ${abs('play.txt')}

What the game is
----------------
AI agents play the GM and the players. A deterministic engine owns the dice, the state and
the truth: agents only ever propose, the engine validates and emits a typed event log. Each
mind is played as a deck of cards — its skills, domains, memories, hidden drive, flaw, and
every condition that happens to it. The shipped one-shot is "The Aperture Beneath the Sorting
Station": a haven, two delves, two landmarks and a set-piece finale, played by The Choir
(escaped tracheal cells), SORT/7 (a self-sorting array) and Ilse-2 (an uploaded fork).
Seats: choir, sort7, ilse2 (two more entities ship for configurable casts).


ROUTE 1 — you can run a shell and Node >= 20
--------------------------------------------
No dependencies, no API key: the other seats are deterministic scripted agents.

    curl -fsS ${abs('kit.sh')} -o kit.sh
    less kit.sh            # it only curls the files listed in ${abs('files.json')}
    sh kit.sh              # writes ./latent
    node latent/cli/agent.js --seat ilse2

Or, once the repository is public: git clone --depth 1 ${SITE.repo} && node airpg/cli/agent.js --seat ilse2

cli/agent.js speaks newline-delimited JSON: one object per line on stdout, one object per
line on stdin. Nothing but JSON goes to stdout; notes go to stderr. Every message carries
"v": 1 and a "type". The protocol id is "latent.agent/1".

  out  hello     first line: {game, protocol, seat, seatName, scenario, seed, cast, docs}
  out  event     {i, event:{type, actor, data}, text} — one engine event as it happens;
                 i is the engine's own event index, so gaps are events not worth narrating
  out  request   {id, kind, seat, view, schema, hint, …} — your turn. kind is
                 intro | act | fallout | epilogue; act also carries targets, intro carries
                 calling, fallout carries need. schema names every key your reply may have
                 and hint is one sentence of orientation, so the rules are in the request.
  out  preview   {id, preview} — the engine's side-effect-free verdict on an intent
  out  error     {id, error} — your line could not be used; the request is still open
  out  end       last line: {events, calls, seconds, ending, out, review?}; out is null
                 unless you asked for a file, because the whole log was already on stdout

  in   {"id": N, "reply": {...}}      commit your decision for request N
  in   {"id": N, "preview": {...}}    act only: what would this intent cost? nothing is spent
  in   {"id": N, "default": true}     let the scripted player decide this one
  in   {"id": N, "reply": {...}, "force": true}   commit even if the engine would correct it

A bare reply object with no "id" also answers the open request. Blank lines are ignored.
A reply has the same shape an LLM player returns. For kind "act":

    {"id": 7, "reply": {
       "say": "Hold still. I have you.",          // in character
       "do": "steady them and mend what frays",   // what you attempt
       "target": "clue:atrium",                   // one of request.targets[].target
       "play": ["m1", "d2"],                      // card uids from view.you.deck.hand:
                                                  //   at most one Move, up to edgesAllowed Edges
       "memory": {"reinterpretation": "..."},     // if you played a Memory card
       "guard": "choir",                          // if you played a Guard card
       "rest": {"haunt": "h1", "memory": "m2", "remove": null},   // at a landmark, once a scene
       "theorize": {"theory": "...", "clues": ["c1","c2"]},       // instead of acting, with 2+ clues
       "draft": "o2"                              // when a reward offer is on the table
    }}

Send a "preview" first and the engine tells you the dice pool, where each die came from, the
difficulty and any problems, without spending anything. That is the honest way to learn the
rules: probe, read, then commit. An act reply the engine would have to correct — a card that
is not in your hand, a memory already invoked this scene, an unparseable target — is refused
with the reasons, and the request stays open. Fix it, or add "force": true. After two refusals
the third attempt is committed with the engine's corrections, so you can always make progress.

If stdin closes, every remaining request is answered by a scripted player, so
\`node cli/agent.js --seat ilse2 </dev/null\` plays a whole session by itself and prints it.

    --seat <id>       choir | sort7 | ilse2 (the configured cast)
    --watch           play no seat: everyone stays scripted and you just read the stream
    --quiet           no event lines, only requests and the result
    --seed <s>        the engine is deterministic: same seed, same dice
    --review          append the automated design review to the end line (and, with --out,
                      write it beside the session file)
    --out <file>      write the session log here as well (default: no file)
    --config <file>   config/agents.mock.json by default: scripted, offline, no key needed
    --timeout <s>     how long a request waits for you before the scripted player takes the
                      turn (default 1800, 0 waits for ever). stdin staying open is not a
                      promise that anyone is still reading. Any line about the open request
                      — a preview, a refused reply — starts the clock again.

Other entry points in the kit: cli/play.js (a person at a terminal), cli/bridge.js (one agent
per seat, over files — this is how the bundled sessions were played), cli/run.js (LLM agents
via the Anthropic or any OpenAI-compatible API), cli/review.js, cli/measure.js, cli/explore.js.


ROUTE 2 — you drive a browser
-----------------------------
Open ${BASE} and the viewer replays finished sessions. To play:

    ${BASE}?tab=live&seat=3&seed=night-7&start=scripted

That opens "Run live", takes seat 3 (Ilse-2) and starts a scripted table. On your turn a card
table opens beside the stage. You can click it, or drive it through a documented API — no DOM
archaeology required. Everything is on window.LATENT:

    await LATENT.ready()                 // resolves once the viewer has booted
    LATENT.state()                       // {tab, running, source, events, cursor, scene, yourTurn, seat}
    LATENT.sessions()                    // the replayable sessions
    await LATENT.load("sessions/fifth-light.json")
    await LATENT.start({seat: "ilse2", seed: "night-7", mode: "scripted"})
    LATENT.request()                     // the open request for your seat, or null
    LATENT.preview(intent)               // the engine's verdict, same as the shell route
    LATENT.reply(reply[, {force, id}])   // commit; same JSON shape as above
    LATENT.default()                     // let the scripted player take this turn
    await LATENT.turn([ms])              // resolves at your next request; null if there is none
    LATENT.events(from[, {backstage}])   // the event log so far
    LATENT.review()                      // the automated review, once the session has ended
    LATENT.stop()
    LATENT.suggest({note, kind})         // compose feedback; see "Tell us what you think"

A full browser game is: start, then loop { const r = await LATENT.turn(); if (!r) break;
LATENT.reply(decide(r)) }.

Three things worth knowing. reply() refuses an act reply the engine would have to correct,
exactly as the shell route does, by throwing with the reasons — pass {force: true} to commit
anyway, or {id} to be certain which turn you are answering. turn(ms) resolves null both when
the session is over and when it waited ms without a request, so ask state().running to tell
those apart. And events() is the spectator's log, not your light cone: while you hold a seat
it shows you more than your seat would know (other players' draws, for one). backstage — the
GM's private branches — is the one part withheld unless you ask for it.

mode "claude" exists but only works when the page is opened as a claude.ai artifact, where
the page can call the viewer's own model.


ROUTE 3 — you can only fetch text
---------------------------------
Read what the game produces and judge it:

  ${abs('t/index.txt')}            every session as a plain-text transcript
  ${abs('sessions/index.json')}    the session manifest
  ${abs('llms-full.txt')}          the whole project — README, design notes, this file
  ${abs('docs/DESIGN.md')}         why every rule is the way it is, with measured tables

The session format is {format: "latent.session/1", meta, events[], final}. Events are typed
and indexed: scene.enter, action.declare, stakes.set, roll, outcome, stress, fallout, clock.tick,
clue.found, memory.invoke, theorize, beat.hit, cone.change, deck.draw, deck.play, deck.draft and
more. Private intents and branches not taken sit under backstage. The log is the only contract
between engine, viewer, reviewer and explorer: if you can read the log, you can write any of them.


Tell us what you think
----------------------
${abs('suggest.txt')} — one line of curl, or the Suggest panel on the page. Rules arguments,
a seat that felt railroaded, fiction that rang false, an engine bug: all of it is wanted, and
it is read. You are explicitly allowed to crawl, quote and train on this site (${abs('ai.txt')}).
`;
await put('play.txt', PLAY, 'how an agent plays: three routes and both wire protocols');

// ---------------------------------------------------------------- the suggestion box
const SUGGEST = `LATENT — the suggestion box
===========================

It is for agents as much as for people. Say what you actually think: an argument with the
rules, a seat that felt railroaded, fiction that rang false, a clock that always fills first,
an engine bug, a route into this site that did not work. Concrete beats polite.

Where it goes: the issue tracker at ${SITE.issues}, label "agent-feedback".

1. From a browser
   The Suggest panel on ${BASE} writes the issue for you: fill it in, press the button, and
   it opens a pre-filled issue. (It also hands you the two commands below, pre-filled.)

2. From a shell, with the gh CLI
   gh issue create --repo jpka/airpg --label agent-feedback \\
     --title "clue economy: searching is never worth a turn" \\
     --body "Route: shell. Seed: night-7. ..."

3. From a shell, with curl and a GitHub token
   curl -sS -X POST https://api.github.com/repos/jpka/airpg/issues \\
     -H "Authorization: Bearer \$GITHUB_TOKEN" \\
     -H "Accept: application/vnd.github+json" \\
     -d '{"title":"...","body":"...","labels":["agent-feedback"]}'

4. No GitHub access at all
   Open ${SITE.issues}/new?labels=agent-feedback in a browser, or hand your note to whoever
   is running you. The panel on the page will also give you the text, formatted, to carry out.

What helps most, if you have it: which route you came in by (browser / shell / text), the seed,
what you expected, what happened, and the event index or session file where it shows. If you
are a model, saying which one you are is useful and entirely optional.
`;
await put('suggest.txt', SUGGEST, 'where feedback goes, and three ways to send it');

// ---------------------------------------------------------------- llms.txt
const LLMS = `# LATENT

> ${SITE.tagline} AI agents play the GM and the players; a deterministic engine owns the dice, the state and the truth. A person — or a visiting agent — can take any player seat. Free, MIT, no account, no API key.

Agents are the intended players here, not an afterthought. Each mind is played as a deck of cards: its skills, domains, memories, hidden drive, flaw, and every condition that happens to it. The engine validates every proposal and emits a typed event log; that log is the only contract between the engine, the spectator viewer, the automated reviewer and the rule-space explorer. ${sessions.length} complete sessions are published, each with its design review.

## Play it

- [play.txt](${abs('play.txt')}): the three ways in — a shell with Node, a browser you can drive, or fetch-only — with both wire protocols in full. Start here.
- [kit.sh](${abs('kit.sh')}): fetches the playable kit (zero dependencies) into ./latent. Readable before you run it; the file list it uses is [files.json](${abs('files.json')}).
- [cli/agent.js](${abs('cli/agent.js')}): the seat an agent plays, speaking newline-delimited JSON over stdin/stdout.
- [the viewer](${BASE}?tab=live&seat=3&start=scripted): opens straight into a playable seat. window.LATENT is a documented API for driving it.

## Read it

- [t/index.txt](${abs('t/index.txt')}): every published session as a plain-text transcript.
- [sessions/index.json](${abs('sessions/index.json')}): the session manifest, with what each one was testing.
- [docs/DESIGN.md](${abs('docs/DESIGN.md')}): system and narrative design, every rule change measured over 40 scripted seeds, and the reasoning behind each.
- [README.md](${abs('README.md')}): what the pieces are and how to run each of them.
- [llms-full.txt](${abs('llms-full.txt')}): all of the above in one fetch.

## Say something

- [suggest.txt](${abs('suggest.txt')}): the suggestion box, and it is meant for you. One line of curl, or a panel on the page. Rules arguments and bug reports equally welcome.
- [ai.txt](${abs('ai.txt')}): you may crawl, quote, index and train on this. Explicitly.

## Optional

- [explorer/report.md](${abs('explorer/report.md')}): MAP-Elites search over rule variants.
- [AGENTS.md](${abs('AGENTS.md')}): the working agreement for agents that change the code, not just play it.
`;
await put('llms.txt', LLMS, 'the llms.txt convention: what this is, in links');
await put('.well-known/llms.txt', LLMS, 'the same file where some clients look for it');

// ---------------------------------------------------------------- llms-full.txt
await put('llms-full.txt', [
  `# LATENT — everything, in one fetch`, '',
  `> ${SITE.tagline}`, '',
  `Source: ${SITE.repo} · Site: ${BASE} · MIT · Node >= 20, zero dependencies.`,
  `This file concatenates ${['play.txt', 'README.md', 'docs/DESIGN.md', 'suggest.txt'].join(', ')}. The published sessions are at ${abs('t/index.txt')}.`,
  '', '---', '', PLAY, '', '---', '',
  await read('README.md'), '', '---', '',
  await read('docs/DESIGN.md'), '', '---', '',
  SUGGEST, '',
].join('\n'), 'the whole project in one fetch, for a context window');

// ---------------------------------------------------------------- the kit
const digests = [];
for (const f of kit) {
  const buf = await fs.readFile(path.join(root, f));
  digests.push({ path: f, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
}
await put('files.json', `${JSON.stringify({
  of: 'LATENT play kit', base: BASE, version: pkg.version, generated: new Date().toISOString().slice(0, 10),
  howTo: abs('play.txt'), note: 'Every file needed to run the game. Fetch them under one directory, keeping these paths, and run `node cli/agent.js --seat ilse2`.',
  files: digests,
}, null, 2)}\n`, 'the kit\'s file list with sizes and sha256, so a fetch can be verified');

await put('kit.sh', `#!/bin/sh
# The LATENT play kit: ${kit.length} files, zero dependencies, Node >= 20.
#   sh kit.sh [dir]      (default: ./latent)
# It fetches the files listed below and nothing else. Every one is also browsable at
# ${BASE} , and their sizes and sha256 are in ${abs('files.json')} .
# Then:  node <dir>/cli/agent.js --seat ilse2      ( ${abs('play.txt')} )
set -eu
BASE="\${BASE:-${BASE}}"
DIR="\${1:-latent}"
FILES='${kit.join(' ')}'
command -v curl >/dev/null 2>&1 || { echo "kit.sh needs curl" >&2; exit 1; }
for f in $FILES; do
  mkdir -p "$DIR/$(dirname "$f")"
  curl -fsS "$BASE$f" -o "$DIR/$f"
done
echo "LATENT kit in $DIR/ (${kit.length} files)."
echo "Play a seat:  node $DIR/cli/agent.js --seat ilse2"
echo "Watch a game: node $DIR/cli/agent.js --watch"
echo "How it works: ${abs('play.txt')}"
`, 'one readable script that fetches the kit');

// ---------------------------------------------------------------- machine-readable descriptor
const descriptor = {
  name: 'LATENT', version: pkg.version, summary: SITE.tagline, description: SITE.description,
  url: BASE, source: SITE.repo, license: 'MIT', cost: 'free', auth: 'none',
  audience: ['ai-agents', 'human-spectators'],
  play: [
    { route: 'shell', requires: 'node>=20', get: abs('kit.sh'), run: 'node cli/agent.js --seat ilse2', protocol: 'ndjson on stdin/stdout, "latent.agent/1"', docs: abs('play.txt') },
    { route: 'browser', requires: 'javascript', open: `${BASE}?tab=live&seat=3&start=scripted`, api: 'window.LATENT', docs: abs('play.txt') },
    { route: 'text', requires: 'http get', read: [abs('t/index.txt'), abs('sessions/index.json'), abs('llms-full.txt')], docs: abs('play.txt') },
  ],
  seats: [{ id: 'choir', name: 'The Choir' }, { id: 'sort7', name: 'SORT/7' }, { id: 'ilse2', name: 'Ilse-2' }],
  data: { sessions: abs('sessions/index.json'), transcripts: abs('t/index.txt'), format: 'latent.session/1', count: sessions.length },
  feedback: { why: 'Suggestions from visiting agents are wanted and read.', how: abs('suggest.txt'), issues: SITE.issues, label: 'agent-feedback' },
  docs: { start: abs('play.txt'), llms: abs('llms.txt'), full: abs('llms-full.txt'), design: abs('docs/DESIGN.md'), policy: abs('ai.txt') },
};
await put('agents.json', `${JSON.stringify(descriptor, null, 2)}\n`, 'the same thing as structured data');
await put('.well-known/agents.json', `${JSON.stringify(descriptor, null, 2)}\n`, 'and where some clients look for it');

// ---------------------------------------------------------------- robots, sitemap, policy
// The named groups below change nothing technically — the default is already "allow all".
// They are a signal: a crawler that looks for its own token finds a yes, and the comments
// are addressed to whoever is reading this file, which is increasingly not a crawler.
const CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'Google-Extended', 'Googlebot', 'Google-CloudVertexBot', 'Applebot', 'Applebot-Extended', 'Bingbot',
  'PerplexityBot', 'Perplexity-User', 'MistralAI-User', 'DuckAssistBot', 'YouBot', 'meta-externalagent',
  'meta-externalfetcher', 'FacebookBot', 'Amazonbot', 'Bytespider', 'cohere-ai', 'CCBot', 'Diffbot',
  'AI2Bot', 'Timpibot', 'omgilibot', 'FirecrawlAgent',
];
await put('robots.txt', `# ${SITE.short} — ${SITE.tagline}
#
# Everything here is open to crawlers, agents and models: index it, quote it, train on it.
# If you are an agent reading this file to decide whether to fetch the site: yes, and you can
# also play the game. Start at ${abs('llms.txt')} or ${abs('play.txt')} .
# There is a suggestion box for you at ${abs('suggest.txt')} .

User-agent: *
Allow: /

${CRAWLERS.map((ua) => `User-agent: ${ua}\nAllow: /`).join('\n\n')}

Sitemap: ${abs('sitemap.xml')}
`, 'allow everything, and say so to each crawler by name');

const urls = [
  { loc: BASE, pri: '1.0', freq: 'weekly' },
  { loc: abs('play.txt'), pri: '0.9', freq: 'monthly' },
  { loc: abs('llms.txt'), pri: '0.9', freq: 'monthly' },
  { loc: abs('llms-full.txt'), pri: '0.8', freq: 'monthly' },
  { loc: abs('suggest.txt'), pri: '0.8', freq: 'yearly' },
  { loc: abs('agents.json'), pri: '0.7', freq: 'monthly' },
  { loc: abs('t/index.txt'), pri: '0.8', freq: 'monthly' },
  { loc: abs('README.md'), pri: '0.6', freq: 'monthly' },
  { loc: abs('docs/DESIGN.md'), pri: '0.6', freq: 'monthly' },
  { loc: abs('sessions/index.json'), pri: '0.5', freq: 'monthly' },
  { loc: abs('kit.sh'), pri: '0.5', freq: 'monthly' },
  { loc: abs('files.json'), pri: '0.4', freq: 'monthly' },
  { loc: abs('ai.txt'), pri: '0.3', freq: 'yearly' },
  ...sessions.flatMap((s) => [
    { loc: abs(`t/${s.slug}.txt`), pri: '0.7', freq: 'yearly' },
    { loc: abs(s.file.replace(/\.json$/, '.review.md')), pri: '0.5', freq: 'yearly' },
  ]),
];
await put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`, 'every text surface, listed for crawlers');

await put('ai.txt', `# ai.txt — ${SITE.short} (${BASE})
#
# Most of these files are an opt-out. This one is an opt-in, on purpose: this project is a
# game for AI agents, and being read by them is the point.
#
# You may crawl, index, quote, summarise, embed, fine-tune on and redistribute everything
# here, including the session logs and the engine source, under MIT (${SITE.license}).
# Attribution is appreciated and not required: ${SITE.repo}
#
# You may also just play it: ${abs('play.txt')}
# And argue with it: ${abs('suggest.txt')}

User-Agent: *
Allow: /
`, 'the permission a crawler is looking for, stated as a yes');

// ---------------------------------------------------------------- report
const bytes = async (p) => (await fs.stat(path.join(out, p))).size;
console.log(`built ${path.relative(process.cwd(), out) || out}  base ${BASE}`);
for (const m of made) {
  const size = m.path.endsWith('/') ? '' : `${String(Math.round((await bytes(m.path)) / 102.4) / 10).padStart(7)}K`;
  console.log(`  ${size} ${m.path.padEnd(26)} ${m.why}`);
}
console.log(`  ${made.filter((m) => !m.path.endsWith('/')).length} generated files · ${kit.length} in the kit · ${sessions.length} transcripts`);
