import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { APERTURE } from '../src/content/aperture.js';
import { ENTITIES } from '../src/content/entities.js';
import { runSession } from '../src/runner/session.js';
import { MockGM, MockPlayer } from '../src/agents/agents.js';
import { reviewSession } from '../src/reviewer/review.js';
import { extractJson } from '../src/agents/parse.js';

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
