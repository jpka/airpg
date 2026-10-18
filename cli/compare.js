#!/usr/bin/env node
// Compare reviews side by side:  node cli/compare.js sessions/a.review.json sessions/b.review.json [...]
import fs from 'node:fs/promises';
const files = process.argv.slice(2);
if (files.length < 2) { console.error('usage: node cli/compare.js <a.review.json> <b.review.json> [...]'); process.exit(1); }
const rs = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(f, 'utf8'))));
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const rows = [
  ['rules', (r) => r.session.config?.rules && Object.keys(r.session.config.rules).length ? JSON.stringify(r.session.config.rules) : 'default'],
  ['ending', (r) => r.session.ending],
  ['theory canon', (r) => (r.session.theory ? 'yes' : 'no')],
  ['rolls', (r) => r.metrics.rolls],
  ['talk-only turns', (r) => r.metrics.talkOnly],
  ['agency', (r) => pct(r.metrics.agency)],
  ['any-success', (r) => pct(r.metrics.anySuccess)],
  ['desperate success', (r) => (r.metrics.byPosition.desperate ? `${pct(r.metrics.byPosition.desperate.rate)} (n=${r.metrics.byPosition.desperate.n})` : '—')],
  ['fallouts (major)', (r) => `${r.metrics.fallouts.total} (${r.metrics.fallouts.major})`],
  ['beats', (r) => `${r.metrics.beats.hit}/${r.metrics.beats.declared}`],
  ['memory invocations', (r) => r.metrics.memory.invocations],
  ['rests at haunts', (r) => r.metrics.memory.rests],
  ['guards / shares', (r) => `${r.metrics.mechanicsUsed['guard.set'] ?? 0} / ${r.metrics.mechanicsUsed['stress.share'] ?? 0}`],
  ['acts on entities', (r) => r.metrics.mechanicsUsed['choice.persuade'] ?? '—'],
  ['engine intent flags', (r) => r.metrics.flags.intent ?? 0],
  ['dead choices', (r) => r.metrics.deadMechanics.join(', ') || 'none'],
  ['repetition', (r) => pct(r.metrics.narration.repetition)],
  ['arc', (r) => r.arc.shape],
  ['fitness', (r) => r.fitness],
];
const head = ['', ...rs.map((r) => r.session.label ?? r.session.seed)];
console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`);
for (const [k, f] of rows) console.log(`| ${k} | ${rs.map((r) => String(f(r))).join(' | ')} |`);
