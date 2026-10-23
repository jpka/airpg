#!/usr/bin/env node
// Measure rule variants over many scripted sessions, side by side (the numbers in docs/DESIGN.md).
//   node cli/measure.js [--seeds 40] [--casts choir,sort7,ilse2/regent,lattice,sort7]
//                       [--rules '{"cluesFromEntities":0}' --rules config/rules/x.json ...] [--json]
// Each --rules is one column (a diff over DEFAULT_RULES, inline JSON or a file); none means the defaults.
// Seed i plays cast i mod (number of casts), so 40 seeds over two casts is 20 sessions each.
import fs from 'node:fs';
import path from 'node:path';
import { runSession } from '../src/runner/session.js';
import { reviewSession } from '../src/reviewer/review.js';
import { MockGM, MockPlayer } from '../src/agents/agents.js';
import { APERTURE } from '../src/content/aperture.js';
import { ENTITIES } from '../src/content/entities.js';

const argv = process.argv.slice(2);
const multi = (k) => argv.flatMap((x, i) => (x === `--${k}` && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const one = (k, d) => multi(k).at(-1) ?? d;
const seeds = +one('seeds', 40);
const casts = one('casts', 'choir,sort7,ilse2/regent,lattice,sort7').split('/').map((c) => c.split(','));
const variants = (multi('rules').length ? multi('rules') : ['{}']).map((r) => {
  const diff = r.trim().startsWith('{') ? JSON.parse(r) : JSON.parse(fs.readFileSync(r, 'utf8'));
  delete diff._why;
  return { label: r.trim().startsWith('{') ? (r.trim() === '{}' ? 'defaults' : r.trim()) : path.basename(r, '.json'), diff };
});

async function measure(diff) {
  const t = { sessions: 0, rolls: 0, dice: 0, success: 0, fallouts: 0, majors: 0, canon: 0, theorized: 0, theories: 0, accepted: 0, invokes: 0, guards: 0, clues: 0, entityClues: 0, searches: 0, npcActs: 0, npcMoved: 0, intentFlags: 0, fitness: 0, endings: {} };
  for (let i = 0; i < seeds; i++) {
    const seed = `measure-${i}`;
    const cast = casts[i % casts.length].map((id) => ENTITIES[id]);
    const players = Object.fromEntries(cast.map((c) => [c.id, new MockPlayer({ id: c.id, seed })]));
    const { session } = await runSession({ scenario: APERTURE, cast, rules: diff, seed, gm: new MockGM({ seed }), players });
    const ev = session.events;
    const by = (type) => ev.filter((e) => e.type === type);
    const rolls = by('roll');
    const theo = by('theorize');
    const declares = by('action.declare');
    t.sessions++;
    t.rolls += rolls.length;
    t.dice += rolls.reduce((s, e) => s + e.data.dice.length, 0);
    t.success += rolls.filter((e) => ['cost', 'success', 'crit'].includes(e.data.band)).length;
    t.fallouts += by('fallout').length;
    t.majors += by('fallout').filter((e) => e.data.severity === 'major').length;
    t.canon += session.final?.theory ? 1 : 0;
    t.theorized += theo.length ? 1 : 0;
    t.theories += theo.length;
    t.accepted += theo.reduce((s, e) => s + e.data.accepted.length, 0);
    t.invokes += by('memory.invoke').length;
    t.guards += by('guard.set').length;
    t.clues += by('clue.found').length;
    t.entityClues += by('clue.found').filter((e) => e.data.source?.startsWith('npc:')).length;
    t.searches += declares.filter((e) => e.data.target?.type === 'clue').length;
    t.npcActs += declares.filter((e) => e.data.target?.type === 'npc' && e.data.needsRoll).length;
    t.npcMoved += by('npc.moved').length;
    t.intentFlags += by('validator.flag').filter((e) => e.data.kind === 'intent').length;
    t.fitness += +reviewSession(session).fitness;
    const ending = session.final?.ending ?? 'none';
    t.endings[ending] = (t.endings[ending] ?? 0) + 1;
  }
  return t;
}

const results = [];
for (const v of variants) results.push({ ...v, t: await measure(v.diff) });
if (argv.includes('--json')) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

const pct = (x) => `${Math.round(x * 100)}%`;
const per = (k) => (r) => (r.t[k] / r.t.sessions).toFixed(2);
const endings = [...new Set(results.flatMap((r) => Object.keys(r.t.endings)))].sort();
const rows = [
  ['Mean dice pool', (r) => (r.t.dice / r.t.rolls).toFixed(2)],
  ['Any-success', (r) => pct(r.t.success / r.t.rolls)],
  ['Fallout per roll', (r) => (r.t.fallouts / r.t.rolls).toFixed(2)],
  ['Major fallouts / session', per('majors')],
  ['Theory became canon', (r) => pct(r.t.canon / r.t.sessions)],
  ['Sessions with a theory proposed', (r) => pct(r.t.theorized / r.t.sessions)],
  ['Theorize rolls / session', per('theories')],
  ['Clues accepted / theorize roll', (r) => (r.t.theories ? (r.t.accepted / r.t.theories).toFixed(2) : '—')],
  ['Clues / session', per('clues')],
  ['… of them from entities', per('entityClues')],
  ['Searches / session', per('searches')],
  ['Rolls on entities / session (moved)', (r) => `${per('npcActs')(r)} (${per('npcMoved')(r)})`],
  ['Memory invocations / session', per('invokes')],
  ['Guards / session', per('guards')],
  ['Engine intent flags / session', per('intentFlags')],
  ...endings.map((e) => [`Ending: ${e}`, (r) => pct((r.t.endings[e] ?? 0) / r.t.sessions)]),
  ['Fitness (reviewer composite)', (r) => (r.t.fitness / r.t.sessions).toFixed(2)],
];
console.log(`${seeds} scripted seeds over ${casts.length} cast(s): ${casts.map((c) => c.join(' + ')).join(' / ')}\n`);
console.log(`| | ${results.map((r) => r.label).join(' | ')} |\n|---|${results.map(() => '---').join('|')}|`);
for (const [k, f] of rows) console.log(`| ${k} | ${results.map(f).join(' | ')} |`);
