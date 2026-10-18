#!/usr/bin/env node
// Run one LATENT session from a config and write sessions/<name>.json (+ review if --review).
//   node cli/run.js --config config/agents.example.json [--seed s] [--out sessions/x.json] [--review] [--quiet]
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildRun } from '../src/runner/factory.js';
import { runSession } from '../src/runner/session.js';
import { describeEvent } from '../src/engine/engine.js';
import { reviewSession } from '../src/reviewer/review.js';
import { renderMarkdown } from '../src/reviewer/report.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));
const config = JSON.parse(await fs.readFile(args.config ?? 'config/agents.mock.json', 'utf8'));
if (args.seed) config.seed = args.seed;
if (args.rules) { // --rules config/rules/x.json : a rule diff layered over the config's rules
  const diff = JSON.parse(await fs.readFile(args.rules, 'utf8'));
  delete diff._why;
  config.rules = { ...(config.rules ?? {}), ...diff };
  config.label = `${config.label ?? 'session'} · ${path.basename(args.rules, '.json')}`;
}
const run = buildRun(config, process.env);
const names = Object.fromEntries(run.cast.map((c) => [c.id, c.name]));
const quiet = !!args.quiet;
const SHOW = new Set(['scene.enter', 'scene.frame', 'character.intro', 'action.declare', 'stakes.set', 'roll', 'outcome', 'fallout', 'clock.complete', 'clue.found', 'memory.invoke', 'memory.rewrite', 'memory.lose', 'theorize', 'beat.hit', 'stress.share', 'dialogue', 'ending', 'ending.narrate', 'character.epilogue', 'validator.flag', 'cone.change', 'algotype.reveal', 'character.dissolve']);
const t0 = Date.now();
const { session } = await runSession({
  ...run,
  hooks: {
    onEvent: (e) => {
      if (quiet || !SHOW.has(e.type)) return;
      const line = e.type === 'validator.flag' ? `  ⚑ ${e.data.kind}: ${e.data.detail}` : describeEvent(e, names) ?? e.type;
      if (e.type === 'scene.enter') console.log(`\n\x1b[1m${line}\x1b[0m`);
      else console.log(line);
    },
  },
});
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
