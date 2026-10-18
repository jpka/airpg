// Automated session reviewer.
// Tier 1: structural metrics from engine events (authoritative).
// Tier 2: tension/affect curves + arc-shape fit (heuristic).
// Tier 3: optional LLM judge (noisy; use comparatively) — see judge.js.
// Output is both a human report (report.js) and machine-readable descriptors
// for the Explorer.

import { computeCurves, classifyArc, eventText } from './curves.js';
import { words, jaccard } from '../engine/core.js';

const ROLL_TYPES = ['stakes.set', 'roll', 'outcome'];
// Choices are things agents decide to do; never choosing one is a design failure.
// Consequences are things that happen to them; not occurring in one session is variance.
const CHOICES = {
  'memory.invoke': 'Memory invocation (reinterpret for +1 die)',
  'haunt.rest': 'Haunts (spend a memory to rest)',
  'guard.set': 'Guarding an ally (shared stress)',
  theorize: 'Theorize (clue-ledger truth)',
  'choice.persuade': 'Acting on entities (persuadability axis)',
  'choice.clue': 'Searching for clues',
};
const CONSEQUENCES = {
  'stress.share': 'Stress actually shared',
  'npc.moved': 'An entity persuaded',
  'cone.change': 'Light-cone change',
  'beat.hit': 'Beats',
  'algotype.reveal': 'Algotype reveal (Ingressed fallout)',
  'memory.lose': 'Memory loss',
  'secret.unlock': 'Phase-gated secrets',
  'audience.ingress': 'Audience ingress',
};
const MECHANICS = { ...CHOICES, ...CONSEQUENCES };

export function reviewSession(session, opts = {}) {
  const ev = session.events;
  const start = ev.find((e) => e.type === 'session.start');
  const cast = start?.data.cast ?? [];
  const names = Object.fromEntries(cast.map((c) => [c.id, c.name]));
  const algotypes = start?.backstage?.algotypes ?? {};
  const by = (t) => ev.filter((e) => e.type === t);

  // ---------- turns
  const turns = [];
  let cur = null;
  for (const e of ev) {
    if (e.type === 'turn.start' || e.type === 'scene.enter' || e.type === 'session.end') {
      if (cur) { cur.end = e.i - 1; turns.push(cur); cur = null; }
      if (e.type === 'turn.start') cur = { actor: e.actor, start: e.i, scene: e.scene, events: [] };
    }
    if (cur) cur.events.push(e);
  }

  // ---------- rolls
  const rolls = by('roll');
  const stakes = by('stakes.set');
  const bands = { critFail: 0, fail: 0, cost: 0, success: 0, crit: 0 };
  const byPosition = {};
  for (const r of rolls) {
    bands[r.data.band]++;
    const s = [...stakes].reverse().find((x) => x.i < r.i);
    const pos = s?.data.position ?? 'unknown';
    byPosition[pos] ??= { n: 0, success: 0 };
    byPosition[pos].n++;
    if (['success', 'crit', 'cost'].includes(r.data.band)) byPosition[pos].success++;
  }
  for (const p of Object.values(byPosition)) p.rate = +(p.success / p.n).toFixed(2);
  const anySuccess = rolls.length ? (bands.success + bands.crit + bands.cost) / rolls.length : 0;
  const legibleStakes = stakes.length ? stakes.filter((s) => (s.data.failure_looks_like ?? '').length > 12).length / stakes.length : 0;

  // ---------- stress / fallout
  const fallouts = by('fallout');
  const stressTaken = {};
  for (const s of by('stress')) { stressTaken[s.data.resistance] = (stressTaken[s.data.resistance] ?? 0) + s.data.taken; }
  const falloutRate = rolls.length ? fallouts.length / rolls.length : 0;

  // ---------- clocks
  const completed = by('clock.complete').map((e) => ({ clock: e.data.clock, name: e.data.name, kind: e.data.kind, at: e.i }));
  const delveRolls = {};
  for (const s of stakes) if (s.data.actorTarget?.type === 'delve') delveRolls[s.data.actorTarget.id] = (delveRolls[s.data.actorTarget.id] ?? 0) + 1;
  const forced = by('delve.forced');

  // ---------- beats
  const declared = Object.fromEntries(by('beats.declare').map((e) => [e.actor, e.data.beats]));
  const hits = by('beat.hit');
  const beatsDeclared = Object.values(declared).flat().length;
  const beatRate = beatsDeclared ? hits.length / beatsDeclared : 0;

  // ---------- memory
  const invokes = by('memory.invoke');
  const avgDrift = invokes.length ? invokes.reduce((s, e) => s + e.data.drift, 0) / invokes.length : 0;

  // ---------- agency & spotlight
  const actionTurns = turns.filter((t) => t.events.some((e) => e.type === 'action.declare'));
  const AGENCY = new Set(['clue.found', 'npc.moved', 'stress.heal', 'beat.hit', 'theorize', 'haunt.rest', 'stress.share', 'guard.set']);
  let agentful = 0;
  const spotlight = Object.fromEntries(cast.map((c) => [c.id, 0]));
  let talkOnly = 0;
  for (const t of actionTurns) {
    spotlight[t.actor] = (spotlight[t.actor] ?? 0) + 1;
    const decl = t.events.find((e) => e.type === 'action.declare');
    if (decl.data.kind === 'talk') talkOnly++;
    const changed = t.events.some((e) => AGENCY.has(e.type) || (e.type === 'clock.tick' && !/keeps pouring/.test(e.data.why)));
    if (changed) agentful++;
  }
  const agency = actionTurns.length ? agentful / actionTurns.length : 0;
  const sp = Object.values(spotlight);
  const spotlightImbalance = sp.length && Math.min(...sp) > 0 ? Math.max(...sp) / Math.min(...sp) : sp.length ? Infinity : 1;

  // ---------- adherence
  const flags = by('validator.flag');
  const flagCounts = {};
  for (const f of flags) flagCounts[f.data.kind] = (flagCounts[f.data.kind] ?? 0) + 1;
  const calls = by('agent.call');
  const llmCalls = calls.filter((c) => !c.data.mock);
  const fallbacks = calls.filter((c) => c.data.fallback).length;
  const retries = calls.filter((c) => c.data.attempts > 1).length;
  const avgMs = llmCalls.length ? llmCalls.reduce((s, c) => s + c.data.ms, 0) / llmCalls.length : 0;

  // ---------- narration quality
  const narr = ev.filter((e) => ['scene.frame', 'outcome'].includes(e.type) && e.data.text);
  const lens = narr.map((e) => words(e.data.text).length);
  const avgWords = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const rep = repetition(narr.map((e) => e.data.text));
  const moves = {};
  for (const e of ev) { const m = e.data?.gm_move; if (m && (e.type === 'stakes.set' || e.type === 'scene.frame')) moves[m] = (moves[m] ?? 0) + 1; }
  const moveEntropy = entropy(Object.values(moves));

  // ---------- mechanics coverage
  const declares = by('action.declare');
  const countOf = (k) => k === 'choice.persuade' ? declares.filter((e) => e.data.target?.type === 'npc').length
    : k === 'choice.clue' ? declares.filter((e) => e.data.target?.type === 'clue').length
    : by(k).length;
  const used = Object.fromEntries(Object.keys(MECHANICS).map((k) => [k, countOf(k)]));
  const dead = Object.keys(CHOICES).filter((k) => used[k] === 0);
  const quiet = Object.keys(CONSEQUENCES).filter((k) => used[k] === 0 && k !== 'audience.ingress');

  // ---------- algotype emergence (hidden drives)
  const algo = {};
  for (const c of cast) {
    const a = algotypes[c.id];
    if (!a) continue;
    const texts = ev.filter((e) => e.actor === c.id && ['action.declare', 'memory.invoke', 'character.intro', 'character.epilogue'].includes(e.type))
      .map((e) => `${e.data.say ?? ''} ${e.data.do ?? ''} ${e.data.reinterpretation ?? ''} ${e.data.text ?? ''} ${e.backstage?.intent ?? ''}`.toLowerCase());
    const evidence = [];
    let hitsN = 0;
    for (const kw of a.keywords) {
      const n = texts.filter((t) => t.includes(kw)).length;
      if (n) { hitsN += n; evidence.push(`${kw}×${n}`); }
    }
    algo[c.id] = { label: a.label, hits: hitsN, evidence, emerged: hitsN >= 2, revealed: ev.some((e) => e.type === 'algotype.reveal' && e.actor === c.id) };
  }

  // ---------- curves & arc
  const curves = computeCurves(session);
  const arc = classifyArc(curves.affect);
  const peakIdx = curves.tension.indexOf(Math.max(...curves.tension));
  const peakPos = curves.tension.length ? peakIdx / curves.tension.length : 0;
  const tVar = variance(curves.tension);

  // ---------- salient moments → clips
  const moments = rankMoments(turns, ev, curves, names);

  // ---------- findings
  const F = [];
  const add = (severity, area, code, title, detail, evidence = []) => F.push({ severity, area, code, title, detail, evidence });
  // game design
  add(legibleStakes >= 0.9 ? 'success' : 'warning', 'game', 'stakes_legible', legibleStakes >= 0.9 ? 'Stakes were declared before every roll' : 'Some rolls lacked a readable "failure looks like" hook', `${Math.round(legibleStakes * 100)}% of ${stakes.length} stakes had a hook spectators could read before the dice.`);
  if (rolls.length) {
    if (anySuccess > 0.8) add('warning', 'game', 'too_easy', 'Difficulty feels flat (too easy)', `${Math.round(anySuccess * 100)}% of rolls succeeded in some form.`);
    else if (anySuccess < 0.35) add('warning', 'game', 'too_hard', 'Difficulty is punishing', `Only ${Math.round(anySuccess * 100)}% of rolls succeeded in any form.`);
    else add('success', 'game', 'difficulty_band', 'Success rate sits in a dramatic band', `${Math.round(anySuccess * 100)}% any-success (target 40–75%).`);
  }
  const desp = byPosition.desperate;
  if (desp && desp.n >= 5 && desp.rate > 0.7) add('warning', 'game', 'desperate_soft', 'Desperate positions are not desperate', `${Math.round(desp.rate * 100)}% success on ${desp.n} desperate rolls.`);
  if (flagCounts.leniency) add('warning', 'agents', 'gm_lenient', 'GM tried to set positions below the tier minimum', `${flagCounts.leniency} correction(s) by the engine.`, flags.filter((f) => f.data.kind === 'leniency').map((f) => f.i));
  if (falloutRate >= 0.12 && falloutRate <= 0.45) add('success', 'game', 'fallout_band', 'Fallout landed at a healthy rate', `${fallouts.length} fallouts over ${rolls.length} rolls (${(falloutRate * 100).toFixed(0)}%).`, fallouts.map((f) => f.i));
  else add('warning', 'game', 'fallout_rate', falloutRate < 0.12 ? 'Too little fallout: stress rarely turned into story' : 'Fallout is constant: consequences may blur together', `${fallouts.length} fallouts over ${rolls.length} rolls.`, fallouts.map((f) => f.i));
  for (const [id, n] of Object.entries(delveRolls)) if (n <= 2 && !forced.length) add('warning', 'game', 'delve_trivial', `Delve ${id} took only ${n} roll(s)`, 'Consider raising its resistance or lowering effect dice.');
  if (forced.length) add('info', 'game', 'delve_forced', `${forced.length} delve(s) had to be forced`, 'Rounds ran out before the delve resistance reached 0; the party paid Reach stress and the Attractor ticked.', forced.map((f) => f.i));
  for (const k of dead) add('failure', 'game', `dead_${k}`, `Dead mechanic: ${MECHANICS[k]}`, 'No agent chose it this session. Either agents do not understand it, the prompt does not surface it, or it is not worth its complexity.');
  if (quiet.length) add('info', 'game', 'quiet_consequences', 'Consequences that did not occur', `${quiet.map((k) => MECHANICS[k]).join(', ')}. Normal variance in one session; watch across several.`);
  for (const [id, n] of Object.entries(spotlight)) if (n === 0) add('failure', 'game', 'no_spotlight', `${names[id]} never acted`, '');
  if (spotlightImbalance > 1.6 && Number.isFinite(spotlightImbalance)) add('warning', 'game', 'spotlight', 'Spotlight imbalance', `Actions per character: ${Object.entries(spotlight).map(([k, v]) => `${names[k]} ${v}`).join(', ')}.`);
  if (agency < 0.6) add('warning', 'game', 'low_agency', 'Low agency: many actions changed nothing', `${Math.round(agency * 100)}% of actions moved a clock, found a clue, moved an entity, healed, or hit a beat. Talk-only: ${talkOnly}.`);
  else add('success', 'game', 'agency', 'Actions mattered', `${Math.round(agency * 100)}% of actions changed the game state.`);
  if (used['stress.share'] >= 2 || used['guard.set'] >= 2) add('success', 'game', 'cooperation', 'The party behaved like a collective', `${used['guard.set']} guard(s) set, ${used['stress.share']} stress share(s); cohesion reached ${Math.max(0, ...by('stress.share').map((e) => e.data.cohesion))}.`, by('stress.share').map((e) => e.i));
  const theo = by('theorize');
  if (theo.length) add(theo.some((t) => t.data.result !== 'false') ? 'success' : 'warning', 'game', 'theorize', theo.some((t) => t.data.result !== 'false') ? 'A theory became canon' : 'Every theory failed', theo.map((t) => `${names[t.actor]}: "${t.data.theory}" → ${t.data.result} (${t.data.accepted.length}/${t.data.claimed.length} clues accepted, 2d6=${t.data.dice.join('+')})`).join(' · '), theo.map((t) => t.i));
  for (const c of completed.filter((x) => x.kind === 'threat' || x.kind === 'cosmic')) add('info', 'game', `clock_${c.clock}`, `${c.name} completed`, `At event ${c.at} (${Math.round((c.at / ev.length) * 100)}% through).`, [c.at]);
  if (flagCounts.outside_light_cone) add('info', 'game', 'light_cone', 'Light cones constrained play', `${flagCounts.outside_light_cone} attempt(s) to act on something outside an agent's cognitive light cone were refused.`);
  for (const [id, list] of Object.entries(declared)) {
    const h = hits.filter((x) => x.actor === id).length;
    if (!h) add('warning', 'game', 'beats_missed', `${names[id]} hit no beats`, `Declared: ${list.join(', ')}. The GM did not create (or recognise) openings.`);
  }
  if (beatsDeclared) add(beatRate >= 0.5 ? 'success' : 'info', 'game', 'beat_rate', `Beat fulfilment ${Math.round(beatRate * 100)}%`, `${hits.length} of ${beatsDeclared} declared beats hit.`, hits.map((h) => h.i));
  // narrative
  add('info', 'narrative', 'arc', `Arc shape: ${arc.shape}`, `Best fit r=${arc.fit} against Reagan et al.'s six emotional arcs.`);
  if (peakPos >= 0.6) add('success', 'narrative', 'late_climax', 'Tension peaked late', `Peak tension ${Math.max(...curves.tension).toFixed(2)} at ${Math.round(peakPos * 100)}% of the session.`, [peakIdx]);
  else add('warning', 'narrative', 'early_peak', 'Tension peaked early', `Peak at ${Math.round(peakPos * 100)}% of the session; the finale may feel like a comedown.`, [peakIdx]);
  if (rep.ratio > 0.18) add('warning', 'narrative', 'repetition', 'Narration repeats itself', `${Math.round(rep.ratio * 100)}% repeated trigrams. Top phrases: ${rep.top.map(([p, n]) => `"${p}"×${n}`).join(', ')}.`);
  else add('success', 'narrative', 'fresh', 'Narration stayed fresh', `${Math.round(rep.ratio * 100)}% repeated trigrams.`);
  if (avgWords > 60) add('warning', 'narrative', 'too_long', 'Narration too long for captions', `Average ${avgWords.toFixed(0)} words per beat (target ≤ 55).`);
  if (flagCounts.contradiction) add('failure', 'narrative', 'contradictions', 'Continuity contradictions', `${flagCounts.contradiction} narration(s) contradicted the fact ledger (facts were not added).`, flags.filter((f) => f.data.kind === 'contradiction').map((f) => f.i));
  if (invokes.length) add(avgDrift >= 0.25 && avgDrift <= 0.85 ? 'success' : 'info', 'narrative', 'memory_drift', 'Memories were reinterpreted', `${invokes.length} invocations, mean drift ${avgDrift.toFixed(2)} from the original (0 = verbatim, 1 = unrelated). Identity as committed confabulation was ${avgDrift >= 0.25 ? 'visible' : 'too timid'}.`, invokes.map((e) => e.i));
  for (const [id, a] of Object.entries(algo)) {
    add(a.emerged ? 'success' : 'info', 'narrative', `algotype_${id}`, a.emerged ? `${names[id]}'s hidden drive surfaced` : `${names[id]}'s hidden drive stayed hidden`, `${a.label}${a.evidence.length ? ` — ${a.evidence.join(', ')}` : ''}${a.revealed ? ' · revealed by Ingressed fallout' : ''}.`);
  }
  const unlocked = by('secret.unlock').length;
  add('info', 'narrative', 'secrets', `${unlocked} secret(s) unlocked`, 'Phase-gated secrets enter prompts only when their gate opens.');
  const ending = by('ending')[0];
  if (ending) add('info', 'narrative', 'ending', `Ending: ${ending.data.ending}`, ending.data.text, [ending.i]);
  // agents
  if (fallbacks) add(fallbacks > 3 ? 'failure' : 'warning', 'agents', 'fallbacks', 'Agent replies fell back to scripted behaviour', `${fallbacks} call(s) failed or returned invalid JSON; ${retries} needed a retry.`);
  if (Object.keys(moves).length && moveEntropy < 1.5) add('warning', 'agents', 'gm_moves', 'GM relies on few moves', `Move entropy ${moveEntropy.toFixed(2)} bits: ${Object.entries(moves).map(([k, v]) => `${k}×${v}`).join(', ')}.`);
  if (flagCounts.intent) add('info', 'agents', 'intent_issues', 'Agents proposed invalid intents', `${flagCounts.intent} intent issue(s) were corrected by the engine (unknown skills, bad targets, double memory use…).`, flags.filter((f) => f.data.kind === 'intent').map((f) => f.i));

  // ---------- descriptors & fitness (for the Explorer)
  const shares = used['stress.share'];
  const memLoss = by('memory.lose').length + by('haunt.rest').length;
  const coneNet = by('cone.change').reduce((s, e) => s + (e.data.after.reach + e.data.after.horizon) - (e.data.before.reach + e.data.before.horizon), 0);
  const descriptors = {
    falloutRate: +falloutRate.toFixed(3),
    successRate: +anySuccess.toFixed(3),
    cooperation: +(actionTurns.length ? shares / actionTurns.length : 0).toFixed(3),
    memoryLoss: +(cast.length ? memLoss / cast.length : 0).toFixed(3),
    coneGrowth: coneNet,
    peakPosition: +peakPos.toFixed(3),
    arcShape: arc.shape,
  };
  const deadFrac = dead.length / Object.keys(CHOICES).length;
  const diffScore = 1 - Math.min(1, Math.abs(anySuccess - 0.58) / 0.35);
  const falloutScore = 1 - Math.min(1, Math.abs(falloutRate - 0.28) / 0.25);
  const fitness = +(
    1.0 * beatRate + 0.8 * Math.min(1, tVar * 25) + 0.8 * (peakPos >= 0.6 ? 1 : peakPos) + 0.6 * agency +
    0.6 * (1 - deadFrac) + 0.5 * diffScore + 0.5 * falloutScore + 0.3 * Math.min(1, (moments[0]?.score ?? 0) / 20) -
    0.4 * (Number.isFinite(spotlightImbalance) ? Math.min(1, Math.max(0, spotlightImbalance - 1)) : 1) - 0.3 * Math.min(1, rep.ratio * 3)
  ).toFixed(4);

  return {
    format: 'latent.review/1',
    session: { label: session.meta?.label ?? null, seed: session.meta?.seed, scenario: session.meta?.scenario, events: ev.length, calls: session.meta?.calls ?? llmCalls.length, ending: session.final?.ending ?? ending?.data.ending ?? null, theory: session.final?.theory?.text ?? null, config: session.meta?.config ?? null },
    metrics: {
      rolls: rolls.length, bands, byPosition, anySuccess: +anySuccess.toFixed(3), legibleStakes: +legibleStakes.toFixed(3),
      stressTaken, fallouts: { total: fallouts.length, minor: fallouts.filter((f) => f.data.severity === 'minor').length, major: fallouts.filter((f) => f.data.severity === 'major').length, names: fallouts.map((f) => `${names[f.actor]}: ${f.data.name}`) },
      dissolved: by('character.dissolve').map((e) => names[e.actor]),
      clocksCompleted: completed, delveRolls, forcedDelves: forced.length,
      beats: { declared: beatsDeclared, hit: hits.length, rate: +beatRate.toFixed(3), hits: hits.map((h) => `${names[h.actor]}: ${h.data.text}`) },
      memory: { invocations: invokes.length, meanDrift: +avgDrift.toFixed(3), rewrites: by('memory.rewrite').length, losses: by('memory.lose').length, rests: by('haunt.rest').length, formed: by('memory.form').length },
      agency: +agency.toFixed(3), talkOnly, spotlight, spotlightImbalance: Number.isFinite(spotlightImbalance) ? +spotlightImbalance.toFixed(2) : null,
      flags: flagCounts, agentCalls: llmCalls.length, fallbacks, retries, avgCallMs: Math.round(avgMs),
      narration: { beats: narr.length, avgWords: +avgWords.toFixed(1), repetition: +rep.ratio.toFixed(3), topPhrases: rep.top },
      gmMoves: moves, gmMoveEntropy: +moveEntropy.toFixed(2),
      mechanicsUsed: used, deadMechanics: dead,
    },
    algotypes: algo,
    curves: { tension: curves.tension, affect: curves.affect },
    arc,
    moments,
    findings: F,
    descriptors,
    fitness,
    judge: null,
  };
}

// ------------------------------------------------------------------ moments

function rankMoments(turns, ev, curves, names) {
  const W = {
    crit: 3, critFail: 3, success: 1, cost: 1.5, fail: 1.5,
    'fallout.minor': 2, 'fallout.major': 4, 'character.dissolve': 5, 'clock.complete': 3, theorize: 4,
    'memory.lose': 3, 'memory.invoke': 1, 'beat.hit.minor': 2, 'beat.hit.major': 3, 'algotype.reveal': 4,
    'stress.share': 1.5, 'cone.change': 1, 'clue.found': 1, 'secret.unlock': 2, 'npc.moved': 1.5, 'memory.rewrite': 2,
  };
  const out = [];
  for (const t of turns) {
    const es = t.events;
    let mag = 0;
    const why = [];
    const roll = es.find((e) => e.type === 'roll');
    const stake = es.find((e) => e.type === 'stakes.set');
    const outcome = es.find((e) => e.type === 'outcome');
    const decl = es.find((e) => e.type === 'action.declare');
    if (roll) { mag += W[roll.data.band]; if (roll.data.band === 'crit' || roll.data.band === 'critFail') why.push(roll.data.label.toLowerCase()); }
    for (const e of es) {
      let k = e.type;
      if (k === 'fallout') k = `fallout.${e.data.severity}`;
      if (k === 'beat.hit') k = `beat.hit.${e.data.tier}`;
      if (W[k] && e.type !== 'roll') {
        mag += W[k];
        const label = { 'fallout.major': `major fallout (${e.data.name})`, 'fallout.minor': `fallout (${e.data.name})`, 'clock.complete': `${e.data.name} completes`, theorize: `theory ${e.data.result === 'false' ? 'fails' : 'proves true'}`, 'memory.lose': 'a memory is lost', 'character.dissolve': 'an entity dissolves', 'algotype.reveal': 'hidden drive revealed', 'beat.hit.major': 'major beat', 'beat.hit.minor': 'beat hit', 'stress.share': 'shares stress', 'secret.unlock': 'a secret opens', 'memory.rewrite': 'a memory rewrites itself' }[k];
        if (label) why.push(label);
      }
    }
    if (stake?.data.position === 'desperate') { mag *= 1.3; why.push('desperate position'); }
    const t0 = curves.tension[t.start] ?? 0, t1 = curves.tension[t.end] ?? 0;
    const tMax = Math.max(...curves.tension.slice(t.start, t.end + 1));
    const a0 = curves.affect[t.start] ?? 0, a1 = curves.affect[t.end] ?? 0;
    const dT = Math.abs(tMax - t0) + Math.abs(t1 - t0);
    const dA = Math.abs(a1 - a0);
    const score = mag * (1 + 2 * dT) * (1 + Math.min(2, dA) * 0.5);
    if (score <= 0) continue;
    const actor = names[t.actor] ?? t.actor;
    const hook = stake?.data.failure_looks_like || decl?.data.say || '';
    const payoff = outcome?.data.text ?? '';
    const words_ = `${hook} ${decl?.data.say ?? ''} ${payoff}`.split(/\s+/).length;
    out.push({
      score: +score.toFixed(3), actor: t.actor, scene: t.scene, start: t.start, end: t.end, peak: t.start + curves.tension.slice(t.start, t.end + 1).indexOf(tMax),
      title: momentTitle(actor, decl, roll, es),
      hook, say: decl?.data.say ?? '', roll: roll ? { dice: roll.data.dice, kept: roll.data.kept, band: roll.data.band, label: roll.data.label } : null,
      payoff, why: [...new Set(why)], estSeconds: Math.round(words_ / 2.6 + (roll ? 3 : 0) + 2),
    });
  }
  out.sort((a, b) => b.score - a.score);
  // diversity: at most two clips per scene in the top list
  const perScene = {};
  const picked = [];
  for (const m of out) {
    perScene[m.scene] = (perScene[m.scene] ?? 0) + 1;
    if (perScene[m.scene] <= 2) picked.push(m);
    if (picked.length >= 8) break;
  }
  return picked.map((m, i) => ({ rank: i + 1, ...m }));
}

function momentTitle(actor, decl, roll, es) {
  const th = es.find((e) => e.type === 'theorize');
  if (th) return `${actor} names the pattern — ${th.data.result === 'false' ? 'and is wrong' : 'and is right'}`;
  const maj = es.find((e) => e.type === 'fallout' && e.data.severity === 'major');
  if (maj) return `${actor}: ${maj.data.name}`;
  const lose = es.find((e) => e.type === 'memory.lose');
  if (lose) return `${actor} loses a memory`;
  const done = es.find((e) => e.type === 'clock.complete');
  if (done) return `${done.data.name} — complete`;
  const min = es.find((e) => e.type === 'fallout');
  if (min) return `${actor}: ${min.data.name}`;
  const beat = es.find((e) => e.type === 'beat.hit');
  if (beat) return `${actor}: “${beat.data.text}”`;
  if (roll) return `${actor} — ${roll.data.label}`;
  return `${actor}: ${decl?.data.say ?? ''}`.slice(0, 80);
}

// ------------------------------------------------------------------ helpers

function repetition(texts) {
  const tri = new Map();
  const quad = new Map();
  let total = 0;
  for (const t of texts) {
    const w = words(t);
    for (let i = 0; i + 2 < w.length; i++) { const k = w.slice(i, i + 3).join(' '); tri.set(k, (tri.get(k) ?? 0) + 1); total++; }
    for (let i = 0; i + 3 < w.length; i++) { const k = w.slice(i, i + 4).join(' '); quad.set(k, (quad.get(k) ?? 0) + 1); }
  }
  let repeated = 0;
  for (const n of tri.values()) if (n > 1) repeated += n - 1;
  const top = [...quad.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { ratio: total ? repeated / total : 0, top };
}

function entropy(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return 0;
  return -counts.reduce((s, c) => (c ? s + (c / n) * Math.log2(c / n) : s), 0);
}

function variance(xs) {
  if (!xs.length) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

export { eventText, jaccard };
