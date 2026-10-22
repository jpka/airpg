// Design Explorer: MAP-Elites (Mouret & Clune 2015) over rule variants.
// Genome = { rules: diff over DEFAULT_RULES, policy: scripted-agent play-style }.
// Fitness and behavioural descriptors come from the automated reviewer, so the
// archive maps *what kinds of sessions* each rule-set produces, not one "best" game.
import { runSession } from '../runner/session.js';
import { reviewSession } from '../reviewer/review.js';
import { MockGM, MockPlayer, MockValidator } from '../agents/agents.js';
import { APERTURE } from '../content/aperture.js';
import { ENTITIES } from '../content/entities.js';
import { createRng } from '../engine/core.js';
import { extractJson } from '../agents/parse.js';

// Mutable parameters with ranges. Paths are dotted into DEFAULT_RULES.
export const SPACE = {
  'fallout.minorMax': [3, 4, 5, 6, 7, 8],
  'stressDie.risky': [4, 6, 8],
  'stressDie.desperate': [6, 8, 10],
  'effectDie.standard': [4, 6, 8],
  'theorize.complexity': [2, 3, 4, 5, 6],
  memoryInvokeBonus: [0, 1, 2],
  'roundsPerScene.delve': [1, 2, 3],
  'roundsPerScene.landmark': [1, 2],
  cohesionForSharedCone: [2, 3, 4, 5],
  'difficultyByTier.3': ['standard', 'risky', 'dangerous'],
  majorsToDissolve: [2, 3, 4],
  delveScale: [0.6, 0.8, 1, 1.2, 1.5],
  'clockSizes.ingression': [6, 8, 10, 12],
  'clockSizes.attractor': [4, 6, 8],
  'deck.handBase': [2, 3, 4],
  'deck.edgesPerTurn': [1, 2, 3],
};
export const POLICY = { harshness: [0.2, 0.5, 0.8], cooperation: [0.1, 0.4, 0.7] };

export const DEFAULT_DIMS = [
  { key: 'successRate', label: 'any-success rate', bins: [0.3, 0.45, 0.55, 0.65, 0.75] },   // 6 cells
  { key: 'memoryLoss', label: 'memories lost per entity', bins: [0.25, 0.75, 1.25, 2] },     // 5 cells
];

function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] ??= {};
  o[ks.at(-1)] = v;
}

export function randomGenome(rng) {
  const g = { rules: {}, policy: {} };
  for (const [k, vals] of Object.entries(SPACE)) if (rng.next() < 0.35) setPath(g.rules, k, rng.pick(vals));
  for (const [k, vals] of Object.entries(POLICY)) g.policy[k] = rng.pick(vals);
  return g;
}

export function mutate(genome, rng, n = 2) {
  const g = JSON.parse(JSON.stringify(genome));
  const keys = Object.keys(SPACE);
  for (let i = 0; i < n; i++) { const k = rng.pick(keys); setPath(g.rules, k, rng.pick(SPACE[k])); }
  if (rng.next() < 0.3) { const k = rng.pick(Object.keys(POLICY)); g.policy[k] = rng.pick(POLICY[k]); }
  return g;
}

/** ELM-style mutation: ask an LLM to propose a rule diff given an elite's review. */
export async function llmMutate(genome, review, provider) {
  const prompt = [
    'You are iterating on the rules of LATENT, an AI-played RPG. Propose ONE small rule change that addresses the weakest findings below while keeping what works.',
    `Mutable parameters and allowed values: ${JSON.stringify(SPACE)}`,
    `Current rule diff: ${JSON.stringify(genome.rules)}`,
    `Findings: ${JSON.stringify(review.findings.filter((f) => f.severity !== 'info').map((f) => `${f.severity}: ${f.title} — ${f.detail}`).slice(0, 12))}`,
    'Return JSON: {"set": {"dotted.param": value}, "why": string}',
  ].join('\n');
  const raw = await provider.complete({ system: 'Reply with ONLY JSON.', prompt, temperature: 0.7, maxTokens: 300 });
  const d = extractJson(raw);
  const g = JSON.parse(JSON.stringify(genome));
  for (const [k, v] of Object.entries(d?.set ?? {})) if (SPACE[k]?.includes(v)) setPath(g.rules, k, v);
  return { genome: g, why: d?.why ?? '' };
}

export async function evaluate(genome, { seeds = ['a', 'b', 'c'], cast = ['choir', 'sort7', 'ilse2'] } = {}) {
  const reviews = [];
  for (const s of seeds) {
    const seed = `explore-${s}`;
    const players = Object.fromEntries(cast.map((id) => [id, new MockPlayer({ id, seed, cooperation: genome.policy.cooperation ?? 0.4 })]));
    const { session } = await runSession({
      scenario: APERTURE, cast: cast.map((id) => ENTITIES[id]), rules: genome.rules, seed,
      gm: new MockGM({ seed: `${seed}-gm`, harshness: genome.policy.harshness ?? 0.5 }), players, validator: new MockValidator(),
    });
    reviews.push(reviewSession(session));
  }
  const avg = (f) => reviews.reduce((s, r) => s + f(r), 0) / reviews.length;
  const descriptors = {};
  for (const k of ['falloutRate', 'successRate', 'cooperation', 'memoryLoss', 'coneGrowth', 'peakPosition']) descriptors[k] = +avg((r) => r.descriptors[k]).toFixed(3);
  return {
    fitness: +avg((r) => r.fitness).toFixed(4),
    descriptors,
    endings: reviews.map((r) => r.session.ending),
    deadMechanics: [...new Set(reviews.flatMap((r) => r.metrics.deadMechanics))],
    sample: reviews[0],
  };
}

const cellOf = (desc, dims) => dims.map((d) => { let i = 0; while (i < d.bins.length && desc[d.key] >= d.bins[i]) i++; return i; }).join(',');

export async function explore({ iterations = 120, initial = 24, seed = 'explorer', dims = DEFAULT_DIMS, llm = null, llmEvery = 0, onProgress = null } = {}) {
  const rng = createRng(seed);
  const archive = new Map();
  const log = [];
  const consider = (genome, res, origin) => {
    const cell = cellOf(res.descriptors, dims);
    const cur = archive.get(cell);
    const improved = !cur || res.fitness > cur.fitness;
    if (improved) archive.set(cell, { cell, genome, fitness: res.fitness, descriptors: res.descriptors, endings: res.endings, deadMechanics: res.deadMechanics, origin });
    log.push({ cell, fitness: res.fitness, improved, origin });
    return improved;
  };
  const base = { rules: {}, policy: { harshness: 0.5, cooperation: 0.4 } };
  const baseRes = await evaluate(base);
  consider(base, baseRes, 'default');
  for (let i = 0; i < initial; i++) consider(...(await (async () => { const g = randomGenome(rng); return [g, await evaluate(g), 'random']; })()));
  for (let it = 0; it < iterations; it++) {
    const elites = [...archive.values()];
    const parent = rng.pick(elites);
    let child, origin = 'mutation';
    if (llm && llmEvery && it % llmEvery === 0) {
      const res = await evaluate(parent.genome);
      const m = await llmMutate(parent.genome, res.sample, llm);
      child = m.genome; origin = `llm: ${m.why}`.slice(0, 160);
    } else child = mutate(parent.genome, rng, rng.int(1, 3));
    consider(child, await evaluate(child), origin);
    onProgress?.({ it, cells: archive.size });
  }
  return { dims, baseline: { fitness: baseRes.fitness, descriptors: baseRes.descriptors }, archive: [...archive.values()].sort((a, b) => b.fitness - a.fitness), log };
}

export function renderExplorerMarkdown(result) {
  const { dims, archive, baseline } = result;
  const L = ['# Design Explorer — MAP-Elites archive', ''];
  L.push(`Behaviour space: **${dims[0].label}** (rows) × **${dims[1].label}** (columns). Each cell keeps the highest-fitness rule variant that produces sessions of that kind. Scripted agents, 3 seeds per evaluation.`, '');
  L.push(`Baseline (default rules): fitness ${baseline.fitness}, descriptors ${JSON.stringify(baseline.descriptors)}`, '');
  const rows = dims[0].bins.length + 1, cols = dims[1].bins.length + 1;
  const lab = (d, i) => (i === 0 ? `<${d.bins[0]}` : i === d.bins.length ? `≥${d.bins.at(-1)}` : `${d.bins[i - 1]}–${d.bins[i]}`);
  L.push(`| ${dims[0].label} \\ ${dims[1].label} | ${Array.from({ length: cols }, (_, j) => lab(dims[1], j)).join(' | ')} |`);
  L.push(`|---|${'---|'.repeat(cols)}`);
  const byCell = Object.fromEntries(archive.map((a) => [a.cell, a]));
  for (let i = 0; i < rows; i++) L.push(`| ${lab(dims[0], i)} | ${Array.from({ length: cols }, (_, j) => (byCell[`${i},${j}`] ? byCell[`${i},${j}`].fitness.toFixed(2) : '·')).join(' | ')} |`);
  L.push('', `Cells filled: ${archive.length}/${rows * cols}`, '', '## Top elites', '');
  for (const e of archive.slice(0, 8)) {
    L.push(`- **${e.fitness}** cell ${e.cell} — rules \`${JSON.stringify(e.genome.rules)}\` policy \`${JSON.stringify(e.genome.policy)}\``);
    L.push(`  - descriptors ${JSON.stringify(e.descriptors)} · endings ${e.endings.join('/')} · dead: ${e.deadMechanics.join(', ') || 'none'} · origin: ${e.origin}`);
  }
  L.push('', '_Fitness is the reviewer composite (beats, tension variance, late climax, agency, mechanic coverage, difficulty & fallout bands, clip strength, minus spotlight imbalance and repetition). Re-validate top elites with LLM agents before adopting a rule change._');
  return L.join('\n');
}
