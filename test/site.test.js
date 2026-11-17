// The public site is the only thing a visiting agent can actually reach, so what the build
// promises has to be true: a real document, text surfaces that exist, a kit that matches the
// repo, and — the part that rots fastest — docs that still describe the protocols we ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';

const repo = new URL('..', import.meta.url).pathname; // not import.meta.dirname: package.json says node >= 20, that wants 20.11
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'latent-site-'));
execFileSync(process.execPath, ['cli/site.js', out], { cwd: repo, stdio: 'pipe' });
const read = (p) => fs.readFile(path.join(out, p), 'utf8');
const exists = async (p) => !!(await fs.stat(path.join(out, p)).catch(() => null));
process.on('exit', () => { try { rmSync(out, { recursive: true, force: true }); } catch { /* best effort */ } }); // require() does not exist in an ES module

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

test('the command the site publishes works from outside the repository', async () => {
  // kit.sh writes ./latent and tells you to run `node latent/cli/agent.js --seat ilse2`, so
  // the CLI has to find its own default config rather than one in the working directory.
  const away = await fs.mkdtemp(path.join(os.tmpdir(), 'latent-away-'));
  const last = execFileSync(process.execPath, [path.join(repo, 'cli/agent.js'), '--seat', 'ilse2', '--seed', 'away-1', '--out', path.join(away, 's.json')], { cwd: away, input: '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n').pop();
  const end = JSON.parse(last);
  assert.equal(end.type, 'end');
  assert.ok(end.ending, 'it should reach an ending');
  assert.ok(end.events > 200, `only ${end.events} events`);
  await fs.rm(away, { recursive: true, force: true });
});

// ---------------------------------------------------------------- the viewer's boot order
// setTab() runs while viewer/app.js is still evaluating, and it can land on the suggest
// panel from a stored tab or a #suggest hash. Anything that path reaches has to be hoisted,
// or the module throws before window.LATENT exists and the whole page is dead.
test('the suggest panel cannot take the viewer down at boot', async () => {
  const app = await fs.readFile(path.join(repo, 'viewer/app.js'), 'utf8');
  const boot = app.indexOf('setTab(TABS.includes(hash)');
  assert.ok(boot > 0, 'the boot call moved; this test needs updating');
  for (const name of ['mountSuggest', 'suggestContext']) {
    assert.match(app, new RegExp(`^function ${name}\\(`, 'm'), `${name} must be a function declaration, not a const: setTab reaches it before its line runs`);
    assert.ok(app.indexOf(`function ${name}(`) > boot, `${name} is below the boot call, which is why it must be hoisted`);
  }
  // …and nothing they reach may be a const or let declared below the boot call either.
  // A tripwire on the mistake that was made, not a proof: it walks top-level declarations only,
  // so a destructured binding or one reached through a helper would slip past. The browser run
  // in the AGENTS.md pre-push checklist is what actually covers the behaviour.
  const late = [...app.slice(boot).matchAll(/^(?:const|let) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const bodies = ['mountSuggest', 'suggestContext'].map((n) => { const i = app.indexOf(`function ${n}(`); return app.slice(i, app.indexOf('\n}\n', i)); }).join('\n');
  for (const name of late) {
    assert.ok(!new RegExp(`\\b${name}\\b`).test(bodies), `the suggest panel reaches "${name}", declared after the boot call: booting on that tab would throw`);
  }
});

test('a session can only be loaded from this site', async () => {
  // The real predicate, lifted out of app.js and run against a stub location — a regex over
  // the source would pass just as happily with the check deleted into a comment.
  const app = await fs.readFile(path.join(repo, 'viewer/app.js'), 'utf8');
  const from = app.indexOf('const sameOrigin = ');
  assert.ok(from > 0, 'sameOrigin moved; this test needs updating');
  const src = app.slice(from, app.indexOf('\n};\n', from) + 3);
  const sameOrigin = new Function('location', `${src}\nreturn sameOrigin;`)({ href: 'https://jpka.github.io/airpg/index.html', origin: 'https://jpka.github.io' });
  for (const ok of ['sessions/first-light.json', 'sessions/a-b_c.json', 't/../sessions/x.json'.replace('../', '')]) {
    assert.equal(sameOrigin(ok), true, `${ok} is this site's own`);
  }
  for (const no of ['//evil.example/x.json', 'https://evil.example/x.json', 'http://jpka.github.io/airpg/x.json', '../../etc/passwd.json', 'sessions/x.txt', 'javascript:alert(1)//x.json', '']) {
    assert.equal(sameOrigin(no), false, `${no} must be refused`);
  }
});

test('the browser route parses a reply even when told to force it', async () => {
  // force skips the engine's *corrections*, never the parse: an unparseable reply that reaches
  // the runner aborts the session with no ending. Same contract as cli/agent.js.
  const app = await fs.readFile(path.join(repo, 'viewer/app.js'), 'utf8');
  const fn = app.slice(app.indexOf('  reply: (reply,'), app.indexOf('  default: ()'));
  assert.match(fn, /if \(p\.req\.kind === 'act'\) \{/, 'the preview must not be inside a !force branch');
  assert.match(fn, /catch \(e\) \{ throw new Error\(`the engine could not use that/);
  assert.match(fn, /if \(!force && pv\?\.issues\?\.length\)/, 'force gates the issues check only');
});

test('the request timeout cannot resolve a request that is already gone', async () => {
  // Not reachable through the CLI today — MockPlayer resolves within a microtask, so a reply
  // never lands mid-fallback — so the invariant is asserted where it lives. With a fallback
  // that does I/O, the unqueued version dies on `pending` being null. See DESIGN §13.
  const cli = await fs.readFile(path.join(repo, 'cli/agent.js'), 'utf8');
  const timer = cli.slice(cli.indexOf('pending.timer = setTimeout'), cli.indexOf('}, patience * 1000);'));
  assert.match(timer, /queue = queue\.then/, 'the timeout must share the queue with the input lines');
  assert.match(timer, /if \(pending\?\.id === id\) commit\(reply\)/, 'and re-check after awaiting the fallback');
  assert.match(cli, /const commit = \(reply\) => \{ const p = pending; if \(!p\) return false;/, 'commit must be a no-op on an already-answered request');
});

test('kit.sh survives a transient failure from the host', async () => {
  // Found in production: one file of the 38 came back 503, and `set -e` aborted the whole
  // fetch, leaving half a kit and no useful message. Costs ~2s for curl's retry delay, which
  // is worth it for the one command an agent that found this on a web page actually runs.
  const http = await import('node:http');
  let refused = false;
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
    if (!refused && rel.endsWith('.js')) { refused = true; res.writeHead(503); return res.end('nope'); }
    fs.readFile(path.join(repo, rel)).then((b) => { res.writeHead(200); res.end(b); }, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'latent-kit-'));
  try {
    // Not execFileSync: it blocks this process's event loop, and the server curl is talking
    // to lives in it, so the two would wait on each other for ever.
    await new Promise((resolve, reject) => {
      execFile('sh', [path.join(out, 'kit.sh'), 'latent'], { cwd: dir, env: { ...process.env, BASE: `http://127.0.0.1:${server.address().port}/`, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } }, (err, _o, stderr) => (err ? reject(new Error(`kit.sh failed: ${stderr || err.message}`)) : resolve()));
    });
    assert.ok(refused, 'the server was supposed to refuse once');
    const { files } = JSON.parse(await read('files.json'));
    for (const f of files) assert.ok(await fs.stat(path.join(dir, 'latent', f.path)).catch(() => null), `${f.path} is missing from the kit`);
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the suggestion box
test('feedback is composed safely, whatever it is handed', async () => {
  const { compose, KIND } = await import(path.join(repo, 'viewer/suggest.js'));
  const evil = compose({ kind: 'x; touch /tmp/latent-pwned #', note: "it's bad", title: '$(whoami) `id`' });
  assert.deepEqual(evil.labels, ['agent-feedback', 'other'], 'an unknown kind must not reach a shell as itself');
  assert.ok(!/touch \/tmp\/latent-pwned/.test(evil.gh.split("--title")[0].replace(/'[^']*'/g, '')), 'the label must be quoted or dropped');
  for (const cmd of [evil.gh, evil.curl]) {
    const unquoted = cmd.replace(/'(?:[^']|'\\'')*'/g, "''"); // strip single-quoted runs
    assert.ok(!/\$\(|`|;\s*touch/.test(unquoted), `unquoted shell metacharacters in: ${unquoted.slice(0, 120)}`);
  }
  assert.ok(KIND.some(([k]) => k === 'rules'));
  const ok = compose({ kind: 'rules', note: 'searching never pays for itself' });
  assert.deepEqual(ok.labels, ['agent-feedback', 'rules']);
  assert.equal(ok.title, 'searching never pays for itself');
  assert.match(ok.url, /^https:\/\/github\.com\/jpka\/airpg\/issues\/new\?/);
  assert.ok(new URL(ok.url).searchParams.get('body').includes('searching never pays for itself'));
  assert.ok(!compose({ note: 'x' }).tooLong);
  assert.ok(compose({ note: 'é'.repeat(5000) }).tooLong, 'a note too long for a GET must say so');
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
