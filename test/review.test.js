import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { APERTURE } from '../src/content/aperture.js';
import { ENTITIES } from '../src/content/entities.js';
import { runSession } from '../src/runner/session.js';
import { MockGM, MockPlayer } from '../src/agents/agents.js';
import { reviewSession } from '../src/reviewer/review.js';
import { renderMarkdown } from '../src/reviewer/report.js';
import { computeCurves } from '../src/reviewer/curves.js';
import { SPACE } from '../src/explorer/mapelites.js';

const cast = ['choir', 'sort7', 'ilse2'].map((id) => ENTITIES[id]);
const mockRun = (seed, rules = {}) => runSession({
  scenario: APERTURE, cast, rules, seed, gm: new MockGM({ seed }),
  players: Object.fromEntries(cast.map((c) => [c.id, new MockPlayer({ id: c.id, seed })])),
});
const root = (f) => new URL(`../${f}`, import.meta.url);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const codes = (r) => r.findings.map((f) => f.code);
const find = (r, code) => r.findings.find((f) => f.code === code);
const DECK_CODES = /^(hand_|drafts$|haunt_removals$|unplayed_cards$|human_seats$|dead_(deck|card)\.)/;

// ---- a hand-built deck session: every number below can be checked by eye
const card = (type, name = type) => ({
  uid: name.toLowerCase(), id: type, name, type, text: '',
  kind: { skill: 'move', knack: 'move', guard: 'guard', compel: 'compel', condition: 'status', gap: 'status' }[type] ?? 'edge',
});
const DECK = [card('skill', 'Mend'), card('skill', 'Mend 2'), card('domain', 'Flesh'), card('drive', 'Drive'), card('flaw', 'Too Many Mouths'), card('guard', 'Guard'), card('calling', 'Chorus'), card('memory', 'Memory m1')];
const [MEND, , FLESH, DRIVE, FLAW, GUARD, CHORUS] = DECK;
const COND = card('condition', 'Misfire'), NAG = card('compel', 'Nag'), GAP = card('gap', 'Gap');
/** turns = [{ hand, move, edges, improvised, regret }] for entity a; `tail` events come after. Entity b has a deck but never acts. */
function mini(turns, { tail = [], deck = DECK } = {}) {
  const ev = [{ type: 'session.start', actor: null, data: { cast: [{ id: 'a', name: 'Ava' }, { id: 'b', name: 'Bo' }], clocks: [] }, backstage: { algotypes: { a: { label: 'Hoarder', keywords: ['zzzz'] }, b: { label: 'Seeker', keywords: ['zzzz'] } } } }];
  for (const id of ['a', 'b']) ev.push({ type: 'deck.build', actor: id, data: { size: deck.length, handSize: 5, cards: deck } });
  turns.forEach((t, n) => ev.push(
    { type: 'turn.start', actor: 'a', data: { round: n } },
    { type: 'deck.draw', actor: 'a', data: { hand: t.hand, drawn: t.hand.length, handSize: 5, edges: 2, draw: 0, discard: 0, reshuffled: false } },
    { type: 'deck.play', actor: 'a', data: { move: t.move ?? null, edges: t.edges ?? [], guard: null, compel: null, improvised: t.improvised ?? null, dropped: [], hand: [] } },
    { type: 'action.declare', actor: 'a', data: { kind: 'act', target: { type: 'none' }, needsRoll: true } },
    { type: 'deck.discard', actor: 'a', data: { cards: [], regret: t.regret ?? [], draw: 0, discard: 0 } },
  ));
  ev.push(...tail);
  return { meta: {}, events: ev.map((e, i) => ({ i, scene: 's', ...e })) };
}
const GOOD = [
  { hand: [MEND, FLESH, DRIVE, CHORUS, COND], move: MEND, edges: [FLESH, DRIVE] },
  { hand: [MEND, DRIVE, FLAW, CHORUS, NAG], move: MEND, edges: [DRIVE, FLAW], regret: ['Nag'] },
  { hand: [MEND, DRIVE, CHORUS, GUARD, GAP], move: MEND, edges: [DRIVE] },
  { hand: [MEND, CHORUS, FLESH, DRIVE], improvised: 'Signal' },
];
const TAIL = [
  { type: 'deck.offer', actor: 'a', data: { why: 'The Garden', cards: [CHORUS] } },
  { type: 'deck.draft', actor: 'a', data: { card: CHORUS, why: 'The Garden', offered: ['Chorus'] } },
  { type: 'deck.offer', actor: 'a', data: { why: 'The Library', cards: [FLESH] } },
  { type: 'deck.draft', actor: 'a', data: { card: null, why: 'The Library', offered: ['Flesh'] } },
  { type: 'deck.gain', actor: 'a', data: { card: COND, why: 'fallout: Misfire', zone: 'draw' } },
  { type: 'deck.gain', actor: 'a', data: { card: card('resolve', 'Resolve'), why: 'beat', zone: 'draw' } },
  { type: 'deck.remove', actor: 'a', data: { card: COND, why: 'set down at The Margins' } },
  { type: 'deck.remove', actor: 'a', data: { card: card('memory', 'Memory m2'), why: 'spent at The Margins' } },
  { type: 'algotype.reveal', actor: 'a', data: { algotype: 'Hoarder', via: 'drive' } },
];

test('deck metrics count what the events say', () => {
  const r = reviewSession(mini(GOOD, { tail: TAIL }));
  const d = r.metrics.deck;
  assert.deepEqual([d.plays, d.rollPlays, d.improvised, d.improvisedShare, d.edgesPerRoll], [4, 4, 1, 0.25, 1.25]);
  assert.deepEqual(d.playedByType, { skill: 3, domain: 1, drive: 3, flaw: 1 });
  assert.deepEqual(d.hands, { n: 4, cards: 19, status: 3 });
  assert.equal(d.statusShareOfHand, 0.158);
  assert.equal(d.regretHeld, 1);
  assert.equal(d.regretStress, 0); // no compel stress events in this hand-built session
  assert.deepEqual(d.drafts, { offered: 2, picked: 1, skipped: 1, unanswered: 0, picks: ['Chorus'] });
  assert.deepEqual(d.removals, { haunt: 1, spent: 1, erased: 0, other: 0 });
  assert.deepEqual(d.gainsByType, { condition: 1, resolve: 1 });
  assert.deepEqual(d.drivePlays, { a: 3, b: 0 });
  assert.deepEqual([d.revealsViaDrive, d.flawPlays, d.flawCards], [1, 1, 2]);
  assert.deepEqual(d.deadCards, ['calling']); // drawn four times, never played; guard was drawn once, memory never
  assert.deepEqual(d.humanSeats, []);
});

test('deck findings fire on the thresholds and cite events', () => {
  const s = mini(GOOD, { tail: TAIL });
  const r = reviewSession(s);
  assert.equal(find(r, 'hand_fit').severity, 'success');
  assert.equal(find(r, 'hand_fit').title, 'The hand shaped play');
  assert.ok(!codes(r).includes('hand_misfit') && !codes(r).includes('hand_clogged'));
  assert.equal(find(r, 'drafts').severity, 'info');
  assert.equal(find(r, 'haunt_removals').title, 'Haunts thinned decks');
  assert.match(find(r, 'unplayed_cards').detail, /calling/);
  for (const f of r.findings.filter((x) => DECK_CODES.test(x.code))) assert.ok(f.evidence.every((i) => Number.isInteger(i) && i < r.session.events), f.code);
  const t = (i) => s.events[i].type;
  assert.ok(find(r, 'hand_fit').evidence.every((i) => t(i) === 'deck.play'));
  assert.ok(find(r, 'drafts').evidence.every((i) => t(i) === 'deck.draft'));
  assert.ok(find(r, 'haunt_removals').evidence.every((i) => t(i) === 'deck.remove'));

  const half = GOOD.map((x, n) => (n % 2 ? { hand: x.hand, improvised: 'Signal' } : x)); // 2 of 4 improvised
  const bad = reviewSession(mini(half));
  assert.equal(bad.metrics.deck.improvisedShare, 0.5);
  assert.equal(find(bad, 'hand_misfit').severity, 'warning');
  assert.ok(!codes(bad).includes('hand_fit'));
  assert.equal(find(bad, 'hand_misfit').evidence.length, 2);

  const clog = reviewSession(mini(GOOD.map((x) => ({ ...x, hand: [MEND, COND, NAG, GAP, DRIVE] }))));
  assert.equal(clog.metrics.deck.statusShareOfHand, 0.6);
  assert.equal(find(clog, 'hand_clogged').severity, 'warning');
  const edge = reviewSession(mini([{ hand: [MEND, COND, FLESH, DRIVE], move: MEND }])); // exactly 25% is not clogged
  assert.equal(edge.metrics.deck.statusShareOfHand, 0.25);
  assert.ok(!codes(edge).includes('hand_clogged'));

  const rested = reviewSession(mini(GOOD, { tail: [{ type: 'haunt.rest', actor: 'a', data: { cleared: 1, resistance: 'coherence' } }] }));
  assert.equal(find(rested, 'haunt_removals').severity, 'info');
});

test('deck choices: never drafting, driving or playing a flaw is a dead mechanic', () => {
  const idle = [{ hand: [MEND, FLESH], move: MEND, edges: [FLESH] }];
  const offered = [{ type: 'deck.offer', actor: 'a', data: { why: 'x', cards: [CHORUS] } }, { type: 'deck.draft', actor: 'a', data: { card: null, why: 'x', offered: ['Chorus'] } }];
  const r = reviewSession(mini(idle, { tail: offered }));
  for (const k of ['deck.draft', 'card.drive', 'card.flaw']) { assert.ok(r.metrics.deadMechanics.includes(k), k); assert.equal(find(r, `dead_${k}`).severity, 'failure'); }
  // no offers, no draft to decline; and a cast without flaw cards cannot play one
  const none = reviewSession(mini(idle, { deck: DECK.filter((k) => k.type !== 'flaw') }));
  assert.deepEqual(none.metrics.deadMechanics.filter((k) => /^(deck|card)\./.test(k)), ['card.drive']);
  assert.ok(!('card.flaw' in none.metrics.mechanicsUsed));
  const used = reviewSession(mini(GOOD, { tail: TAIL }));
  assert.deepEqual(used.metrics.deadMechanics.filter((k) => /^(deck|card)\./.test(k)), []);
  assert.deepEqual([used.metrics.mechanicsUsed['deck.draft'], used.metrics.mechanicsUsed['card.drive'], used.metrics.mechanicsUsed['card.flaw']], [1, 3, 1]);
});

test('Drive plays are evidence of the hidden drive, and a Drive reveal is a reveal', () => {
  const r = reviewSession(mini(GOOD, { tail: TAIL }));
  assert.deepEqual([r.algotypes.a.hits, r.algotypes.a.emerged, r.algotypes.a.revealed, r.algotypes.a.via], [3, true, true, 'drive']);
  assert.deepEqual([r.algotypes.b.hits, r.algotypes.b.emerged, r.algotypes.b.revealed], [0, false, false]);
  const f = find(r, 'algotype_a');
  assert.match(f.detail, /Drive card×3.*revealed by playing the Drive card/);
  assert.equal(f.evidence.length, 4); // three plays and the reveal
  assert.equal(find(r, 'algotype_b').title, "Bo's hidden drive stayed hidden");
  const once = reviewSession(mini([GOOD[0]]));
  assert.equal(once.algotypes.a.hits, 1);
  assert.equal(once.algotypes.a.emerged, false);
});

test('human seats are named and left out of the LLM call numbers', () => {
  const call = (agent, d) => ({ type: 'agent.call', actor: agent, data: { agent, tag: 'act', ms: 10, ok: true, fallback: false, mock: false, error: null, attempts: 1, ...d } });
  const r = reviewSession(mini(GOOD, { tail: [call('a', { human: true, ms: 9000 }), call('a', { human: true, ms: 7000, fallback: true, attempts: 2 }), call('b', { ms: 100 }), call('gm', { ms: 300, fallback: true })] }));
  assert.equal(r.metrics.agentCalls, 2);
  assert.equal(r.metrics.avgCallMs, 200);
  assert.equal(r.metrics.fallbacks, 1);
  assert.equal(r.metrics.retries, 0);
  assert.deepEqual(r.metrics.deck.humanSeats, ['a']);
  const f = find(r, 'human_seats');
  assert.deepEqual([f.severity, f.area], ['info', 'agents']);
  assert.match(f.title, /Ava/);
  assert.ok(!codes(reviewSession(mini(GOOD))).includes('human_seats'));
});

test('a real deck session reviews to a populated, self-consistent deck block', async () => {
  const { session } = await mockRun('review-deck');
  const r = reviewSession(session);
  const d = r.metrics.deck;
  const of = (t) => session.events.filter((e) => e.type === t);
  assert.ok(d, 'deck block present');
  assert.ok(d.plays > 0 && d.rollPlays > 0 && d.rollPlays <= d.plays);
  assert.equal(d.plays, of('deck.play').length);
  assert.ok(d.improvisedShare >= 0 && d.improvisedShare <= 1);
  assert.ok(d.edgesPerRoll >= 0 && d.edgesPerRoll <= session.events.find((e) => e.type === 'session.start').data.rules.deck.edgesPerTurn);
  const played = of('deck.play').reduce((n, e) => n + [e.data.move, ...e.data.edges, e.data.guard, e.data.compel].filter(Boolean).length, 0);
  assert.equal(sum(d.playedByType), played);
  assert.equal(d.hands.n, of('deck.draw').length);
  assert.ok(d.statusShareOfHand >= 0 && d.statusShareOfHand <= 1);
  assert.equal(d.regretHeld, of('deck.discard').reduce((n, e) => n + e.data.regret.length, 0));
  assert.equal(d.regretStress, of('stress').filter((e) => /^compel/.test(e.data.source ?? '')).reduce((n, e) => n + e.data.taken, 0));
  assert.ok(d.drafts.offered > 0);
  assert.equal(d.drafts.offered, of('deck.offer').length);
  assert.equal(d.drafts.picked + d.drafts.skipped, of('deck.draft').length);
  assert.equal(d.drafts.picks.length, d.drafts.picked);
  assert.equal(sum(d.removals), of('deck.remove').length);
  assert.equal(d.removals.haunt, of('deck.remove').filter((e) => e.data.why.startsWith('set down at')).length);
  assert.equal(sum(d.gainsByType), of('deck.gain').length);
  assert.deepEqual(Object.keys(d.drivePlays).sort(), ['choir', 'ilse2', 'sort7']);
  assert.equal(d.revealsViaDrive, of('algotype.reveal').filter((e) => e.data.via === 'drive').length);
  assert.deepEqual(d.humanSeats, []);
  assert.ok(['deck.draft', 'card.drive', 'card.flaw'].every((k) => k in r.metrics.mechanicsUsed));
  for (const f of r.findings) {
    assert.ok(['success', 'warning', 'failure', 'info'].includes(f.severity) && ['game', 'narrative', 'agents'].includes(f.area), f.code);
    assert.ok(f.evidence.every((i) => i >= 0 && i < session.events.length), f.code);
  }
  assert.ok(Number.isFinite(+r.fitness));
  const md = renderMarkdown(r);
  assert.match(md, /\n## Deck\n/);
  assert.ok(md.indexOf('## Deck') < md.indexOf('## Metrics'));
});

test('without a deck the reviewer says nothing about one', async () => {
  const { session } = await mockRun('review-legacy', { deck: { enabled: false } });
  assert.ok(!session.events.some((e) => e.type.startsWith('deck.')));
  const r = reviewSession(session);
  assert.equal(r.metrics.deck, null);
  assert.ok(!r.findings.some((f) => DECK_CODES.test(f.code)));
  assert.deepEqual(Object.keys(r.metrics.mechanicsUsed), ['memory.invoke', 'haunt.rest', 'guard.set', 'theorize', 'choice.persuade', 'choice.clue', 'stress.share', 'npc.moved', 'cone.change', 'beat.hit', 'algotype.reveal', 'memory.lose', 'secret.unlock', 'audience.ingress']);
  assert.ok(!/## Deck/.test(renderMarkdown(r)));
  assert.ok(Object.values(r.algotypes).every((a) => !('via' in a)));
});

test('committed v0.3 sessions review exactly as before', () => {
  for (const n of ['first-light', 'second-light', 'third-light', 'scripted-demo']) {
    const session = JSON.parse(fs.readFileSync(root(`sessions/${n}.json`), 'utf8'));
    const committed = JSON.parse(fs.readFileSync(root(`sessions/${n}.review.json`), 'utf8'));
    const r = reviewSession(session);
    assert.equal(r.fitness, committed.fitness, n);
    assert.deepEqual(r.findings, committed.findings, n);
    assert.deepEqual(r.metrics.deadMechanics, committed.metrics.deadMechanics, n);
    assert.deepEqual(r.metrics.mechanicsUsed, committed.metrics.mechanicsUsed, n);
    assert.deepEqual(r.algotypes, committed.algotypes, n);
    assert.equal(r.metrics.deck, null, n);
    assert.ok(!/## Deck/.test(renderMarkdown(r)), n);
  }
});

test('deck cards move the affect curve', () => {
  const at = (...evs) => computeCurves({ events: [{ i: 0, type: 'session.start', data: { cast: [{ id: 'a' }], clocks: [] } }, ...evs.map((e, k) => ({ i: k + 1, actor: 'a', ...e }))] }).affect.slice(1);
  assert.deepEqual(at({ type: 'deck.gain', data: { card: { type: 'condition' }, why: 'fallout: x' } }), [-0.3]);
  for (const type of ['compel', 'gap', 'voice']) assert.deepEqual(at({ type: 'deck.gain', data: { card: { type }, why: 'x' } }), [-0.3], type);
  assert.deepEqual(at({ type: 'deck.gain', data: { card: { type: 'resolve' }, why: 'beat' } }), [0]);
  assert.deepEqual(at({ type: 'deck.remove', data: { card: { type: 'condition' }, why: 'set down at The Margins' } }), [0.3]);
  assert.deepEqual(at({ type: 'deck.remove', data: { card: { type: 'memory' }, why: 'spent at The Margins' } }), [0]);
  assert.deepEqual(at({ type: 'deck.draft', data: { card: { type: 'calling' }, why: 'x' } }), [0.2]);
  assert.deepEqual(at({ type: 'deck.draft', data: { card: null, why: 'x' } }), [0]);
});

test('compare shows deck rows for deck reviews and dashes for older ones', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latent-compare-'));
  try {
    const { session } = await mockRun('review-deck');
    const deck = reviewSession(session);
    fs.writeFileSync(path.join(dir, 'deck.review.json'), JSON.stringify(deck));
    const out = execFileSync(process.execPath, [new URL('../cli/compare.js', import.meta.url).pathname, path.join(dir, 'deck.review.json'), new URL('../sessions/third-light.review.json', import.meta.url).pathname], { encoding: 'utf8' });
    const row = (k) => out.split('\n').find((l) => l.startsWith(`| ${k} |`)).split('|').map((x) => x.trim());
    assert.equal(row('improvised share')[2], `${Math.round(deck.metrics.deck.improvisedShare * 100)}%`);
    assert.equal(row('drafts picked / offered')[2], `${deck.metrics.deck.drafts.picked} / ${deck.metrics.deck.drafts.offered}`);
    for (const k of ['improvised share', 'edges / roll', 'drafts picked / offered', 'haunt removals', 'drive plays']) assert.equal(row(k)[3], '—', k);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the explorer can vary hand size and edge slots', () => {
  assert.deepEqual(SPACE['deck.handBase'], [2, 3, 4]);
  assert.deepEqual(SPACE['deck.edgesPerTurn'], [1, 2, 3]);
});
