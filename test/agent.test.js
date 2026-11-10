import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CLI = new URL('../cli/agent.js', import.meta.url).pathname;
const ROOT = new URL('..', import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'latent-agent-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;

/** Run the CLI. `onMsg(msg, send, child)` sees every stdout message and may write to stdin; without it stdin is /dev/null. */
function agent(argv, onMsg) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...argv, '--out', path.join(tmp, `s${n++}.json`)], { cwd: ROOT, stdio: [onMsg ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const raw = []; let buf = '', err = '';
    const send = (o) => child.stdin?.write(`${typeof o === 'string' ? o : JSON.stringify(o)}\n`);
    child.stdin?.on('error', () => {});
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        raw.push(l);
        try { onMsg?.(JSON.parse(l), send, child); } catch { /* the parse test reports it */ }
      }
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`timed out; stderr: ${err}`)); }, 30000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, raw, msgs: raw.map((l) => { try { return JSON.parse(l); } catch { return null; } }), err }); });
  });
}
const SEAT = ['--seat', 'ilse2'];

test('stdout is NDJSON only: hello first, end last, every line versioned', async () => {
  const r = await agent(SEAT);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.raw.length > 10);
  r.raw.forEach((l, i) => assert.ok(r.msgs[i] && typeof r.msgs[i] === 'object', `line ${i} is not JSON: ${l.slice(0, 80)}`));
  assert.ok(r.msgs.every((m) => m.v === 1 && typeof m.type === 'string'));
  assert.equal(r.msgs[0].type, 'hello');
  assert.equal(r.msgs[0].seat, 'ilse2');
  assert.equal(r.msgs[0].protocol, 'latent.agent/1');
  assert.equal(r.msgs.at(-1).type, 'end');
  assert.ok(r.msgs.slice(1, -1).every((m) => ['event', 'request', 'preview', 'error'].includes(m.type)));
  assert.ok(r.msgs.some((m) => m.type === 'event' && typeof m.text === 'string'));
});

test('</dev/null plays through on the scripted fallback', async () => {
  const r = await agent(SEAT);
  const end = r.msgs.at(-1);
  assert.equal(end.type, 'end');
  assert.ok(end.ending, 'an ending');
  assert.ok(end.events > 100, `events ${end.events}`);
  assert.ok(fs.existsSync(end.out));
});

test('a driver answering {"default":true} reaches an end, with requests numbered from 1', async () => {
  const seen = [];
  const r = await agent(SEAT, (m, send) => { if (m.type === 'request') { seen.push(m); send({ id: m.id, default: true }); } });
  assert.equal(r.msgs.at(-1).type, 'end');
  assert.ok(r.msgs.at(-1).ending);
  assert.deepEqual(seen.map((m) => m.id), seen.map((_, i) => i + 1));
  assert.deepEqual([...new Set(seen.map((m) => m.kind))].sort(), ['act', 'epilogue', 'intro'].concat(seen.some((m) => m.kind === 'fallout') ? ['fallout'] : []).sort());
  for (const m of seen) { assert.equal(m.seat, 'ilse2'); assert.ok(m.view?.you && m.schema && m.hint); }
  assert.ok(seen.filter((m) => m.kind === 'act').every((m) => Array.isArray(m.targets) && m.targets.length));
  assert.equal(r.msgs.filter((m) => m.type === 'error').length, 0);
  assert.equal(r.msgs.at(-1).events, (await agent(SEAT)).msgs.at(-1).events, 'default answers equal silence');
});

test('stdin closing mid-session plays the rest on the fallback', async () => {
  let answered = 0;
  const r = await agent(SEAT, (m, send, child) => {
    if (m.type !== 'request') return;
    if (answered++ < 2) send({ id: m.id, default: true }); else child.stdin.end();
  });
  assert.equal(r.msgs.at(-1).type, 'end');
  assert.ok(r.msgs.at(-1).ending);
  assert.ok(answered >= 3);
});

test('a preview probe answers with the engine preview and leaves the request open', async () => {
  const previews = []; let probed = null;
  const r = await agent(SEAT, (m, send) => {
    if (m.type === 'preview') { previews.push(m); assert.equal(m.id, probed); send({ id: m.id, default: true }); }
    else if (m.type === 'request' && m.kind === 'act' && !previews.length) {
      probed = m.id;
      const t = m.targets.find((x) => /^(delve|clue|npc|clock)/.test(x.target)) ?? m.targets[0];
      send({ id: m.id, preview: { say: 'hello', do: 'look closely', target: t.target, play: [] } });
    } else if (m.type === 'request') send({ id: m.id, default: true });
  });
  assert.equal(previews.length, 1);
  const pv = previews[0].preview;
  assert.equal(pv.kind, 'act');
  assert.ok('issues' in pv && 'needsRoll' in pv && 'deck' in pv);
  if (pv.needsRoll) assert.ok(pv.pool >= 0 && pv.difficulty != null, 'a rolled action reports pool and difficulty');
  assert.equal(r.msgs.at(-1).type, 'end', 'the same request still took its answer');
  assert.equal(r.msgs.filter((m) => m.type === 'error').length, 0);
});

test('a preview on a non-act request is an error, not a crash', async () => {
  let sent = false;
  const r = await agent(SEAT, (m, send) => {
    if (m.type === 'error') send({ id: m.id, default: true });
    else if (m.type === 'request' && !sent) { sent = true; send({ id: m.id, preview: { target: 'none' } }); } else if (m.type === 'request') send({ id: m.id, default: true });
  });
  assert.ok(r.msgs.some((m) => m.type === 'error' && m.id === 1));
  assert.equal(r.msgs.at(-1).type, 'end');
});

test('malformed input, unknown ids and refused replies give errors and the session still finishes', async () => {
  let step = 0, openId = null;
  const r = await agent(SEAT, (m, send) => {
    if (m.type !== 'request') return;
    if (m.kind === 'act' && step === 0) {
      step = 1; openId = m.id;
      send('not json');
      send('');
      send({ id: 9999, default: true });
      send({ id: m.id, reply: 'nope' });
      send({ id: m.id, reply: { say: 'x', target: 'clock:no-such-clock' } }); // the engine would correct this
    }
    send({ id: m.id, default: true });
  });
  const errs = r.msgs.filter((m) => m.type === 'error');
  assert.equal(errs.length, 4, JSON.stringify(errs));
  assert.equal(errs[0].id, openId);
  assert.equal(errs[1].id, 9999);
  assert.ok(errs.every((e) => typeof e.error === 'string' && e.error));
  assert.equal(r.msgs.at(-1).type, 'end');
  assert.ok(r.msgs.at(-1).ending);
  assert.equal(r.code, 0);
});

test('a bare reply object answers the open request; force commits what the engine would correct', async () => {
  let acts = 0;
  const r = await agent(SEAT, (m, send) => {
    if (m.type !== 'request') return;
    if (m.kind === 'act' && acts++ === 0) send({ id: m.id, reply: { say: 'x', target: 'clock:no-such-clock' }, force: true });
    else if (m.kind === 'epilogue') send({ text: 'Goodnight.', memory: 'I came back different.' });
    else send({ id: m.id, default: true });
  });
  assert.equal(r.msgs.filter((m) => m.type === 'error').length, 0);
  assert.ok(r.msgs.some((m) => m.type === 'event' && /Goodnight/.test(m.text ?? '')));
  assert.equal(r.msgs.at(-1).type, 'end');
});

test('the same seed twice gives the same events and ending; another seed differs', async () => {
  const [a, b, c] = await Promise.all([['--seed', 'agent-1'], ['--seed', 'agent-1'], ['--seed', 'agent-2']].map((s) => agent([...SEAT, ...s])));
  const [ea, eb, ec] = [a, b, c].map((r) => r.msgs.at(-1));
  assert.equal(ea.events, eb.events);
  assert.equal(ea.ending, eb.ending);
  assert.deepEqual(a.msgs.filter((m) => m.type === 'event').map((m) => m.text), b.msgs.filter((m) => m.type === 'event').map((m) => m.text));
  assert.notDeepEqual(a.msgs.filter((m) => m.type === 'event').map((m) => m.text), c.msgs.filter((m) => m.type === 'event').map((m) => m.text));
  assert.equal(a.msgs[0].seed, 'agent-1');
  assert.ok(ec.ending);
});

test('--quiet drops the event lines; --watch plays no seat and asks nothing', async () => {
  const q = await agent([...SEAT, '--quiet']);
  assert.ok(q.msgs.every((m) => m.type !== 'event'));
  const w = await agent(['--watch', '--quiet']);
  assert.deepEqual(w.msgs.map((m) => m.type), ['hello', 'end']);
  assert.equal(w.msgs[0].seat, null);
  assert.equal(w.msgs[1].events, q.msgs.at(-1).events, 'a silent agent plays the scripted seat exactly');
  const wl = await agent(['--watch']);
  assert.ok(wl.msgs.some((m) => m.type === 'event') && wl.msgs.every((m) => m.type !== 'request'));
});

test('--review adds a summary to the end line', async () => {
  const r = await agent([...SEAT, '--quiet', '--review']);
  const end = r.msgs.at(-1);
  assert.ok(end.review && 'fitness' in end.review && Array.isArray(end.review.findings));
  assert.ok(fs.existsSync(end.review.json));
});

test('a seat outside the cast exits 2 with the cast on stderr and nothing on stdout', async () => {
  for (const argv of [['--seat', 'nobody'], []]) {
    const r = await agent(argv);
    assert.equal(r.code, 2);
    assert.equal(r.raw.length, 0);
    assert.match(r.err, /ilse2/);
  }
});

// A reply the engine cannot parse at all used to reach validateAction with "force", where the
// throw was nobody's to catch: the process died with no end line and no session.
test('a forced reply the engine cannot parse is an error, not a crash', async () => {
  const r = await agent([...SEAT, '--seed', 'force-crash', '--quiet'], (m, send) => {
    if (m.type !== 'request') return;
    if (m.kind === 'act') send({ id: m.id, force: true, reply: { say: '', target: 'none', theorize: { theory: 't', clues: 'not-an-array' } } });
    send({ id: m.id, default: true });
  });
  assert.equal(r.code, 0, r.err);
  const end = r.msgs.at(-1);
  assert.equal(end.type, 'end');
  assert.ok(end.ending, 'the session still has to finish');
  const errs = r.msgs.filter((l) => l?.type === 'error');
  assert.ok(errs.some((e) => /could not use that/.test(e.error)), `expected a parse error, got ${JSON.stringify(errs.slice(0, 2))}`);
});

// The timeout hands the turn to the scripted player. A reply that arrives after that must be
// refused by id, not applied to whatever request is open by then.
// (The narrower race — a reply landing while the fallback is still being computed — cannot be
// reached from here: MockPlayer resolves within a microtask, so a stdin line never interleaves.
// Give the fallback real I/O and the unqueued version crashes; see DESIGN §13.)
test('a reply that arrives after its request timed out is refused, not misapplied', async () => {
  let timedOut = 0, late = 0;
  const r = await agent([...SEAT, '--seed', 'late-1', '--quiet', '--timeout', '0.15'], (m, send) => {
    if (m.type === 'error' && /no reply in 0.15s/.test(m.error)) {
      timedOut++;
      if (timedOut === 1) setTimeout(() => send({ id: m.id, reply: { say: 'too late', target: 'none' } }), 30);
    }
    if (m.type === 'error' && /is not open|no request is open/.test(m.error)) late++;
    // answer nothing else: every turn is meant to time out
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.msgs.at(-1).type, 'end');
  assert.ok(r.msgs.at(-1).ending, 'the session still finishes');
  assert.ok(timedOut > 1, `expected several timeouts, got ${timedOut}`);
  assert.equal(late, 1, 'the late reply must be refused, exactly once, and never applied to a later turn');
});

test('a wedged client with a deadline still finishes', async () => {
  const r = await agent([...SEAT, '--seed', 'wedge-2', '--quiet', '--timeout', '0.15'], () => { /* never reply */ });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.msgs.at(-1).type, 'end');
  assert.ok(r.msgs.at(-1).events > 200);
  assert.ok(r.msgs.some((m) => m?.type === 'error' && /pass --timeout 0/.test(m.error)), 'it should say how to turn the deadline off');
});

// setTimeout holds 32-bit milliseconds. --timeout 3000000 used to overflow to 1ms, so every
// request "timed out" at once while the error line claimed it had waited 3000000 seconds.
test('a deadline too large for a timer waits instead of firing at once', async () => {
  let killer = null;
  const r = await agent([...SEAT, '--quiet', '--timeout', '3000000'], (m, send, child) => { killer ??= setTimeout(() => child.kill(), 600); });
  clearTimeout(killer);
  assert.ok(!r.msgs.some((x) => x?.type === 'error' && /no reply in/.test(x.error)), 'nothing should have timed out');
  assert.match(r.err, /longer than a timer can hold/);
  assert.ok(r.msgs.some((x) => x?.type === 'request'), 'it should have got as far as asking');
});

// The deadline is about nobody reading, not about taking your time.
test('working on a turn keeps the deadline away', async () => {
  let held = false;
  const r = await agent([...SEAT, '--seed', 'keepalive-1', '--quiet', '--timeout', '1'], (m, send) => {
    if (m.type !== 'request') return;
    if (m.kind !== 'act' || held) return send({ id: m.id, default: true });
    held = true; // once is the proof; the other seven turns need not cost a second each
    let n = 0; // probe well inside the deadline, for longer than the deadline, then answer
    const probe = setInterval(() => {
      if (++n > 6) { clearInterval(probe); return send({ id: m.id, default: true }); }
      send({ id: m.id, preview: { target: m.targets[0].target, play: [] } });
    }, 200);
  });
  assert.equal(r.code, 0, r.err);
  const previews = r.msgs.filter((x) => x?.type === 'preview');
  assert.ok(previews.length >= 6, `expected the probes to be answered, got ${previews.length}`);
  assert.ok(!r.msgs.some((x) => x?.type === 'error' && /no reply in/.test(x.error)), 'a turn being worked on must not time out');
  assert.equal(r.msgs.at(-1).type, 'end');
});
