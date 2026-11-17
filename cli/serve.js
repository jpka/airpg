#!/usr/bin/env node
// Serve the viewer locally:  node cli/serve.js [port] [dir]  → http://localhost:8787
// index.html is written as a claude.ai Artifact body, so it gets the same document wrapper
// the public site uses (cli/html.js) — what you see here is what deploys. Point it at a
// built site (`node cli/site.js _site && node cli/serve.js 8787 _site`) to check that too:
// anything that already starts with a doctype is served untouched.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { page } from './html.js';
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const port = +(process.argv[2] ?? 8787);
const root = path.resolve(repo, process.argv[3] ?? '.');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.md': 'text/markdown', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.sh': 'text/plain', '.png': 'image/png' };
const sessions = JSON.parse(await fs.readFile(path.join(repo, 'sessions/index.json'), 'utf8')).map((m) => ({ ...m, slug: path.basename(m.file, '.json') }));
http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) throw new Error('forbidden');
    let body = await fs.readFile(file);
    if (p.endsWith('.html') && !body.toString(undefined, 0, 32).trim().toLowerCase().startsWith('<!doctype')) body = page(body.toString(), { sessions, discovery: true });
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`LATENT viewer on http://localhost:${port}`));
