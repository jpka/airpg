import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Engine, describeEvent } from '../src/engine/engine.js';
import { APERTURE } from '../src/content/aperture.js';
import { ENTITIES } from '../src/content/entities.js';
import { runSession } from '../src/runner/session.js';
import { MockGM, MockPlayer } from '../src/agents/agents.js';
import { reviewSession } from '../src/reviewer/review.js';
import { extractJson } from '../src/agents/parse.js';
import { targetMenu } from '../src/agents/prompts.js';
import { transcript } from '../src/reviewer/judge.js';

const cast = ['choir', 'sort7', 'ilse2'].map((id) => ENTITIES[id]);
const mk = (rules = {}, seed = 't') => new Engine({ scenario: APERTURE, cast, rules, seed });
// v0.3's free-form intent grammar (no deck); still a supported rule variant. Deck tests: test/deck.test.js
const LEGACY = { deck: { enabled: false } };

async function mockRun(seed, rules = {}) {
  const players = Object.fromEntries(cast.map((c) => [c.id, new MockPlayer({ id: c.id, seed })]));
  return runSession({ scenario: APERTURE, cast, rules, seed, gm: new MockGM({ seed }), players });
}

test('sessions are deterministic for a seed', async () => {
  const a = await mockRun('det');
  const b = await mockRun('det');
  const strip = (s) => s.events.map((e) => [e.type, e.actor, JSON.stringify(e.data)].join('|'));
  assert.deepEqual(strip(a.session), strip(b.session));
  const c = await mockRun('other');
  assert.notDeepEqual(strip(a.session), strip(c.session));
});

test('engine decides whether a roll is needed, not the agent', () => {
  const e = mk(LEGACY); e.start(); e.enterScene(1); // delve
  const talk = e.validateAction('choir', { say: 'We could just walk.', target: 'none' });
  assert.equal(talk.needsRoll, false);
  const delve = e.validateAction('choir', { do: 'push on', target: 'delve', skill: 'Navigate', domain: 'Flesh' });
  assert.equal(delve.needsRoll, true);
  assert.equal(delve.pool, 2); // base + Flesh (Navigate not owned)
});

test('tolerant target parsing strips echoed menu text', () => {
  const e = mk(); e.start(); e.enterScene(1);
  assert.deepEqual(e.parseTarget('ally:ilse2 (Mend Ilse-2)', 'choir'), { type: 'ally', id: 'ilse2' });
  assert.deepEqual(e.parseTarget('Delve (push through)', 'choir'), { type: 'delve', id: 'delve:slope' });
});

test('light cone hides large clocks from small minds', () => {
  const e = mk(); e.start(); e.enterScene(0);
  const sortView = e.visibleClocks('sort7').map((c) => c.id); // reach 1
  assert.ok(!sortView.includes('attractor') && !sortView.includes('ingression'));
  const choirView = e.visibleClocks('choir').map((c) => c.id); // reach 2
  assert.ok(choirView.includes('attractor') && !choirView.includes('ingression'));
  const issues = [];
  assert.deepEqual(e.parseTarget('clock:attractor', 'sort7', issues), { type: 'none' });
  e.state.cohesion = 3; // collective cone
  assert.ok(e.visibleClocks('sort7').some((c) => c.id === 'attractor'));
});

test('GM leniency is corrected to the tier minimum', () => {
  const e = mk(); e.start(); e.enterScene(3); // tier 3 delve
  const a = e.declare('sort7', { do: 'climb', target: 'delve', skill: 'Navigate', domain: 'Number' });
  const s = e.setStakes(a, { position: 'controlled', effect: 'great', resistance: 'reach' });
  assert.equal(s.position, 'risky');
  assert.ok(e.events.some((ev) => ev.type === 'validator.flag' && ev.data.kind === 'leniency'));
});

test('fallout follows Heart: d12 <= total stress; minor 1-6, major 7-12', () => {
  for (let seed = 0; seed < 40; seed++) {
    const e = mk({}, seed); e.start(); e.enterScene(1);
    e.inflict('ilse2', 'boundary', 5);
    const chk = e.events.find((ev) => ev.type === 'fallout.check');
    const expect = chk.data.roll > chk.data.total ? 'none' : chk.data.roll <= 6 ? 'minor' : 'major';
    assert.equal(chk.data.result, expect);
  }
});

test('protection reduces stress and zero stress skips fallout', () => {
  const e = mk(); e.start(); e.enterScene(1);
  e.inflict('choir', 'substrate', 1); // protection 1
  assert.equal(e.char('choir').stress.substrate, 0);
  assert.ok(!e.events.some((ev) => ev.type === 'fallout.check'));
});

test('stress sharing splits load, raises cohesion, and grows reach', () => {
  const e = mk(); e.start(); e.enterScene(1);
  e.inflict('sort7', 'boundary', 6, { shareWith: 'choir' });
  e.inflict('sort7', 'boundary', 4, { shareWith: 'choir' });
  assert.equal(e.state.cohesion, 2);
  assert.equal(e.char('choir').cone.reach, 3);
});

test('secrets stay out of prompts until their gate opens', () => {
  const e = mk(); e.start(); e.enterScene(0);
  assert.ok(!JSON.stringify(e.gmView()).includes('Ilse-1 through this station'));
  e.state.npcSuccess.add('clerk');
  e.addClue({ id: 'c0', seed: 'x' }, 'x', 'sort7');
  assert.ok(JSON.stringify(e.gmView()).includes('Ilse-1 through this station'));
});

test('theorize: only clues found AND accepted count; truth becomes canon', () => {
  const e = mk({ theorize: { complexity: -20 } }); e.start(); e.enterScene(4);
  e.addClue({ id: 'c5', seed: 'a' }, 'a', 'sort7');
  e.addClue({ id: 'c6', seed: 'b' }, 'b', 'sort7');
  const a = e.declare('sort7', { theorize: { theory: 'A sorting rule that became a self.', clues: ['c5', 'c6', 'c99'] } });
  assert.deepEqual(a.theorize.clues, ['c5', 'c6']);
  const r = e.theorize(a, ['c5']);
  assert.deepEqual(r.accepted, ['c5']);
  assert.ok(e.state.facts.some((f) => f.text.startsWith('CANON')));
});

test('memory invocation requires reinterpretation and records drift', () => {
  const e = mk(LEGACY); e.start(); e.enterScene(1);
  const bad = e.validateAction('ilse2', { target: 'delve', do: 'go', memory: { id: 'm1' } });
  assert.equal(bad.memory, null);
  const ok = e.declare('ilse2', { target: 'delve', do: 'go', memory: { id: 'm1', reinterpretation: 'It was never her kitchen. It was mine.' } });
  assert.ok(ok.memory);
  const inv = e.events.find((ev) => ev.type === 'memory.invoke');
  assert.ok(inv.data.drift > 0 && inv.data.drift <= 1);
  assert.equal(e.char('ilse2').memories[0].original.includes('kitchen'), true);
});

test('review produces moments, findings and descriptors', async () => {
  const { session } = await mockRun('rev');
  const r = reviewSession(session);
  assert.ok(r.moments.length >= 3);
  assert.ok(r.findings.some((f) => f.area === 'game'));
  assert.equal(typeof r.fitness, 'number');
  assert.equal(r.curves.tension.length, session.events.length);
});

test('extractJson tolerates fences, chatter and trailing commas', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here: {"a": [1,2,],} thanks'), { a: [1, 2] });
  assert.equal(extractJson('no json'), null);
});

test('guard: guardian takes half of the ally\'s stress until the guardian\'s next turn', () => {
  const e = mk(LEGACY); e.start(); e.enterScene(1);
  e.declare('choir', { say: 'We hold you.', target: 'none', guard: 'ilse2' });
  e.inflict('ilse2', 'boundary', 6);
  assert.ok(e.events.some((ev) => ev.type === 'stress.share' && ev.actor === 'choir'));
  assert.equal(e.state.cohesion, 1);
  e.clearGuardsBy('choir');
  const before = e.state.cohesion;
  e.inflict('ilse2', 'boundary', 4);
  assert.equal(e.state.cohesion, before);
});

test('desperate drops one more die and raises effect', () => {
  const e = mk(); e.start(); e.enterScene(1); // tier 2: standard difficulty
  const a = e.declare('sort7', { do: 'leap', target: 'delve', skill: 'Navigate', domain: 'Number' });
  const s = e.setStakes(a, { position: 'desperate', effect: 'standard', resistance: 'reach' });
  assert.equal(a.difficulty, 'risky');
  assert.equal(s.effect, 'great');
});

test('resting at a haunt spends an experience and grants Resolve', () => {
  const e = mk(LEGACY); e.start(); e.enterScene(2); // garden
  e.char('ilse2').stress.substrate = 5;
  const a = e.declare('ilse2', { target: 'haunt:warm-bed', memory: { id: 'm2' } });
  const r = e.rest(a);
  assert.equal(r.resolve, 1);
  assert.ok(!e.char('ilse2').memories.some((m) => m.id === 'm2'));
});

test('player prompt shows what moves each entity', async () => {
  const { playerActPrompt } = await import('../src/agents/prompts.js');
  const e = mk(); e.start(); e.enterScene(2);
  assert.match(playerActPrompt(e.playerView('ilse2')), /Moved by: Reshape, Mend/);
});

test('v0.3: a shared hit makes one fallout check, not two', () => {
  const e = mk(LEGACY); e.start(); e.enterScene(1);
  e.declare('choir', { say: 'Lean on us.', target: 'none', guard: 'sort7' });
  e.inflict('sort7', 'boundary', 8);
  assert.equal(e.events.filter((ev) => ev.type === 'fallout.check').length, 1);
  const legacy = mk({ ...LEGACY, sharedHitSingleFalloutCheck: false }); legacy.start(); legacy.enterScene(1);
  legacy.declare('choir', { say: 'Lean on us.', target: 'none', guard: 'sort7' });
  legacy.inflict('sort7', 'boundary', 8);
  assert.equal(legacy.events.filter((ev) => ev.type === 'fallout.check').length, 2);
});

test('v0.3: cohesion decays each scene', () => {
  const e = mk(); e.start(); e.enterScene(1);
  e.state.cohesion = 4;
  e.enterScene(2);
  assert.equal(e.state.cohesion, 3);
});

test('v0.3: resting rides along with an action at landmarks, once per scene', () => {
  const e = mk(); e.start(); e.enterScene(2); // garden
  e.char('ilse2').stress.substrate = 6;
  const a = e.declare('ilse2', { do: 'read the beds', target: 'clue', skill: 'Discern', rest: { haunt: 'warm-bed', memory: 'm3' } });
  assert.equal(a.kind, 'act');
  assert.ok(e.events.some((ev) => ev.type === 'haunt.rest' && ev.actor === 'ilse2'));
  const again = e.validateAction('ilse2', { target: 'clue', rest: { haunt: 'warm-bed', memory: 'm1' } });
  assert.ok(!again.addRest);
});

test('describeEvent covers narration and state-change events', () => {
  const names = { ilse2: 'Ilse-2', sort7: 'SORT/7' };
  const d = (type, data, actor) => describeEvent({ type, data, actor }, names);
  assert.equal(d('ending.narrate', { text: 'It closes.' }), 'GM: It closes.');
  assert.equal(d('character.epilogue', { text: 'Enough.' }, 'ilse2'), 'Ilse-2: Enough.');
  assert.equal(d('ending.narrate', { text: '' }), null); // an empty reply adds no dangling "GM: "
  assert.equal(d('character.epilogue', { text: '' }, 'ilse2'), null);
  assert.equal(d('delve.forced', { remaining: 2, text: 'It costs them.' }), 'It costs them.');
  assert.equal(d('complication', { text: 'A shelf re-sorts.' }), 'Complication: A shelf re-sorts.');
  assert.equal(d('guard.set', { ally: 'ilse2', name: 'Ilse-2' }, 'sort7'), 'SORT/7 guards Ilse-2 until their next turn');
  assert.equal(d('npc.moved', { npc: 'g', name: 'The Gardener' }, 'sort7'), 'The Gardener is moved by SORT/7');
  assert.equal(d('stress.heal', { target: 'sort7', resistance: 'boundary', amount: 4, total: 4 }, 'ilse2'), 'Ilse-2 mends SORT/7: 4 boundary stress cleared (total 4)');
});

test('judge transcript keeps the opening and the ending, within the line budget', () => {
  const session = { events: Array.from({ length: 300 }, (_, i) => ({ type: 'outcome', data: { text: `line ${i}` } })) };
  const lines = transcript(session).split('\n');
  assert.equal(lines.length, 220);
  assert.equal(lines[0], 'GM: line 0');
  assert.equal(lines[178], 'GM: line 178');
  assert.equal(lines[179], '… (81 lines omitted) …');
  assert.equal(lines[219], 'GM: line 299');
  for (const max of [0, 1, 10, 30, 79]) assert.ok(transcript(session, max).split('\n').length <= Math.max(1, max), `maxLines ${max}`);
  assert.equal(transcript({ events: session.events.slice(0, 220) }).split('\n').length, 220); // at the budget, nothing is cut
});

// ---------------------------------------------------------------- v0.5: clues from entities

/** Act on the garden's entity and resolve it with a forced band, so only the rule decides. */
function moveGardener(rules, band = 'success') {
  const e = mk(rules); e.start(); e.enterScene(2); // garden: c1..c4, the Gardener
  const a = e.declare('choir', { say: 'Finish one of them with us.', target: 'npc:gardener', skill: 'Signal' });
  const s = e.setStakes(a, { position: 'risky', effect: 'standard', resistance: 'coherence' });
  return { e, out: e.applyOutcome(a, s, { band }) };
}

test('v0.5: a moved entity gives up the place\'s next clue seed', () => {
  const { e, out } = moveGardener({});
  assert.ok(e.events.some((ev) => ev.type === 'npc.moved'));
  assert.deepEqual(out.clues.map((c) => c.id), ['c1']);
  assert.ok(e.state.cluesRevealedSeeds.has('c1'));
  assert.deepEqual(moveGardener({}, 'cost').out.clues.map((c) => c.id), ['c1']); // success at a cost still moves it
  assert.deepEqual(moveGardener({}, 'fail').out.clues, []);
  assert.deepEqual(moveGardener({ cluesFromEntities: 0 }).out.clues, []);   // v0.4 behaviour
  assert.deepEqual(moveGardener({ cluesFromEntities: 2 }).out.clues.map((c) => c.id), ['c1', 'c2']);
  assert.deepEqual(moveGardener({ cluesFromEntities: true }).out.clues.map((c) => c.id), ['c1']);
  // review: junk values must not reveal the place (slice(0, -1) used to hand over all but one seed)
  for (const v of [-1, 'x', null]) assert.deepEqual(moveGardener({ cluesFromEntities: v }).out.clues, [], String(v));
  assert.deepEqual(moveGardener({ cluesFromEntities: 2.5 }).out.clues.map((c) => c.id), ['c1', 'c2']);
  // once the place is searched out, an entity has nothing left to give
  const { e: done } = moveGardener({});
  for (const id of ['c2', 'c3', 'c4']) done.state.cluesRevealedSeeds.add(id);
  const a = done.declare('sort7', { say: 'And the rest?', target: 'npc:gardener', skill: 'Signal' });
  assert.deepEqual(done.applyOutcome(a, done.setStakes(a, { position: 'risky', effect: 'standard', resistance: 'coherence' }), { band: 'success' }).clues, []);
});

test('v0.5: entities that still know something say so in the target menu', () => {
  const hint = /gives up one of this place's clues/;
  const e = mk(); e.start(); e.enterScene(2);
  assert.equal(e.playerView('choir').location.npcs[0].givesClues, 1);
  assert.match(targetMenu(e.playerView('choir')).find((t) => t.target === 'npc:gardener').what, hint);
  for (const id of ['c1', 'c2', 'c3', 'c4']) e.state.cluesRevealedSeeds.add(id);
  assert.doesNotMatch(targetMenu(e.playerView('choir')).find((t) => t.target === 'npc:gardener').what, hint);
  const off = mk({ cluesFromEntities: 0 }); off.start(); off.enterScene(2);
  assert.ok(!('givesClues' in off.playerView('choir').location.npcs[0]));
  // review: the hint states the real count, capped by what is left
  const two = mk({ cluesFromEntities: 2 }); two.start(); two.enterScene(2);
  assert.match(targetMenu(two.playerView('choir')).find((t) => t.target === 'npc:gardener').what, /gives up 2 of this place's clues/);
  for (const id of ['c1', 'c2', 'c3']) two.state.cluesRevealedSeeds.add(id);
  assert.match(targetMenu(two.playerView('choir')).find((t) => t.target === 'npc:gardener').what, /gives up one of this place's clues/);
});

test('v0.5: the runner hands the GM the seed and records the clue as the entity\'s', async () => {
  const asked = [];
  class SpyGM extends MockGM {
    async adjudicate(view, action, sheet, extra = {}) {
      const r = await super.adjudicate(view, action, sheet, extra);
      if (action.target.type === 'npc') { asked.push(extra); if (r.data.clue_text) r.data.clue_text = `It lets slip: ${r.data.clue_text}`; }
      return r;
    }
  }
  const run = (seed, rules) => runSession({ scenario: APERTURE, cast, rules, seed, gm: new SpyGM({ seed }), players: Object.fromEntries(cast.map((c) => [c.id, new MockPlayer({ id: c.id, seed })])) });
  let found = null;
  for (let i = 0; i < 12 && !found; i++) {
    const { session } = await run(`ent-${i}`, {});
    found = session.events.find((ev) => ev.type === 'clue.found' && ev.data.source?.startsWith('npc:'));
  }
  assert.ok(found, 'some scripted session moves an entity that still has a clue');
  assert.match(found.data.text, /^It lets slip: /);
  assert.ok(asked.some((x) => x.clueFrom && x.clueSeeds.length === 1));
  asked.length = 0;
  const { session: off } = await run('ent-0', { cluesFromEntities: 0 });
  assert.ok(!off.events.some((ev) => ev.type === 'clue.found' && ev.data.source));
  assert.ok(asked.every((x) => !x.clueFrom && x.clueSeeds.length === 0));
});

test('v0.5: searching a delve is refused, so it costs no roll', () => {
  const e = mk(LEGACY); e.start(); e.enterScene(1); // the Morphic Slope
  const a = e.declare('sort7', { do: 'read the gradient for clues', target: 'clue', skill: 'Discern' });
  assert.deepEqual(a.target, { type: 'none' });
  assert.equal(a.needsRoll, false);
  assert.equal(a.kind, 'talk');
  assert.ok(e.events.some((ev) => ev.type === 'validator.flag' && ev.data.kind === 'intent' && /nothing to search in a delve/.test(ev.data.detail)));
  e.enterScene(2); // a landmark still rolls for clues
  assert.equal(e.validateAction('sort7', { do: 'read the beds', target: 'clue', skill: 'Discern' }).needsRoll, true);
});

// Event streams pinned from the code before v0.5 (session.start, which names the rules, left out):
// v0.3 (b071911) for deck.enabled=false, and v0.4 (1cc0a3f) for the deck. With cluesFromEntities off,
// both must replay exactly; the rule is the only thing that changes them.
const PINNED = {
  legacy: { 'choir,sort7,ilse2': ['fd81d97099', 'bfc717190f', '9c3d9b6127', '48fc5299cb'], 'regent,lattice,sort7': ['cf580b26c2', '8ae0c7259a', 'cf293b4173', 'a4eebeb6f9'] },
  deck: { 'choir,sort7,ilse2': ['4d2988963e', 'c8fec7b990', 'f4b4620b4e', '7d2e9bd205'], 'regent,lattice,sort7': ['8f1ef72b71', '27f6d77705', 'b9f5d72a82', 'f2f41da2d1'] },
};
async function fingerprints(castIds, rules, n) {
  const c = castIds.split(',').map((id) => ENTITIES[id]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const seed = `fp-${i}`;
    const { session } = await runSession({ scenario: APERTURE, cast: c, rules, seed, gm: new MockGM({ seed }), players: Object.fromEntries(c.map((x) => [x.id, new MockPlayer({ id: x.id, seed })])) });
    const s = session.events.filter((e) => e.type !== 'session.start').map((e) => [e.type, e.actor, JSON.stringify(e.data)].join('|')).join('\n');
    out.push(crypto.createHash('sha1').update(s).digest('hex').slice(0, 10));
  }
  return out;
}

test('v0.5: with cluesFromEntities off, v0.3 and v0.4 event streams replay exactly', async () => {
  for (const [mode, casts] of Object.entries(PINNED)) {
    const base = mode === 'legacy' ? LEGACY : {};
    for (const [castIds, want] of Object.entries(casts)) {
      assert.deepEqual(await fingerprints(castIds, { ...base, cluesFromEntities: 0 }, want.length), want, `${mode} ${castIds}`);
      const on = await fingerprints(castIds, base, want.length);
      assert.ok(on.some((h, i) => h !== want[i]), `${mode} ${castIds}: the rule changes the stream`);
    }
  }
});
