import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { APERTURE } from '../src/content/aperture.js';
import { ENTITIES } from '../src/content/entities.js';
import { runSession } from '../src/runner/session.js';
import { MockGM, MockPlayer } from '../src/agents/agents.js';
import { HumanPlayer } from '../src/agents/human.js';
import { moveCard, cardsInPlay } from '../src/engine/deck.js';
import { playerActPrompt } from '../src/agents/prompts.js';

const cast = ['choir', 'sort7', 'ilse2'].map((id) => ENTITIES[id]);
const mk = (rules = {}, seed = 't') => { const e = new Engine({ scenario: APERTURE, cast, rules, seed }); e.start(); return e; };
/** Put the first card matching `pred` (from any zone) into the hand. */
const hold = (e, id, pred) => { const d = e.char(id).deck; const k = cardsInPlay(d).find(pred); if (!k) throw new Error('no such card'); if (!d.hand.includes(k)) moveCard(d, k.uid, 'hand'); return k; };
const emptyHand = (e, id) => { const d = e.char(id).deck; for (const k of [...d.hand]) moveCard(d, k.uid, 'discard'); };
const types = (e, id) => cardsInPlay(e.char(id).deck).map((k) => k.type);

test('the starting deck is the character sheet as cards', () => {
  const e = mk();
  const d = cardsInPlay(e.char('choir').deck);
  const names = d.map((k) => k.name);
  assert.equal(d.filter((k) => k.kind === 'move').length, 6);          // 3 skills × 2
  assert.ok(names.includes('Mend · knack'));                            // knack replaces one Mend
  assert.ok(names.includes('Flesh') && names.includes('Swarm'));       // domains
  assert.equal(d.filter((k) => k.type === 'memory').length, 3);
  assert.ok(names.includes('Drive') && names.includes('Too Many Mouths'));
  assert.equal(d.filter((k) => k.kind === 'guard').length, 2);         // kinship guards twice as often
  assert.ok(names.includes('Chorus'));                                  // calling card
  assert.equal(cardsInPlay(e.char('sort7').deck).filter((k) => k.kind === 'guard').length, 1);
  assert.ok(e.events.filter((ev) => ev.type === 'deck.build').length === 3);
});

test('hand size is 3 + Horizon, and Narrowing shrinks it', () => {
  const e = mk(); e.enterScene(1);
  assert.equal(e.handSize('choir'), 4);  // horizon 1
  assert.equal(e.handSize('sort7'), 6);  // horizon 3
  e.drawHand('sort7');
  assert.equal(e.char('sort7').deck.hand.length, 6);
  e.changeCone('sort7', { horizon: -1 }, 'Narrowing');
  assert.equal(e.handSize('sort7'), 5);
});

test('a Move plus Edges build the pool; improvising gets the base die only', () => {
  const e = mk(); e.enterScene(2); // garden: Flesh, Swarm
  emptyHand(e, 'choir');
  const mend = hold(e, 'choir', (k) => k.type === 'knack');
  const flesh = hold(e, 'choir', (k) => k.type === 'domain' && k.domain === 'Flesh');
  const a = e.validateAction('choir', { do: 'mend Ilse', target: 'ally:ilse2', play: [mend.uid, flesh.uid] });
  assert.deepEqual(a.poolParts, ['base', 'Mend', 'mastery', 'Flesh']);
  assert.equal(a.pool, 4);
  const imp = e.validateAction('choir', { do: 'shove', target: 'clue', skill: 'Disrupt' });
  assert.equal(imp.pool, 1);
  assert.ok(imp.deck.improvised);
});

test('the Edge limit holds, and a domain only counts where the place has it', () => {
  const e = mk(); e.enterScene(1); // slope: Flesh, Number
  emptyHand(e, 'choir');
  const swarm = hold(e, 'choir', (k) => k.type === 'domain' && k.domain === 'Swarm');
  const drive = hold(e, 'choir', (k) => k.type === 'drive');
  const chorus = hold(e, 'choir', (k) => k.name === 'Chorus');
  const flesh = hold(e, 'choir', (k) => k.type === 'domain' && k.domain === 'Flesh');
  const a = e.validateAction('choir', { target: 'delve', do: 'go', play: [swarm.uid, drive.uid, flesh.uid] });
  assert.deepEqual(a.deck.edges.map((k) => k.uid), [swarm.uid, drive.uid]);
  assert.ok(a.poolParts.includes('Swarm:not here'));
  assert.ok(a.issues.some((i) => /edge limit/.test(i)));
  const b = e.validateAction('choir', { target: 'delve', do: 'go', play: [chorus.uid] });
  assert.equal(b.deck.edges.length, 0); // Chorus helps only allies and entities
});

test('flaws cut both ways: they hurt while held and help when played with the right Move', () => {
  const e = mk(); e.enterScene(2);
  emptyHand(e, 'choir');
  hold(e, 'choir', (k) => k.type === 'flaw');
  const signal = hold(e, 'choir', (k) => k.skill === 'Signal');
  const held = e.validateAction('choir', { target: 'npc:gardener', say: 'Finish one.', play: [signal.uid] });
  const played = e.validateAction('choir', { target: 'npc:gardener', say: 'Finish one.', play: [signal.uid, 'Too Many Mouths'] });
  assert.ok(played.poolParts.includes('Too Many Mouths'));
  assert.equal(played.pool, held.pool + 1);
  const conceal = e.validateAction('choir', { target: 'clue', do: 'hide', skill: 'Conceal' });
  assert.ok(conceal.poolParts.includes('-Too Many Mouths'));
  // Ilse-2's flaw mutes her memories while she holds it
  emptyHand(e, 'ilse2');
  hold(e, 'ilse2', (k) => k.type === 'flaw');
  const mem = hold(e, 'ilse2', (k) => k.type === 'memory' && k.memory === 'm1');
  const a = e.validateAction('ilse2', { target: 'clue', do: 'read', play: [mem.uid], memory: { reinterpretation: 'It was mine.' } });
  assert.ok(a.poolParts.includes('memory:m1:muted'));
});

test('guarding and remembering need the card in hand', () => {
  const e = mk(); e.enterScene(1);
  emptyHand(e, 'sort7');
  const noGuard = e.validateAction('sort7', { say: 'Behind me.', target: 'none', guard: 'ilse2' });
  assert.equal(noGuard.guard, null);
  const noMem = e.validateAction('sort7', { target: 'delve', do: 'go', memory: { id: 'm1', reinterpretation: 'The detour was the point.' } });
  assert.equal(noMem.memory, null);
  hold(e, 'sort7', (k) => k.kind === 'guard');
  hold(e, 'sort7', (k) => k.memory === 'm1');
  e.declare('sort7', { say: 'Behind me.', target: 'delve', do: 'go', guard: 'ilse2', memory: { id: 'm1', reinterpretation: 'The detour was the point.' } });
  assert.equal(e.state.guards.ilse2, 'sort7');
  assert.ok(e.events.some((ev) => ev.type === 'memory.invoke' && ev.actor === 'sort7'));
  assert.ok(!e.char('sort7').deck.hand.some((k) => k.kind === 'guard' || k.type === 'memory'));
});

test('a condition fallout becomes a status card; a haunt sets it down and heals it', () => {
  const e = mk(); e.enterScene(2);
  e.applyFallout({ actor: 'ilse2', severity: 'minor', resistance: 'substrate' }, 'leaking');
  const leaking = cardsInPlay(e.char('ilse2').deck).find((k) => k.name === 'Leaking');
  assert.ok(leaking && leaking.kind === 'status');
  assert.ok(e.char('ilse2').conditions.some((c) => c.name === 'Leaking'));
  e.char('ilse2').stress.substrate = 4;
  e.rest(e.declare('ilse2', { target: 'haunt:warm-bed', memory: { id: 'm3' }, remove: 'Leaking' }));
  assert.ok(!e.char('ilse2').conditions.some((c) => c.name === 'Leaking'));
  assert.ok(!cardsInPlay(e.char('ilse2').deck).some((k) => k.name === 'Leaking'));
  assert.ok(e.events.some((ev) => ev.type === 'deck.remove' && ev.data.card.name === 'Leaking'));
  assert.ok(types(e, 'ilse2').includes('resolve')); // rest still grants Resolve, as a card
});

test('innate flaws and the drive cannot be set down', () => {
  const e = mk(); e.enterScene(2);
  const a = e.validateAction('choir', { target: 'haunt:warm-bed', memory: { id: 'm1' }, remove: 'Too Many Mouths' });
  assert.equal(a.rest.remove, undefined);
  assert.ok(a.issues.some((i) => /who you are/.test(i)));
});

test('a compel nags: held at the end of a turn it costs stress; played with the last Move it goes', () => {
  const e = mk(); e.enterScene(1);
  e.applyFallout({ actor: 'sort7', severity: 'minor', resistance: 'coherence' }, 'looping');
  emptyHand(e, 'sort7');
  hold(e, 'sort7', (k) => k.kind === 'compel');
  e.endTurn('sort7');
  assert.ok(e.events.some((ev) => ev.type === 'stress' && ev.actor === 'sort7' && /compel/.test(ev.data.source)));
  emptyHand(e, 'sort7');
  const nav = hold(e, 'sort7', (k) => k.skill === 'Navigate');
  const loop = hold(e, 'sort7', (k) => k.kind === 'compel');
  e.char('sort7').deck.lastMove = 'Navigate';
  const a = e.declare('sort7', { target: 'delve', do: 'again', play: [nav.uid, loop.uid] });
  assert.equal(a.deck.compel.uid, loop.uid);
  assert.ok(!e.char('sort7').deck.hand.some((k) => k.kind === 'compel'));
});

test('Erasure takes the memory card and leaves a Gap', () => {
  const e = mk(); e.enterScene(1);
  e.loseMemory('ilse2', 'm2');
  const t = cardsInPlay(e.char('ilse2').deck);
  assert.ok(!t.some((k) => k.memory === 'm2'));
  assert.ok(t.some((k) => k.type === 'gap'));
});

test('the third Drive card played reveals the hidden drive', () => {
  const e = mk(); e.enterScene(1);
  for (let i = 0; i < 3; i++) {
    emptyHand(e, 'choir');
    hold(e, 'choir', (k) => k.type === 'drive');
    e.declare('choir', { target: 'delve', do: 'keep a shred of the slope', play: ['Drive'] });
  }
  const rev = e.events.find((ev) => ev.type === 'algotype.reveal' && ev.actor === 'choir');
  assert.equal(rev?.data.via, 'drive');
});

test('landmarks offer a draft; the next action takes a card into the deck', () => {
  const e = mk(); e.enterScene(2);
  const offer = e.char('sort7').deck.offer;
  assert.equal(offer.cards.length, 3);
  const before = cardsInPlay(e.char('sort7').deck).length;
  e.declare('sort7', { say: 'Index this.', target: 'none', draft: offer.cards[0].offerId });
  assert.equal(cardsInPlay(e.char('sort7').deck).length, before + 1);
  assert.equal(e.char('sort7').deck.offer, null);
  assert.match(playerActPrompt(e.playerView('ilse2')), /REWARD/);
});

test('preview has no side effects', () => {
  const e = mk(); e.enterScene(1);
  e.drawHand('sort7');
  const n = e.events.length;
  const hand = e.char('sort7').deck.hand.map((k) => k.uid);
  const p = e.previewAction('sort7', { target: 'clock:attractor', do: 'look', play: hand }); // attractor is outside SORT/7's cone
  assert.equal(e.events.length, n);
  assert.deepEqual(e.char('sort7').deck.hand.map((k) => k.uid), hand);
  assert.ok(p.issues.some((i) => /light cone/.test(i)));
});

test('legacy rules keep the free-form grammar and build no decks', () => {
  const e = mk({ deck: { enabled: false } });
  assert.equal(e.char('choir').deck, null);
  assert.ok(!e.events.some((ev) => ev.type === 'deck.build'));
  e.enterScene(1);
  assert.equal(e.drawHand('choir'), null);
  assert.equal(e.validateAction('choir', { do: 'push on', target: 'delve', skill: 'Endure', domain: 'Flesh' }).pool, 3);
});

test('deck sessions are deterministic, and a human seat can play through one', async () => {
  const run = (seed, players) => runSession({ scenario: APERTURE, cast, seed, gm: new MockGM({ seed }), players });
  const mocks = (seed) => Object.fromEntries(cast.map((c) => [c.id, new MockPlayer({ id: c.id, seed })]));
  const strip = (s) => s.events.map((e) => [e.type, e.actor, JSON.stringify(e.data)].join('|'));
  assert.deepEqual(strip((await run('d1', mocks('d1'))).session), strip((await run('d1', mocks('d1'))).session));

  // A scripted "human": plays the first Move and first Edge in hand, takes any draft.
  const seen = [];
  const ui = {
    async request(req) {
      seen.push(req.kind);
      if (req.kind === 'intro') return { text: 'I am here.', beats: req.calling.beats.filter((b) => b.tier !== 'zenith').slice(0, 2).map((b) => b.id) };
      if (req.kind === 'fallout') return { memory: req.view.you.memories[0]?.id, rewritten: 'It went otherwise.', last_words: 'Gone.' };
      if (req.kind === 'epilogue') return { text: 'Down and back.', memory: 'We went down.' };
      const d = req.view.you.deck;
      const move = d.hand.find((k) => k.kind === 'move');
      const edge = d.hand.find((k) => k.kind === 'edge' && k.type !== 'memory' && !k.edgeFor && !k.onlyTargets);
      const target = req.targets.find((t) => t.target === 'delve' || t.target === 'clue' || t.target.startsWith('clock:'))?.target ?? 'none';
      const intent = { say: 'Now.', do: 'try', target, play: [move?.uid, edge?.uid].filter(Boolean), draft: d.offer?.cards[0]?.offerId ?? null };
      const p = req.preview(intent);
      assert.equal(typeof p.pool === 'number' || p.pool === null, true);
      return intent;
    },
  };
  const players = { ...mocks('h1'), ilse2: new HumanPlayer({ id: 'ilse2', ui }) };
  const { session } = await run('h1', players);
  assert.ok(session.events.some((e) => e.type === 'ending'));
  assert.ok(seen.includes('intro') && seen.includes('act') && seen.includes('epilogue'));
  assert.ok(session.events.some((e) => e.type === 'agent.call' && e.data.human));
  assert.ok(session.events.some((e) => e.type === 'deck.play' && e.actor === 'ilse2'));
});
