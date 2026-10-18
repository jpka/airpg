#!/usr/bin/env node
// Seat-side helper for the file bridge, so an external agent can play one seat.
//   node cli/bridge.js wait   --seat gm [--dir bridge] [--timeout 540]   → prints next request (id, system, prompt)
//   node cli/bridge.js answer --seat gm --id 0003 [--dir bridge] < reply.json
// The runner writes   <dir>/req-<seat>-<id>.json   and waits for   <dir>/res-<seat>-<id>.txt
import fs from 'node:fs';
import path from 'node:path';
const [cmd, ...rest] = process.argv.slice(2);
const a = Object.fromEntries(rest.map((x, i, arr) => x.startsWith('--') ? [x.slice(2), arr[i + 1]] : null).filter(Boolean));
const dir = a.dir ?? 'bridge';
const seat = a.seat;
if (!seat) { console.error('--seat required'); process.exit(2); }
if (cmd === 'wait') {
  const until = Date.now() + 1000 * +(a.timeout ?? 540);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'SESSION_OVER'))) { console.log('SESSION OVER'); process.exit(0); }
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(`req-${seat}-`)).sort() : [];
    const pending = files.find((f) => !fs.existsSync(path.join(dir, f.replace('req-', 'res-').replace('.json', '.txt'))));
    if (pending) {
      const req = JSON.parse(fs.readFileSync(path.join(dir, pending), 'utf8'));
      const id = pending.match(/-(\d+)\.json$/)[1];
      console.log(`REQUEST id=${id} seat=${seat} tag=${req.tag}\n\n=== SYSTEM ===\n${req.system}\n\n=== PROMPT ===\n${req.prompt}\n\n(answer with: node cli/bridge.js answer --seat ${seat} --id ${id} <<'EOF' ... EOF)`);
      process.exit(0);
    }
    if (Date.now() > until) { console.log('NO REQUEST YET (timeout) — run wait again'); process.exit(0); }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
}
if (cmd === 'answer') {
  const body = fs.readFileSync(0, 'utf8');
  const out = path.join(dir, `res-${seat}-${a.id}.txt`);
  fs.writeFileSync(out, body);
  console.log(`answered ${out} (${body.length} chars)`);
}
