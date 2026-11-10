// The public site is the only thing a visiting agent can actually reach, so what the build
// promises has to be true: a real document, text surfaces that exist, a kit that matches the
// repo, and — the part that rots fastest — docs that still describe the protocols we ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'latent-site-'));
execFileSync(process.execPath, ['cli/site.js', out], { cwd: repo, stdio: 'pipe' });
const read = (p) => fs.readFile(path.join(out, p), 'utf8');
const exists = async (p) => !!(await fs.stat(path.join(out, p)).catch(() => null));
process.on('exit', () => { try { require('node:fs').rmSync(out, { recursive: true, force: true }); } catch { /* best effort */ } });

test('the page is a real document, not an artifact body', async () => {
  const html = await read('index.html');
  assert.ok(html.startsWith('<!doctype html>'), 'needs a doctype, or Pages serves it in quirks mode');
  assert.equal(html.match(/<title>/g).length, 1, 'exactly one title');
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/jpka\.github\.io\/airpg\/">/);
  assert.match(html, /<meta name="description" content=".{80,300}">/);
  assert.ok(html.indexOf('<head>') < html.indexOf('<style>'), 'the stylesheet link belongs in the head');
});

test('structured data describes the game, the code and the logs', async () => {
  const html = await read('index.html');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(ld['@graph'].map((n) => n['@type']), ['VideoGame', 'SoftwareSourceCode', 'Dataset']);
  const sessions = JSON.parse(await fs.readFile(path.join(repo, 'sessions/index.json'), 'utf8'));
  assert.match(ld['@graph'][2].description, new RegExp(`^${sessions.length} complete sessions`));
});

test('a reader without JavaScript still gets the pitch and the ways in', async () => {
  const html = await read('index.html');
  const crawl = html.match(/<div id="crawl">([\s\S]*?)<\/div>\n/)[1];
  for (const href of ['play.txt', 'suggest.txt', 'llms.txt', 't/index.txt', 'ai.txt']) assert.ok(crawl.includes(`href="${href}"`), `the crawlable block should link ${href}`);
  assert.ok(crawl.replace(/<[^>]+>/g, ' ').split(/\s+/).length > 180, 'enough text to be worth indexing');
  assert.match(html, /#crawl\{display:none\}/, 'and it stays out of the way when the app runs');
});

test('every text surface the site advertises exists', async () => {
  for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'ai.txt', 'play.txt', 'suggest.txt', 'agents.json', 'kit.sh', 'files.json', 't/index.txt', '.well-known/llms.txt', '.well-known/agents.json', '.nojekyll']) {
    assert.ok(await exists(f), `${f} is missing from the build`);
  }
  assert.equal(await read('llms.txt'), await read('.well-known/llms.txt'));
});

test('robots.txt allows everyone, by name, and points at the sitemap', async () => {
  const txt = await read('robots.txt');
  assert.match(txt, /Sitemap: https:\/\/jpka\.github\.io\/airpg\/sitemap\.xml/);
  const groups = txt.split(/\n\n+/).filter((g) => g.startsWith('User-agent:'));
  assert.ok(groups.length > 20, 'the named crawlers are the point');
  for (const g of groups) assert.match(g, /\nAllow: \/$/, `every group must allow: ${g.split('\n')[0]}`);
  assert.ok(!/Disallow: \//.test(txt), 'nothing here is disallowed');
  for (const ua of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot', 'CCBot']) assert.ok(txt.includes(`User-agent: ${ua}\n`), `${ua} should find itself`);
});

test('every sitemap URL is a file that was built', async () => {
  const locs = [...(await read('sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 15);
  for (const loc of locs) {
    const rel = loc.replace('https://jpka.github.io/airpg/', '') || 'index.html';
    assert.ok(await exists(rel), `${loc} is in the sitemap but not in the build`);
  }
});

test('the kit matches the repository, byte for byte', async () => {
  const { files, base } = JSON.parse(await read('files.json'));
  assert.equal(base, 'https://jpka.github.io/airpg/');
  assert.ok(files.length > 25);
  for (const f of files) {
    const buf = await fs.readFile(path.join(repo, f.path)); // the kit is fetched from the site, so it must also be published
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), f.sha256, `${f.path} digest`);
    assert.ok(await exists(f.path), `${f.path} is in the kit but not published`);
  }
  const listed = (await read('kit.sh')).match(/^FILES='(.+)'$/m)[1].split(' ');
  assert.deepEqual(listed, files.map((f) => f.path), 'kit.sh and files.json must agree');
  for (const entry of ['cli/agent.js', 'src/engine/engine.js', 'config/agents.mock.json', 'package.json']) assert.ok(listed.includes(entry), `the kit needs ${entry}`);
});

test('each session is published as a transcript a reader can use', async () => {
  const sessions = JSON.parse(await fs.readFile(path.join(repo, 'sessions/index.json'), 'utf8'));
  const index = await read('t/index.txt');
  for (const s of sessions) {
    const slug = path.basename(s.file, '.json');
    const txt = await read(`t/${slug}.txt`);
    assert.ok(txt.length > 4000, `${slug} transcript looks empty`);
    assert.match(txt, /\nseed: \S+/);
    assert.match(txt, /^\s+\d+ {2}\S/m, 'events are numbered lines');
    assert.ok(index.includes(`${slug}.txt`), `${slug} is missing from t/index.txt`);
  }
});

test('--base builds the same site somewhere else', async () => {
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'latent-base-'));
  execFileSync(process.execPath, ['cli/site.js', other, '--base', 'https://example.test/x/'], { cwd: repo, stdio: 'pipe' });
  const html = await fs.readFile(path.join(other, 'index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/x\/">/);
  assert.match(await fs.readFile(path.join(other, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example\.test\/x\/sitemap\.xml/);
  await fs.rm(other, { recursive: true, force: true });
});

// ---------------------------------------------------------------- docs vs code
test('play.txt documents the protocol cli/agent.js actually speaks', async () => {
  const doc = await read('play.txt');
  const log = execFileSync(process.execPath, ['cli/agent.js', '--seat', 'ilse2', '--out', path.join(out, 'probe.json')], { cwd: repo, input: 'not json\n{"id":99,"reply":{}}\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  const types = new Set(log.trim().split('\n').map((l) => JSON.parse(l).type));
  assert.deepEqual([...types].sort(), ['end', 'error', 'event', 'hello', 'request'], 'the run should exercise every message type but preview');
  for (const t of [...types, 'preview']) assert.match(doc, new RegExp(`^ {2}out {2}${t}\\b`, 'm'), `play.txt does not document the "${t}" message`);
  const hello = JSON.parse(log.split('\n')[0]);
  assert.ok(doc.includes(hello.protocol), `play.txt should name the protocol id ${hello.protocol}`);
  assert.equal(hello.docs, 'https://jpka.github.io/airpg/play.txt');
  for (const key of Object.keys(hello).filter((k) => !['v', 'type'].includes(k))) assert.ok(doc.includes(key), `play.txt should mention hello.${key}`);
});

test('play.txt documents the browser API the viewer exposes', async () => {
  const doc = await read('play.txt');
  const app = await fs.readFile(path.join(repo, 'viewer/app.js'), 'utf8');
  const api = app.slice(app.indexOf('const LATENT = {'), app.indexOf('window.LATENT = LATENT;'));
  const documented = new Set([...doc.matchAll(/LATENT\.(\w+)/g)].map((m) => m[1]));
  assert.ok(documented.size >= 10, 'the browser route is barely documented');
  for (const name of documented) assert.match(api, new RegExp(`\\n  ${name}[:(]`), `play.txt promises LATENT.${name}, which the viewer does not define`);
});

test('the suggestion box points somewhere real', async () => {
  const suggest = await read('suggest.txt');
  assert.match(suggest, /https:\/\/github\.com\/jpka\/airpg\/issues/);
  assert.match(suggest, /agent-feedback/);
  const form = await fs.readFile(path.join(repo, '.github/ISSUE_TEMPLATE/agent-feedback.yml'), 'utf8');
  assert.match(form, /labels: \["agent-feedback"\]/);
  // a pre-filled ?body= link only works while blank issues are allowed
  assert.match(await fs.readFile(path.join(repo, '.github/ISSUE_TEMPLATE/config.yml'), 'utf8'), /blank_issues_enabled: true/);
});
