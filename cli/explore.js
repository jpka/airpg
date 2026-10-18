#!/usr/bin/env node
// node cli/explore.js [--iterations 120] [--initial 24] [--out explorer/] [--llm config.json --llm-every 10]
import fs from 'node:fs/promises';
import { explore, renderExplorerMarkdown } from '../src/explorer/mapelites.js';
import { providerFromConfig } from '../src/agents/llm.js';
const a = Object.fromEntries(process.argv.slice(2).map((x, i, arr) => x.startsWith('--') ? [x.slice(2), arr[i + 1]] : null).filter(Boolean));
let llm = null;
if (a.llm) { const cfg = JSON.parse(await fs.readFile(a.llm, 'utf8')); llm = providerFromConfig(cfg.providers[cfg.gm.provider], process.env); }
const out = a.out ?? 'explorer';
const t0 = Date.now();
const res = await explore({ iterations: +(a.iterations ?? 120), initial: +(a.initial ?? 24), llm, llmEvery: +(a['llm-every'] ?? 0), onProgress: ({ it, cells }) => { if (it % 20 === 0) process.stderr.write(`  it ${it} · ${cells} cells\n`); } });
await fs.mkdir(out, { recursive: true });
await fs.writeFile(`${out}/archive.json`, JSON.stringify(res, null, 2));
const md = renderExplorerMarkdown(res);
await fs.writeFile(`${out}/report.md`, md);
console.log(md);
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
