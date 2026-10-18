#!/usr/bin/env node
// Review a session file:  node cli/review.js sessions/x.json [--judge config.json]
import fs from 'node:fs/promises';
import { reviewSession } from '../src/reviewer/review.js';
import { renderMarkdown } from '../src/reviewer/report.js';
import { judgeSession } from '../src/reviewer/judge.js';
import { providerFromConfig } from '../src/agents/llm.js';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: node cli/review.js <session.json> [--judge <config.json>]'); process.exit(1); }
const session = JSON.parse(await fs.readFile(file, 'utf8'));
const review = reviewSession(session);
const ji = rest.indexOf('--judge');
if (ji >= 0) {
  const cfg = JSON.parse(await fs.readFile(rest[ji + 1], 'utf8'));
  const jc = cfg.judge ?? cfg.gm;
  const provider = providerFromConfig(cfg.providers[jc.provider], process.env);
  review.judge = await judgeSession(session, provider, { model: jc.model });
}
const base = file.replace(/\.json$/, '');
await fs.writeFile(`${base}.review.json`, JSON.stringify(review, null, 2));
await fs.writeFile(`${base}.review.md`, renderMarkdown(review));
console.log(renderMarkdown(review));
