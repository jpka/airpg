// Tension and affect curves reconstructed purely from the event log.
// Tension ≈ threat-clock fill + stress load + live stakes (a Dramatis-flavoured
// suspense term: how few "escape routes" — dice, memories, allies — the actor has).
// Affect ≈ lexicon valence of narration blended with mechanical valence.

import { words } from '../engine/core.js';

const POS = new Set('open opens opened light gift gives gave holds held heal healed mend mended whole warm warmth listen listens listened tender kind safe relief relieved release released found finds clear clean bloom blooms home together agree agrees yes alive grows grow younger understand understood answer answered breathe breath exhale welcome joy hope remember remembers belong bridge saved save free freed true truth gentle soft finish finished complete'.split(' '));
const NEG = new Set('fail fails failed lose loses lost loss gone erase erased tear torn break broken breaks shatter crack cracks trap trapped wrong cold fear afraid dread wound wounds bleed bleeds pain hurt hurts collapse collapses dissolve dissolves narrow narrows fray frays frayed static scream screams alone empty hunger hungry cost costs leak leaking leaks folds fold pull pulls dark darker teeth rot rotting basin used against forget forgot forgotten gap missing never'.split(' '));

export function lexValence(text) {
  const w = words(text);
  if (!w.length) return 0;
  let p = 0, n = 0;
  for (const x of w) { if (POS.has(x)) p++; else if (NEG.has(x)) n++; }
  if (!p && !n) return 0;
  return (p - n) / (p + n);
}

const MECH = {
  roll: (e) => ({ crit: 1, success: 0.5, cost: 0.1, fail: -0.5, critFail: -1 }[e.data.band] ?? 0),
  fallout: (e) => (e.data.severity === 'major' ? -1 : -0.5),
  'beat.hit': (e) => (e.data.tier === 'major' ? 0.8 : 0.4),
  'clue.found': () => 0.3,
  theorize: (e) => (e.data.result === 'false' ? -1 : 1),
  'memory.lose': () => -0.8,
  'character.dissolve': () => -1,
  'clock.complete': (e) => (e.data.kind === 'threat' || e.data.kind === 'cosmic' ? -1 : 0.8),
  'stress.share': () => 0.3,
  'stress.heal': () => 0.3,
  'npc.moved': () => 0.4,
  'cone.change': (e) => Math.sign((e.data.after.reach + e.data.after.horizon) - (e.data.before.reach + e.data.before.horizon)) * 0.4,
};

const TEXT_TYPES = new Set(['scene.frame', 'outcome', 'character.intro', 'dialogue', 'ending.narrate', 'character.epilogue', 'fallout']);

export function eventText(e) {
  if (!TEXT_TYPES.has(e.type)) return '';
  return e.type === 'fallout' ? `${e.data.text} ${e.data.narration ?? ''}` : e.data.text ?? '';
}

export function computeCurves(session) {
  const ev = session.events;
  const start = ev.find((e) => e.type === 'session.start');
  const cast = start?.data.cast.map((c) => c.id) ?? [];
  const stress = Object.fromEntries(cast.map((id) => [id, { substrate: 0, coherence: 0, memory: 0, boundary: 0, reach: 0 }]));
  const clocks = Object.fromEntries((start?.data.clocks ?? []).map((c) => [c.id, { value: c.value, size: c.size, kind: c.kind }]));
  let stakesPressure = 0;
  let affect = 0;
  const tension = [];
  const affectCurve = [];
  const total = (id) => Object.values(stress[id] ?? {}).reduce((a, b) => a + b, 0);
  for (const e of ev) {
    const d = e.data;
    switch (e.type) {
      case 'stress': if (stress[e.actor]) stress[e.actor][d.resistance] = d.value; break;
      case 'fallout':
        if (stress[e.actor]) {
          if (d.severity === 'minor') stress[e.actor][d.resistance] = 0;
          else for (const k of Object.keys(stress[e.actor])) stress[e.actor][k] = 0;
        }
        break;
      case 'stress.heal': if (stress[d.target]) stress[d.target][d.resistance] = Math.max(0, stress[d.target][d.resistance] - d.amount); break;
      case 'haunt.rest': if (stress[e.actor]) stress[e.actor][d.resistance] = Math.max(0, stress[e.actor][d.resistance] - d.cleared); break;
      case 'clock.tick': clocks[d.clock] = { value: d.value, size: d.size, kind: d.kind }; break;
      case 'scene.enter': if (d.clock) clocks[d.clock.id] = { value: d.clock.value, size: d.clock.size, kind: 'delve' }; break;
      case 'stakes.set': {
        const pr = { controlled: 0.33, risky: 0.66, desperate: 1 }[d.position] ?? 0.5;
        const pool = d.pool ?? 2;
        const routes = Math.min(1, pool / 5); // more dice = more escape routes (Dramatis analogue)
        stakesPressure = Math.max(stakesPressure, pr * (1 - 0.5 * routes) + (d.difficulty === 'dangerous' ? 0.2 : d.difficulty === 'risky' ? 0.1 : 0));
        break;
      }
      case 'theorize': stakesPressure = Math.max(stakesPressure, 0.8); break;
      case 'outcome': stakesPressure *= 0.35; break;
      default: break;
    }
    const threats = Object.values(clocks).filter((c) => c.kind === 'threat' || c.kind === 'cosmic');
    const threatFill = threats.length ? Math.max(...threats.map((c) => c.value / c.size)) : 0;
    const load = cast.length ? cast.reduce((s, id) => s + Math.min(1, total(id) / 12), 0) / cast.length : 0;
    const t = 0.35 * threatFill + 0.3 * load + 0.35 * Math.min(1, stakesPressure);
    tension.push(+t.toFixed(4));
    const text = eventText(e);
    const lv = text ? lexValence(text) : 0;
    const mv = MECH[e.type] ? MECH[e.type](e) : 0;
    const v = 0.5 * lv + mv;
    if (v) affect = affect * 0.9 + v; // leaky integrator: "fortune" of the protagonists
    affectCurve.push(+affect.toFixed(4));
  }
  return { tension, affect: affectCurve };
}

// ---------------- Arc shapes (Reagan et al. 2016) ----------------

const pw = (pts) => (x) => {
  const n = pts.length - 1;
  const k = Math.min(n - 1, Math.floor(x * n));
  const t = x * n - k;
  return pts[k] * (1 - t) + pts[k + 1] * t;
};
const SHAPES = {
  'rags to riches (rise)': (x) => x,
  'tragedy (fall)': (x) => -x,
  'man in a hole (fall–rise)': (x) => -Math.sin(Math.PI * x),
  'Icarus (rise–fall)': (x) => Math.sin(Math.PI * x),
  'Cinderella (rise–fall–rise)': pw([0, 1, 0.3, 1.3]),
  'Oedipus (fall–rise–fall)': pw([0, -1, -0.3, -1.3]),
};

export function resample(series, n = 20) {
  if (!series.length) return Array(n).fill(0);
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = Math.floor((k / n) * series.length);
    const b = Math.max(a + 1, Math.floor(((k + 1) / n) * series.length));
    const slice = series.slice(a, b);
    out.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  return out;
}

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function classifyArc(affect) {
  const r = resample(affect, 20);
  const xs = r.map((_, i) => i / (r.length - 1));
  const scores = Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, +corr(r, xs.map(f)).toFixed(3)]));
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { shape: best[0], fit: best[1], scores, resampled: r.map((v) => +v.toFixed(3)) };
}
