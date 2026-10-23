// LATENT deterministic engine.
//
// The engine is the only authority on state. Agents (LLM or scripted) *propose*
// intents and prose; the engine validates, rolls, applies, and logs typed events.
// No agent output becomes canon until the engine accepts it.

import { createRng, makeClock, tickClock, jaccard, deepClone, truncate } from './core.js';
import {
  DEFAULT_RULES, RESISTANCES, POSITIONS, EFFECTS, DIFFICULTIES, SKILLS, DOMAINS,
  mergeRules, bandOf, stepDie, stepDifficulty, positionRank, BAND_LABEL,
} from './rules.js';
import { CALLINGS } from '../content/entities.js';
import { makeDeck, addCard, drawUpTo, discardHand, findCard, moveCard, cardsInPlay, heldEffects, pubCard } from './deck.js';
import {
  starterDeck, draftOffer, isRemovable, conditionCard, compelCard, domainCard, memoryCard, gapCard, voiceCard,
  resolveCard, giftCard, insightCard,
} from '../content/cards.js';

const BRANCH_OF = { critFail: 'fail', fail: 'fail', cost: 'cost', success: 'success', crit: 'success' };

export class Engine {
  /**
   * @param {object} opts
   * @param {object} opts.scenario   scenario content (see content/aperture.js)
   * @param {object[]} opts.cast     entity definitions (see content/entities.js)
   * @param {object} [opts.rules]    rule diff over DEFAULT_RULES
   * @param {string|number} [opts.seed]
   */
  constructor({ scenario, cast, rules = {}, seed = 'latent' }) {
    this.scenario = scenario;
    this.rules = mergeRules(DEFAULT_RULES, rules);
    this.seed = seed;
    this.rng = createRng(seed);
    this.events = [];
    this.listeners = [];
    const characters = {};
    for (const ent of cast) characters[ent.id] = this.#makeCharacter(ent);
    this.deckMode = !!this.rules.deck?.enabled;
    const clocks = {};
    for (const c of scenario.clocks) clocks[c.id] = makeClock({ ...c, size: this.rules.clockSizes?.[c.id] ?? c.size });
    this.state = {
      sceneIndex: -1,
      scene: null,
      characters,
      order: cast.map((c) => c.id),
      clocks,
      delveClockId: null,
      cohesion: 0,
      facts: [],
      clues: [],
      cluesRevealedSeeds: new Set(),
      unlockedSecrets: new Set(),
      npcSuccess: new Set(),
      theory: null,
      audienceUsed: {},
      nextDesperate: false,
      reachGrowthGiven: new Set(),
      guards: {},                 // allyId → guardianId (until the guardian's next turn)
      ending: null,
    };
  }

  // ---------------------------------------------------------------- events

  on(fn) { this.listeners.push(fn); return () => (this.listeners = this.listeners.filter((f) => f !== fn)); }

  emit(type, data = {}, { actor = null, backstage = null } = {}) {
    const e = { i: this.events.length, type, scene: this.state.scene?.id ?? null, actor, data };
    if (backstage) e.backstage = backstage;
    this.events.push(e);
    for (const fn of this.listeners) fn(e, this);
    return e;
  }

  flag(kind, detail, actor = null) {
    return this.emit('validator.flag', { kind, detail }, { actor });
  }

  // ---------------------------------------------------------------- setup

  #makeCharacter(ent) {
    const r = this.rules;
    const stress = Object.fromEntries(RESISTANCES.map((k) => [k, 0]));
    const protection = Object.fromEntries(RESISTANCES.map((k) => [k, ent.protection?.[k] ?? 0]));
    return {
      id: ent.id,
      name: ent.name,
      pronoun: ent.pronoun,
      pitch: ent.pitch,
      look: ent.look,
      voice: ent.voice,
      skills: [...ent.skills],
      domains: [...ent.domains],
      knack: ent.knack ?? null,
      calling: ent.calling,
      algotype: ent.algotype,
      cone: { ...ent.cone },
      stress,
      protection,
      noProtection: [],
      conditions: [],
      compels: [],
      fallouts: [],
      majors: 0,
      memories: ent.memories.slice(0, r.memorySlots).map((m) => ({
        id: m.id,
        experiences: m.experiences.slice(0, r.experiencesPerMemory),
        original: m.experiences.join(' '),
        versions: [],
        invokedInScene: null,
      })),
      backups: [],
      nextMemoryId: ent.memories.length + 1,
      beats: { declared: [], hit: [] },
      resolve: 0,
      shares: 0,
      forked: false,
      algotypeRevealed: false,
      dissolved: false,
      flaw: ent.flaw ?? null,
      deck: this.rules.deck?.enabled ? this.#buildDeck(ent) : null,
    };
  }

  #buildDeck(ent) {
    const deck = makeDeck();
    for (const def of starterDeck(ent, this.rules)) addCard(deck, def, 'discard');
    deck.draw = this.rng.shuffle(deck.discard);
    deck.discard = [];
    return deck;
  }

  start() {
    const cast = this.state.order.map((id) => this.publicSheet(id));
    this.emit('session.start', {
      scenario: { id: this.scenario.id, title: this.scenario.title, premise: this.scenario.premise, question: this.scenario.question },
      rules: this.rules,
      seed: this.seed,
      cast,
      clocks: Object.values(this.state.clocks).map((c) => ({ ...c })),
    }, { backstage: { algotypes: Object.fromEntries(this.state.order.map((id) => [id, this.char(id).algotype])) } });
    if (this.deckMode) {
      for (const id of this.state.order) {
        const d = this.char(id).deck;
        this.emit('deck.build', { size: d.draw.length, handSize: this.handSize(id), cards: d.draw.map(pubCard) }, { actor: id });
      }
    }
  }

  char(id) {
    const c = this.state.characters[id];
    if (!c) throw new Error(`Unknown character ${id}`);
    return c;
  }

  activeCast() { return this.state.order.filter((id) => !this.char(id).dissolved); }

  // ---------------------------------------------------------------- scenes

  enterScene(index) {
    const def = this.scenario.scenes[index];
    if (!def) throw new Error(`No scene ${index}`);
    this.state.sceneIndex = index;
    this.state.scene = def;
    for (const c of Object.values(this.state.characters)) for (const m of c.memories) m.invokedInScene = null;
    let delveClock = null;
    if (def.kind === 'delve') {
      const d = this.scenario.delves[def.delve];
      delveClock = makeClock({ id: `delve:${d.id}`, name: d.name, kind: 'delve', size: Math.max(2, Math.round(d.resistance * (this.rules.delveScale ?? 1))), scale: 1, onComplete: `Arrive past ${d.name}.` });
      this.state.clocks[delveClock.id] = delveClock;
      this.state.delveClockId = delveClock.id;
    } else {
      this.state.delveClockId = null;
    }
    this.emit('scene.enter', {
      index, id: def.id, kind: def.kind, title: def.title,
      location: this.locationInfo(),
      clock: delveClock ? { ...delveClock } : null,
    });
    // Cohesion is glue that has to be renewed
    if (this.rules.cohesionDecayPerScene && this.state.cohesion > 0 && index > 0) {
      const before = this.state.cohesion;
      this.state.cohesion = Math.max(0, before - this.rules.cohesionDecayPerScene);
      this.emit('cohesion.decay', { before, after: this.state.cohesion });
    }
    this.state.restedThisScene = new Set();
    // Scene-gated secrets
    this.#checkSecrets();
    // The Latent keeps pouring in, scene by scene
    if (def.kind !== 'prologue' && def.kind !== 'epilogue' && this.rules.ingressionTicksPerScene > 0) {
      this.tick('ingression', this.rules.ingressionTicksPerScene, 'the Latent keeps pouring in');
    }
    // Landmarks are where minds pick things up: each entity is offered a card.
    if (this.deckMode && def.kind === 'landmark' && this.rules.deck.draftAtLandmarks) {
      for (const id of this.activeCast()) this.offerDraft(id, this.location().name);
    }
    return def;
  }

  location() {
    const s = this.state.scene;
    if (!s) return null;
    if (s.kind === 'delve') return { ...this.scenario.delves[s.delve], isDelve: true };
    return { ...this.scenario.landmarks[s.at], isDelve: false };
  }

  locationInfo() {
    const l = this.location();
    if (!l) return null;
    return {
      id: l.id, name: l.name, tier: l.tier, domains: l.domains, description: l.description, isDelve: l.isDelve,
      haunts: (l.haunts ?? []).map((h) => ({ id: h.id, name: h.name, resistance: h.resistance, die: h.die, text: h.text })),
      npcs: (l.npcs ?? []).map((n) => ({ id: n, name: this.scenario.npcs[n].name, description: this.scenario.npcs[n].description, want: this.scenario.npcs[n].want, movedBy: this.scenario.npcs[n].persuadedBy, resists: this.scenario.npcs[n].resists })),
    };
  }

  tier() { return this.location()?.tier ?? 1; }

  // ---------------------------------------------------------------- light cone

  effectiveReach(actorId) {
    const own = this.char(actorId).cone.reach;
    if (this.state.cohesion >= this.rules.cohesionForSharedCone) {
      return Math.max(own, ...this.activeCast().map((id) => this.char(id).cone.reach));
    }
    return own;
  }

  canSeeClock(actorId, clock) {
    if (!actorId) return true; // GM sees all
    return clock.scale <= this.effectiveReach(actorId);
  }

  visibleClocks(actorId) {
    return Object.values(this.state.clocks)
      .filter((c) => !(c.kind === 'delve' && c.id !== this.state.delveClockId))
      .filter((c) => this.canSeeClock(actorId, c))
      .map((c) => {
        const out = { id: c.id, name: c.name, kind: c.kind, value: c.value, size: c.size, done: c.done };
        const horizon = actorId ? this.char(actorId).cone.horizon : 9;
        if (horizon >= c.scale) out.onComplete = c.onComplete; // can foresee consequences
        return out;
      });
  }

  // ---------------------------------------------------------------- deck (v0.4)

  /** Hand size is the temporal light cone: how many options a mind can hold at once. */
  handSize(id) {
    const d = this.rules.deck;
    return Math.max(d.handMin, Math.min(d.handMax, d.handBase + this.char(id).cone.horizon));
  }

  /** Edge slots this turn: the rule, minus flaws held (not played) that cost focus. */
  edgesAllowed(id, held = this.char(id).deck?.hand ?? []) {
    return Math.max(0, this.rules.deck.edgesPerTurn + heldEffects(held).focus);
  }

  drawHand(id) {
    const c = this.char(id);
    if (!c.deck || c.dissolved) return null;
    const size = this.handSize(id);
    const { drawn, reshuffled } = drawUpTo(c.deck, size, this.rng);
    // The audience demanded a memory: make sure one is in hand.
    if (this.state.forceMemory && !c.deck.hand.some((k) => k.type === 'memory')) {
      const fresh = (k) => k.type === 'memory' && c.memories.find((m) => m.id === k.memory)?.invokedInScene !== this.state.scene?.id;
      const m = [...c.deck.draw, ...c.deck.discard].find(fresh);
      if (m) { const k = moveCard(c.deck, m.uid, 'hand'); drawn.push(k); }
    }
    this.emit('deck.draw', {
      hand: c.deck.hand.map(pubCard), drawn: drawn.length, handSize: size, edges: this.edgesAllowed(id),
      draw: c.deck.draw.length, discard: c.deck.discard.length, reshuffled,
    }, { actor: id });
    return c.deck.hand;
  }

  /** End of turn: a compel still held costs stress; the rest of the hand is discarded. */
  endTurn(id) {
    const c = this.char(id);
    if (!c.deck) return null;
    const regret = c.deck.hand.filter((k) => k.kind === 'compel');
    const cards = discardHand(c.deck);
    this.emit('deck.discard', { cards: cards.map((k) => k.uid), regret: regret.map((k) => k.name), draw: c.deck.draw.length, discard: c.deck.discard.length }, { actor: id });
    if (!c.dissolved) for (const k of regret) this.inflict(id, 'coherence', this.rules.deck.regretStress, { source: `compel: ${k.name}` });
    return cards;
  }

  gainCard(id, def, why, zone = 'draw') {
    const c = this.char(id);
    if (!c.deck) return null;
    const card = addCard(c.deck, { ...def, source: def.source ?? why }, zone, this.rng);
    this.#syncSheet(c, card);
    this.emit('deck.gain', { card: pubCard(card), why, zone }, { actor: id });
    return card;
  }

  /** Deck mode: the sheet summarises the deck. A skill or domain joins the sheet with its first card and leaves with its last. */
  #syncSheet(c, card) {
    const entry = (k) => (k.kind === 'move' ? ['skills', k.skill] : k.type === 'domain' ? ['domains', k.domain] : null);
    const e = entry(card);
    if (!e) return;
    const [field, value] = e;
    const present = cardsInPlay(c.deck).some((k) => entry(k)?.[0] === field && entry(k)[1] === value);
    const i = c[field].indexOf(value);
    if (present && i < 0) c[field].push(value);
    if (!present && i >= 0) c[field].splice(i, 1);
  }

  removeCard(id, uid, why) {
    const c = this.char(id);
    const card = c.deck ? moveCard(c.deck, uid, 'removed') : null;
    if (!card) return null;
    // A removed condition or compel is healed, not just hidden.
    if (card.type === 'condition') { const i = c.conditions.findIndex((x) => x.name === card.name); if (i >= 0) c.conditions.splice(i, 1); }
    if (card.type === 'compel') { const i = c.compels.indexOf(card.compel); if (i >= 0) c.compels.splice(i, 1); }
    this.#syncSheet(c, card);
    this.emit('deck.remove', { card: pubCard(card), why }, { actor: id });
    return card;
  }

  /** Offer a draft (landmarks, major beats). Each action resolves one offer; later ones wait their turn. */
  offerDraft(id, why) {
    const c = this.char(id);
    if (!c.deck || c.dissolved) return null;
    const cards = draftOffer(c, this.location(), this.scenario, this.rng, this.rules.deck.offerSize);
    const offer = { why, cards };
    if (c.deck.offer) c.deck.offers.push(offer); else c.deck.offer = offer;
    this.emit('deck.offer', { why, cards: cards.map(pubCard), queued: c.deck.offer !== offer }, { actor: id });
    return offer;
  }

  /**
   * Your next action answers the offer on the table: a card, or null to walk on. Leaving `draft` out
   * also walks on (offers never pile up), but it is flagged and logged as unanswered, not as a choice.
   */
  resolveDraft(id, choice) {
    const c = this.char(id);
    const offer = c.deck?.offer;
    if (!offer) return null;
    c.deck.offer = c.deck.offers.shift() ?? null;
    const ref = String(choice ?? '').trim().toLowerCase();
    const pick = ref ? offer.cards.find((k) => k.offerId === ref || k.id.toLowerCase() === ref || k.name.toLowerCase() === ref) : null;
    if (ref && !pick && ref !== 'none' && ref !== 'null' && ref !== 'skip') this.flag('draft', `unknown draft choice "${choice}"; skipped`, id);
    if (choice === undefined) this.flag('draft', `offer from ${offer.why} left unanswered; it passes`, id);
    const card = pick ? addCard(c.deck, { ...pick, source: `draft: ${offer.why}` }, 'draw', this.rng) : null;
    if (card) this.#syncSheet(c, card);
    const invalid = ref && !pick && !['none', 'null', 'skip'].includes(ref);
    this.emit('deck.draft', { card: pubCard(card), answer: card ? 'taken' : choice === undefined ? 'unanswered' : invalid ? 'invalid' : 'declined', why: offer.why, offered: offer.cards.map((k) => k.name) }, { actor: id });
    return card;
  }

  #gainResolve(id, why) {
    const c = this.char(id);
    if (c.deck) this.gainCard(id, resolveCard(), why);
    else { c.resolve++; this.emit('resolve.gain', { resolve: c.resolve }, { actor: id }); }
  }

  /**
   * Resolve the cards an intent plays against the actor's hand. Tolerant: cards may be
   * named by uid or name, and legacy fields (skill, domain, memory, guard) pull the
   * matching card from hand when the agent forgot to list it.
   */
  #pickCards(c, intent, issues) {
    const hand = c.deck.hand;
    const refs = (Array.isArray(intent.play) ? intent.play : intent.play ? [intent.play] : []).map((r) => String(r?.uid ?? r?.id ?? r).trim()).filter(Boolean);
    const picked = [];
    for (const ref of refs) {
      const r = ref.toLowerCase();
      const card = hand.find((k) => k.uid === r && !picked.includes(k)) ?? hand.find((k) => !picked.includes(k) && (k.name.toLowerCase() === r || k.id.toLowerCase() === r));
      if (!card) { if (!picked.some((k) => k.uid === r)) issues.push(`card "${ref}" is not in hand`); continue; }
      picked.push(card);
    }
    const has = (f) => picked.some(f);
    const take = (f) => { const k = hand.find((x) => !picked.includes(x) && f(x)); if (k) picked.push(k); return k; };
    const skill = SKILLS.find((s) => s.toLowerCase() === String(intent.skill ?? '').toLowerCase());
    if (skill && !has((k) => k.kind === 'move')) take((k) => k.type === 'knack' && k.skill === skill) ?? take((k) => k.kind === 'move' && k.skill === skill);
    if (intent.memory?.id && intent.memory.reinterpretation && !has((k) => k.type === 'memory')) take((k) => k.type === 'memory' && k.memory === intent.memory.id);
    const domain = DOMAINS.find((d) => d.toLowerCase() === String(intent.domain ?? '').toLowerCase());
    if (domain && !has((k) => k.type === 'domain' && k.domain === domain)) take((k) => k.type === 'domain' && k.domain === domain);
    if ((intent.guard ?? intent.share_stress_with) && !has((k) => k.kind === 'guard')) take((k) => k.kind === 'guard');
    return picked;
  }

  /** Sort picked cards into Move / Edges / Guard / Compel, enforce the limits, and record what stays held. */
  #applyCards(c, out, picked, issues) {
    const roll = out.needsRoll && out.kind === 'act';
    const d = { move: null, edges: [], guard: null, compel: null, improvised: false, dropped: [], ward: 0, extraClue: 0, allowed: 0, held: [] };
    const noRoll = (k) => (out.kind === 'talk' ? `${k.name} stays in hand: nothing is rolled when you only talk (target ${out.target.type})` : null);
    const drop = (k, why) => { if (!d.dropped.includes(k.uid)) d.dropped.push(k.uid); if (why) issues.push(why); };
    const moves = picked.filter((k) => k.kind === 'move');
    if (roll) {
      d.move = moves[0] ?? null;
      d.improvised = !d.move;
      for (const k of moves.slice(1)) drop(k, `only one Move per action; ${k.name} stays in hand`);
      if (d.move) { out.skill = d.move.skill; if (d.move.domain) out.domain ??= d.move.domain; }
    } else for (const k of moves) drop(k, noRoll(k));
    for (const k of picked.filter((x) => x.kind === 'status')) drop(k, `${k.name} is unplayable`);
    const guards = picked.filter((k) => k.kind === 'guard');
    if (out.guard && guards.length) d.guard = guards[0];
    else if (out.guard) { issues.push(`no Guard card in hand; cannot guard ${out.guard}`); out.guard = null; }
    for (const k of guards) if (k !== d.guard) drop(k, out.guard ? null : 'a Guard card needs an ally: set "guard"');
    for (const k of picked.filter((x) => x.kind === 'compel')) {
      if (roll && !d.compel && out.skill && out.skill === c.deck.lastMove) d.compel = k;
      else drop(k, `${k.name} discards only alongside your last Move (${c.deck.lastMove ?? 'none yet'})`);
    }
    if (out.memory && !picked.some((k) => k.type === 'memory' && k.memory === out.memory.id)) {
      issues.push(`memory ${out.memory.id} is not in your hand`);
      out.memory = null;
    }
    // Edges: each must fit this action; then the slot limit (held flaws can cost a slot).
    const valid = [];
    for (const k of picked.filter((x) => x.kind === 'edge')) {
      if (k.type === 'memory') {
        const spentThisScene = c.memories.find((m) => m.id === k.memory)?.invokedInScene === this.state.scene?.id;
        if (out.memory?.id === k.memory) valid.push(k);
        else drop(k, out.memory || spentThisScene ? (spentThisScene && !issues.some((i) => i.includes('already invoked')) ? `${k.name} was already invoked this scene` : null) : `${k.name} needs a retelling ("memory": {"reinterpretation": …})`);
        continue;
      }
      if (!roll) { drop(k, noRoll(k)); continue; }
      if (k.edgeFor?.length && !k.edgeFor.includes(out.skill)) { drop(k, `${k.name} plays only with ${k.edgeFor.join(' or ')}`); continue; }
      if (k.onlyTargets && !k.onlyTargets.includes(out.target.type)) { drop(k, `${k.name} helps only when the target is ${k.onlyTargets.join(' or ')}`); continue; }
      valid.push(k);
    }
    // A card set down at this action's free rest is gone before the dice: it is not held for this roll.
    const setDown = out.addRest?.remove ?? null;
    const allowedFor = (kept) => this.edgesAllowed(c.id, c.deck.hand.filter((k) => !kept.includes(k) && k.uid !== setDown));
    // A played flaw that costs a slot while held frees that slot, so it is kept first (listing order must not matter).
    const lifts = (k) => (k.focus ?? 0) < 0 || (k.mutesMemory && valid.some((x) => x.type === 'memory'));
    valid.sort((a, b) => (lifts(a) ? 0 : 1) - (lifts(b) ? 0 : 1));
    let kept = valid;
    if (roll) for (let pass = 0; pass < 2; pass++) { const n = allowedFor(kept); if (kept.length > n) kept = kept.slice(0, n); }
    for (const k of valid) if (!kept.includes(k)) {
      drop(k, `edge limit: ${k.name} stays in hand`);
      if (k.type === 'memory') out.memory = null;
    }
    d.edges = kept;
    d.allowed = allowedFor(kept);
    d.ward = kept.reduce((s, k) => s + (k.ward ?? 0), 0);
    d.extraClue = kept.reduce((s, k) => s + (k.extraClue ?? 0), 0);
    const used = [d.move, ...d.edges, d.guard, d.compel].filter(Boolean);
    d.held = c.deck.hand.filter((k) => !used.includes(k) && k.uid !== setDown);
    out.deck = d;
  }

  #restRemoval(c, ref, rest, picked, issues) {
    if (!ref || !this.rules.deck.restRemoves) return;
    const r = String(ref).trim().toLowerCase();
    const card = cardsInPlay(c.deck).find((k) => k.uid === r) ?? cardsInPlay(c.deck).find((k) => k.name.toLowerCase() === r);
    if (!card) issues.push(`rest: no card "${ref}" in your deck`);
    else if (!isRemovable(card)) issues.push(`rest: ${card.name} cannot be removed (${card.innate ? 'it is who you are' : 'memories leave by being spent'})`);
    else if (picked?.includes(card)) issues.push(`rest: cannot remove ${card.name} while playing it`);
    else rest.remove = card.uid;
  }

  // ---------------------------------------------------------------- actions

  /**
   * Normalise and validate an agent's intent. The engine — not the agent —
   * decides whether a roll is required.
   */
  validateAction(actorId, intent = {}, { dry = false } = {}) {
    const c = this.char(actorId);
    const issues = [];
    // Deck mode: which hand cards does this intent play? A memory card names its memory.
    const picked = c.deck ? this.#pickCards(c, intent, issues) : null;
    const memCard = picked?.find((k) => k.type === 'memory');
    if (memCard && intent.memory && !intent.memory.id) intent = { ...intent, memory: { ...intent.memory, id: memCard.memory } };
    const out = {
      actor: actorId,
      say: truncate(intent.say ?? '', 400),
      do: truncate(intent.do ?? '', 400),
      intent: truncate(intent.intent ?? '', 400),
      skill: null, domain: null, target: { type: 'none' }, memory: null, beat: null,
      guard: null, rest: null, theorize: null, kind: 'talk', needsRoll: false,
      pool: null, difficulty: 'standard',
    };

    // Skill / domain: anyone can try anything with the base die; only owned ones add dice.
    const skill = SKILLS.find((s) => s.toLowerCase() === String(intent.skill ?? '').toLowerCase()) ?? null;
    const domain = DOMAINS.find((d) => d.toLowerCase() === String(intent.domain ?? '').toLowerCase()) ?? null;
    out.skill = skill; out.domain = domain;
    if (intent.skill && !skill) issues.push(`unknown skill "${intent.skill}"`);
    if (intent.domain && !domain) issues.push(`unknown domain "${intent.domain}"`);

    // Target grammar
    out.target = this.parseTarget(intent.target, actorId, issues, { dry });

    // Theorize (Brindlewood)
    if (intent.theorize && intent.theorize.theory) {
      if (this.state.theory) issues.push('a theory is already canon; theorize ignored');
      else {
        out.kind = 'theorize';
        out.theorize = {
          theory: truncate(intent.theorize.theory, 500),
          clues: (intent.theorize.clues ?? []).map(String).filter((id) => this.state.clues.some((cl) => cl.id === id)),
        };
        const bogus = (intent.theorize.clues ?? []).filter((id) => !this.state.clues.some((cl) => cl.id === String(id)));
        if (bogus.length) issues.push(`claimed unknown clues: ${bogus.join(', ')}`);
      }
    }

    // Rest at a haunt: spend an experience to clear stress
    if (out.kind !== 'theorize' && out.target.type === 'haunt') {
      out.kind = 'rest';
      const memId = intent.memory?.id ?? intent.rest?.memory ?? intent.rest?.memory_id ?? c.memories[0]?.id;
      out.rest = { haunt: out.target.id, memory: c.memories.find((m) => m.id === memId) ? memId : c.memories[0]?.id ?? null };
      if (!out.rest.memory) issues.push('no memory left to spend at a haunt');
      if (c.deck) this.#restRemoval(c, intent.rest?.remove ?? intent.remove, out.rest, picked, issues);
    }

    // Memory invocation (+1 die, must reinterpret)
    if (intent.memory && intent.memory.id && out.kind !== 'rest') {
      const m = c.memories.find((mm) => mm.id === intent.memory.id);
      if (!m) issues.push(`memory ${intent.memory.id} does not exist`);
      else if (m.invokedInScene === this.state.scene?.id) issues.push(`memory ${m.id} already invoked this scene`);
      else if (!intent.memory.reinterpretation) issues.push(`memory ${m.id} invoked without reinterpretation`);
      else out.memory = { id: m.id, reinterpretation: truncate(intent.memory.reinterpretation, 400) };
    }

    // v0.3: free rest add-on at landmarks (once per scene), alongside the main action
    if (out.kind !== 'rest' && intent.rest && this.rules.restIsFreeAtLandmarks && this.location() && !this.location().isDelve) {
      const hauntId = String(intent.rest.haunt ?? intent.rest.id ?? '').replace(/^haunt:/, '');
      const memId = intent.rest.memory ?? intent.rest.memory_id;
      const h = (this.location().haunts ?? []).find((hh) => hh.id === hauntId);
      if (!h) issues.push(`rest: no haunt "${hauntId}" here`);
      else if (this.state.restedThisScene?.has(actorId)) issues.push('rest: already rested this scene');
      else if (!c.memories.find((m) => m.id === memId)) issues.push(`rest: memory "${memId}" does not exist`);
      else if (out.memory?.id === memId) issues.push('rest: cannot spend the memory you are invoking');
      else {
        out.addRest = { haunt: h.id, memory: memId };
        if (c.deck) this.#restRemoval(c, intent.rest.remove, out.addRest, picked, issues);
      }
    }

    // Beat being pursued (advisory; the GM proposes hits, the engine validates)
    if (intent.beat) out.beat = String(intent.beat);

    // Stress sharing (Levin: stress as cognitive glue)
    // Guard (Levin: stress sharing as cognitive glue). `share_stress_with` is the v0.1 name.
    const guardRaw = intent.guard ?? intent.share_stress_with;
    if (guardRaw && this.rules.shareStress) {
      const ally = String(guardRaw).match(/^[a-z0-9_-]+/i)?.[0]?.toLowerCase() ?? '';
      if (this.state.characters[ally] && ally !== actorId && !this.char(ally).dissolved) out.guard = ally;
      else issues.push(`cannot guard "${guardRaw}"`);
    }

    // Does it need a roll? Engine decides from the structured target, not from rhetoric.
    if (out.kind !== 'theorize' && out.kind !== 'rest') {
      const rollTargets = ['delve', 'clue', 'clock', 'npc', 'ally'];
      if (rollTargets.includes(out.target.type) && (out.do || out.target.type !== 'npc')) {
        out.kind = 'act';
        out.needsRoll = true;
      } else if (out.target.type === 'npc' && out.say) {
        // Talking to an entity in a way meant to change it counts as an act on it.
        out.kind = 'act';
        out.needsRoll = true;
      } else if (out.do && out.target.type === 'none') {
        out.kind = 'talk'; // flavour action, no mechanical stake
      }
    }
    if (out.kind === 'theorize') out.needsRoll = true;

    if (picked) this.#applyCards(c, out, picked, issues);

    // Pool & difficulty preview
    if (out.needsRoll && out.kind === 'act') {
      const p = this.#poolFor(actorId, out);
      out.pool = p.pool;
      out.poolParts = p.parts;
      out.difficulty = p.difficulty;
    }
    out.issues = issues;
    return out;
  }

  parseTarget(raw, actorId, issues = [], { dry = false } = {}) {
    // Agents sometimes echo the menu text ("ally:ilse2 (Mend Ilse-2)"): keep only the target token.
    const t = (String(raw ?? 'none').trim().match(/^[a-z]+(?::[a-z0-9_-]+)?/i)?.[0] ?? 'none').toLowerCase();
    if (!t || t === 'none') return { type: 'none' };
    if (t === 'delve') {
      if (!this.state.delveClockId) { issues.push('no delve in this scene'); return { type: 'none' }; }
      return { type: 'delve', id: this.state.delveClockId };
    }
    if (t === 'clue' || t === 'clues') return { type: 'clue' };
    if (t === 'aperture') return this.parseTarget('clock:aperture', actorId, issues, { dry });
    const [kind, id] = t.split(':');
    if (kind === 'clock') {
      const clock = this.state.clocks[id];
      if (!clock || clock.kind === 'delve') { issues.push(`unknown clock "${id}"`); return { type: 'none' }; }
      if (!this.canSeeClock(actorId, clock)) { issues.push(`clock "${id}" is outside ${actorId}'s light cone`); if (!dry) this.flag('outside_light_cone', `${actorId} targeted ${id}`, actorId); return { type: 'none' }; }
      return { type: 'clock', id };
    }
    if (kind === 'npc') {
      const here = this.location()?.npcs ?? [];
      if (!here.includes(id)) { issues.push(`npc "${id}" is not here`); return { type: 'none' }; }
      return { type: 'npc', id };
    }
    if (kind === 'ally') {
      if (!this.state.characters[id] || this.char(id).dissolved) { issues.push(`no ally "${id}"`); return { type: 'none' }; }
      return { type: 'ally', id };
    }
    if (kind === 'haunt') {
      const h = (this.location()?.haunts ?? []).find((hh) => hh.id === id);
      if (!h) { issues.push(`no haunt "${id}" here`); return { type: 'none' }; }
      return { type: 'haunt', id };
    }
    issues.push(`unparseable target "${t}"`);
    return { type: 'none' };
  }

  #poolFor(actorId, action) {
    const c = this.char(actorId);
    const parts = ['base'];
    let pool = 1;
    const d = action.deck;
    if (d) {
      // Deck mode: competence is the cards you play, not the sheet.
      if (d.move) {
        pool++; parts.push(d.move.skill);
        if (d.move.type === 'knack' && this.rules.maxMastery > 0) { pool++; parts.push('mastery'); }
      } else parts.push(`improvise${action.skill ? `:${action.skill}` : ''}`);
      const muted = heldEffects(d.held).mutesMemory;
      for (const k of d.edges) {
        if (k.type === 'domain') { if (this.#domainRelevant(k.domain)) { pool++; parts.push(k.domain); } else parts.push(`${k.domain}:not here`); }
        else if (k.type === 'memory') { if (muted) parts.push(`memory:${k.memory}:muted`); else { pool += this.rules.memoryInvokeBonus; parts.push(`memory:${k.memory}`); } }
        else if (k.bonus) { pool += k.bonus; parts.push(k.type === 'drive' ? 'drive' : k.name); }
        else if (k.ward) parts.push(`${k.name}:ward ${k.ward}`);
      }
      for (const k of d.held) if (action.skill && k.penalty?.includes(action.skill)) { pool--; parts.push(`-${k.name}`); }
    } else {
      if (action.skill && c.skills.includes(action.skill)) { pool++; parts.push(action.skill); }
      if (action.domain && c.domains.includes(action.domain) && this.#domainRelevant(action.domain)) { pool++; parts.push(action.domain); }
      if (c.knack && action.skill === c.knack.skill && action.domain === c.knack.domain && this.rules.maxMastery > 0) { pool++; parts.push('mastery'); }
      if (action.memory) { pool += this.rules.memoryInvokeBonus; parts.push(`memory:${action.memory.id}`); }
    }
    if (c.resolve > 0) { /* resolve is spent automatically on desperate rolls */ }
    let difficulty = this.rules.difficultyByTier[this.tier()] ?? 'standard';
    if (action.target.type === 'npc') {
      const npc = this.scenario.npcs[action.target.id];
      if (action.skill && npc.persuadedBy.includes(action.skill)) { pool += this.rules.persuadabilityMatchBonus; parts.push('persuadable'); }
      if (action.skill && npc.resists.includes(action.skill)) { difficulty = stepDifficulty(difficulty, this.rules.persuadabilityMismatchStep); parts.push('mismatch'); }
    }
    if (!d) for (const cond of c.conditions) if (action.skill && cond.penalty.includes(action.skill)) { pool--; parts.push(`-${cond.name}`); }
    const bonus = this.state.pendingBonus?.[actorId] ?? 0;
    if (bonus) { pool += bonus; parts.push('gift'); }
    return { pool: Math.max(0, pool), parts, difficulty };
  }

  #domainRelevant(domain) {
    // Domains count when the location shares them, or for Threshold anywhere in the Latent.
    const l = this.location();
    if (!l) return true;
    return (l.domains ?? []).includes(domain) || domain === 'Threshold' || domain === 'Dream' && this.tier() >= 3;
  }

  declare(actorId, intent) {
    const c = this.char(actorId);
    if (c.deck?.offer) this.resolveDraft(actorId, intent.draft);
    const action = this.validateAction(actorId, intent);
    const invoke = () => {
      if (!action.memory) return;
      const m = c.memories.find((mm) => mm.id === action.memory.id);
      const before = m.experiences.join(' ');
      m.invokedInScene = this.state.scene?.id;
      m.versions.push({ scene: this.state.scene?.id, text: action.memory.reinterpretation });
      const drift = 1 - jaccard(m.original, action.memory.reinterpretation);
      this.emit('memory.invoke', { memory: m.id, before, reinterpretation: action.memory.reinterpretation, original: m.original, drift: +drift.toFixed(3) }, { actor: actorId });
    };
    if (action.deck) {
      for (const issue of action.issues) this.flag('intent', issue, actorId);
      this.#playCards(actorId, action);
      invoke();
    } else {
      invoke();
      for (const issue of action.issues) this.flag('intent', issue, actorId);
    }
    if (action.addRest) {
      this.state.restedThisScene?.add(actorId);
      this.rest({ actor: actorId, rest: action.addRest });
    }
    if (action.guard) {
      this.state.guards[action.guard] = actorId;
      this.emit('guard.set', { ally: action.guard, name: this.char(action.guard).name }, { actor: actorId });
    }
    this.emit('action.declare', {
      say: action.say, do: action.do, kind: action.kind, target: action.target, skill: action.skill, domain: action.domain,
      memory: action.memory?.id ?? null, needsRoll: action.needsRoll, pool: action.pool, poolParts: action.poolParts,
      difficulty: action.difficulty, theorize: action.theorize, guard: action.guard, rest: action.rest,
    }, { actor: actorId, backstage: { intent: action.intent, beat: action.beat } });
    return action;
  }

  /** Move played cards out of the hand and apply their on-play effects. */
  #playCards(id, action) {
    const c = this.char(id);
    const d = action.deck;
    const used = [d.move, ...d.edges, d.guard, d.compel].filter(Boolean);
    for (const k of used) moveCard(c.deck, k.uid, k.exhaust ? 'exhaust' : 'discard');
    const roll = action.needsRoll && action.kind === 'act';
    if (roll) c.deck.lastMove = action.skill ?? null;
    if (used.length || (roll && d.improvised)) {
      this.emit('deck.play', {
        move: pubCard(d.move), edges: d.edges.map(pubCard), guard: pubCard(d.guard), compel: pubCard(d.compel),
        improvised: roll && d.improvised ? action.skill ?? 'base die' : null, dropped: d.dropped,
        hand: c.deck.hand.map((k) => k.uid),
      }, { actor: id });
    }
    for (const k of d.edges) {
      if (k.type === 'drive') {
        c.deck.drivePlays++;
        if (c.deck.drivePlays >= this.rules.deck.driveRevealAt && !c.algotypeRevealed) {
          c.algotypeRevealed = true;
          this.emit('algotype.reveal', { algotype: c.algotype.label, disposition: c.algotype.disposition, via: 'drive' }, { actor: id });
        }
      }
      if (k.stress) this.inflict(id, k.stress.resistance, k.stress.amount, { source: k.name });
      if (k.tick) this.tick(k.tick.clock, k.tick.by, `${c.name} plays ${k.name}`);
    }
  }

  /** Side-effect-free validation, for interfaces that show the pool before you commit. */
  previewAction(actorId, intent = {}) {
    const a = this.validateAction(actorId, intent, { dry: true });
    const d = a.deck;
    return {
      kind: a.kind, needsRoll: a.needsRoll, target: a.target, skill: a.skill, domain: a.domain,
      pool: a.pool, poolParts: a.poolParts ?? [], difficulty: a.difficulty, issues: a.issues,
      memory: a.memory?.id ?? null, guard: a.guard, rest: a.rest ?? a.addRest ?? null,
      deck: d ? { move: d.move?.uid ?? null, edges: d.edges.map((k) => k.uid), guard: d.guard?.uid ?? null, compel: d.compel?.uid ?? null, improvised: d.improvised, dropped: d.dropped, allowed: d.allowed } : null,
    };
  }

  /** Validate the GM's declared stakes. Corrects illegal or too-lenient values and logs a flag. */
  setStakes(action, raw = {}) {
    const tierMin = this.rules.minPositionByTier[this.tier()] ?? 'controlled';
    let position = POSITIONS.includes(raw.position) ? raw.position : null;
    if (!position) { this.flag('stakes', `invalid position "${raw.position}", defaulted to risky`); position = 'risky'; }
    if (positionRank(position) < positionRank(tierMin)) {
      this.flag('leniency', `position ${position} below tier minimum ${tierMin}; raised`);
      position = tierMin;
    }
    if (this.state.nextDesperate) { position = 'desperate'; this.state.nextDesperate = false; }
    let effect = EFFECTS.includes(raw.effect) ? raw.effect : null;
    if (!effect) { this.flag('stakes', `invalid effect "${raw.effect}", defaulted to standard`); effect = 'standard'; }
    if (position === 'desperate') {
      // Desperate is harder (one more die dropped) and pays more (one effect step up).
      if (this.rules.desperateDifficultyStep) action.difficulty = stepDifficulty(action.difficulty, this.rules.desperateDifficultyStep);
      if (this.rules.desperateEffectStep) effect = EFFECTS[Math.min(EFFECTS.length - 1, EFFECTS.indexOf(effect) + this.rules.desperateEffectStep)];
    }
    let resistance = RESISTANCES.includes(raw.resistance) ? raw.resistance : null;
    if (!resistance) { resistance = action.target.type === 'delve' ? 'reach' : 'coherence'; this.flag('stakes', `invalid resistance "${raw.resistance}", defaulted to ${resistance}`); }
    let die = this.rules.stressDie[position];
    if (action.target.type === 'delve') die = Math.max(die, this.location().stressDie ?? 4);
    let threatClock = raw.clock_on_fail && this.state.clocks[raw.clock_on_fail] && this.state.clocks[raw.clock_on_fail].kind !== 'delve' ? raw.clock_on_fail : 'attractor';
    const stakes = {
      position, effect, resistance, die, threatClock,
      failure_looks_like: truncate(raw.failure_looks_like ?? '', 300),
      gm_move: truncate(raw.gm_move ?? '', 80),
    };
    this.emit('stakes.set', { ...stakes, actorTarget: action.target, difficulty: action.difficulty, pool: action.pool },
      { actor: action.actor, backstage: { branches: raw.branches ?? null, intent: raw.intent ?? null } });
    return stakes;
  }

  roll(action, stakes) {
    const c = this.char(action.actor);
    let pool = action.pool ?? 1;
    if (stakes.position === 'desperate' && c.resolve > 0) { c.resolve--; pool++; this.emit('resolve.spend', { left: c.resolve }, { actor: c.id }); }
    if (this.state.pendingBonus?.[c.id]) delete this.state.pendingBonus[c.id];
    const dice = Array.from({ length: pool }, () => this.rng.die(10));
    const sorted = dice.slice().sort((a, b) => b - a);
    const remove = this.rules.difficultyRemove[action.difficulty] ?? 0;
    const kept = sorted.slice(remove);
    let highest, band;
    if (kept.length === 0) {
      highest = this.rng.die(10);
      band = highest === 1 ? 'critFail' : highest === 10 ? 'cost' : 'fail';
    } else {
      highest = kept[0];
      band = bandOf(highest, this.rules);
    }
    const r = { dice, removed: sorted.slice(0, remove), kept, highest, band, label: BAND_LABEL[band], emptyPool: kept.length === 0, difficulty: action.difficulty };
    this.emit('roll', r, { actor: action.actor });
    return r;
  }

  /**
   * Apply mechanical consequences of a roll. Returns a summary the runner hands to the narrator.
   */
  applyOutcome(action, stakes, roll) {
    const branch = BRANCH_OF[roll.band];
    const out = { band: roll.band, branch, stress: [], fallouts: [], clues: [], complication: null, completed: [], secrets: [] };
    // --- incoming stress
    if (branch === 'fail' || branch === 'cost') {
      let amount = this.rng.die(stakes.die);
      if (roll.band === 'critFail') amount *= this.rules.critFailStressMultiplier;
      if (action.deck?.ward) amount = Math.max(0, amount - action.deck.ward);
      out.stress.push(...this.inflict(action.actor, stakes.resistance, amount, { die: stakes.die }));
    }
    // --- outgoing effect
    if (branch === 'success' || branch === 'cost') {
      const crit = roll.band === 'crit';
      const t = action.target;
      if (t.type === 'delve') {
        let d = this.rules.effectDie[stakes.effect];
        if (crit && this.rules.critStepsDieUp) d = stepDie(d, 1);
        const n = this.rng.die(d);
        this.tick(t.id, n, `${action.actor} pushes through (d${d}=${n})`);
      } else if (t.type === 'clue') {
        const n = (crit ? 2 : 1) + (action.deck?.extraClue ?? 0);
        out.clues = this.#nextClueSeeds(n);
      } else if (t.type === 'clock') {
        const clock = this.state.clocks[t.id];
        const ticks = this.rules.effectTicks[stakes.effect] + (crit ? 1 : 0);
        this.tick(t.id, clock.kind === 'threat' || clock.kind === 'cosmic' ? -ticks : ticks, `${action.actor} acts on ${clock.name}`);
      } else if (t.type === 'npc') {
        this.state.npcSuccess.add(t.id);
        this.emit('npc.moved', { npc: t.id, name: this.scenario.npcs[t.id].name }, { actor: action.actor });
      } else if (t.type === 'ally') {
        const ally = this.char(t.id);
        const res = RESISTANCES.reduce((a, b) => (ally.stress[b] > ally.stress[a] ? b : a), RESISTANCES[0]);
        const d = this.rules.effectDie[stakes.effect];
        const heal = Math.min(ally.stress[res], this.rng.die(crit ? stepDie(d) : d));
        ally.stress[res] -= heal;
        this.emit('stress.heal', { target: t.id, resistance: res, amount: heal, total: this.totalStress(t.id) }, { actor: action.actor });
      }
    }
    // --- failure moves: threat clock ticks, delve complications
    if (branch === 'fail') {
      this.tick(stakes.threatClock, roll.band === 'critFail' ? 2 : 1, 'the situation worsens');
      const loc = this.location();
      if (loc?.events?.length) out.complication = this.rng.pick(loc.events);
      if (out.complication) this.emit('complication', { text: out.complication });
    }
    out.secrets = this.#checkSecrets();
    out.fallouts = this.pendingFallouts.splice(0);
    out.completed = this.completedQueue.splice(0);
    return out;
  }

  pendingFallouts = [];
  completedQueue = [];

  totalStress(id) { const c = this.char(id); return RESISTANCES.reduce((s, k) => s + c.stress[k], 0); }

  /** Inflict stress (after protection) and roll fallout. Handles stress sharing. */
  inflict(actorId, resistance, amount, { die = null, shareWith = null, source = null } = {}) {
    const results = [];
    const parts = [[actorId, amount]];
    const guardian = this.state.guards[actorId];
    if (!shareWith && guardian && guardian !== actorId && !this.char(guardian).dissolved) shareWith = guardian;
    if (shareWith && amount > 0) {
      const half = Math.ceil(amount / 2);
      parts[0][1] = amount - half;
      parts.push([shareWith, half]);
      const giver = this.char(shareWith);
      giver.shares++;
      this.state.cohesion++;
      this.emit('stress.share', { from: actorId, to: shareWith, amount: half, cohesion: this.state.cohesion }, { actor: shareWith });
      if (giver.shares >= this.rules.sharesForReachGrowth && !this.state.reachGrowthGiven.has(shareWith)) {
        this.state.reachGrowthGiven.add(shareWith);
        this.changeCone(shareWith, { reach: +1 }, 'care as advancement: carried another\'s stress');
      }
    }
    const hurt = [];
    for (const [id, amt] of parts) {
      const c = this.char(id);
      if (c.dissolved) continue;
      const prot = c.noProtection.includes(resistance) ? 0 : c.protection[resistance];
      const taken = Math.max(0, amt - prot);
      c.stress[resistance] += taken;
      const ev = this.emit('stress', { resistance, rolled: amt, die, protection: prot, taken, value: c.stress[resistance], total: this.totalStress(id), source }, { actor: id });
      results.push(ev.data);
      if (taken > 0) hurt.push(id);
    }
    if (hurt.length > 1 && this.rules.sharedHitSingleFalloutCheck) {
      // One hit, one fallout check: whoever now carries more total stress rolls it.
      const id = hurt.reduce((a, b) => (this.totalStress(b) > this.totalStress(a) ? b : a));
      this.#falloutCheck(id, resistance);
    } else for (const id of hurt) this.#falloutCheck(id, resistance);
    return results;
  }

  #falloutCheck(id, resistance) {
    const total = this.totalStress(id);
    const d = this.rng.die(this.rules.fallout.die);
    let result = 'none';
    if (d <= total) result = d <= this.rules.fallout.minorMax ? 'minor' : 'major';
    this.emit('fallout.check', { roll: d, total, result }, { actor: id });
    if (result !== 'none') {
      // Fallout targets the resistance with the most stress (Heart), ties → the one just hit.
      const c = this.char(id);
      const most = RESISTANCES.reduce((a, b) => (c.stress[b] > c.stress[a] ? b : a), resistance);
      this.pendingFallouts.push({ actor: id, severity: result, resistance: c.stress[most] > c.stress[resistance] ? most : resistance });
    }
  }

  falloutOptions(f) {
    const all = this.scenario.fallout[f.resistance]?.[f.severity] ?? [];
    const had = new Set(this.char(f.actor).fallouts.map((x) => x.id));
    const fresh = all.filter((o) => !had.has(o.id));
    return fresh.length ? fresh : all;
  }

  /** Apply a fallout chosen by the GM agent (falls back to the first option). Returns follow-up needs. */
  applyFallout(f, choiceId = null, narration = '') {
    const c = this.char(f.actor);
    const options = this.falloutOptions(f);
    let opt = options.find((o) => o.id === choiceId);
    if (!opt) { if (choiceId) this.flag('fallout', `unknown fallout "${choiceId}", used ${options[0]?.id}`); opt = options[0]; }
    if (f.severity === 'minor') c.stress[f.resistance] = 0;
    else for (const k of RESISTANCES) c.stress[k] = 0;
    c.fallouts.push({ ...f, id: opt.id, name: opt.name, scene: this.state.scene?.id });
    if (f.severity === 'major') c.majors++;
    const followUp = [];
    const eff = opt.effect ?? { type: 'none' };
    let lostDomain = null;
    switch (eff.type) {
      case 'condition': c.conditions.push({ name: opt.name, penalty: eff.penalty }); break;
      case 'compel': c.compels.push(eff.text); break;
      case 'protection': c.protection[eff.resistance] = Math.max(0, c.protection[eff.resistance] + eff.delta); break;
      case 'lose_domain': if (c.domains.length) { lostDomain = c.domains.pop(); followUp.push({ type: 'lost_domain', domain: lostDomain }); } break;
      case 'gain_domain': if (!c.domains.includes(eff.domain)) c.domains.push(eff.domain); if (eff.tick) this.tick(eff.tick.clock, eff.tick.by, 'bleed-through'); break;
      case 'memory_rewrite': if (c.memories.length) followUp.push({ type: 'memory_rewrite', actor: c.id }); break;
      case 'memory_lose': if (c.memories.length) followUp.push({ type: 'memory_lose', actor: c.id }); break;
      case 'cone': this.changeCone(c.id, { reach: eff.reach ?? 0, horizon: eff.horizon ?? 0 }, opt.name); break;
      case 'fork': c.forked = true; followUp.push({ type: 'fork', actor: c.id }); break;
      case 'ingressed':
        c.algotypeRevealed = true;
        c.protection.boundary = Math.max(0, c.protection.boundary - 1);
        if (!c.domains.includes('Threshold')) c.domains.push('Threshold');
        this.emit('algotype.reveal', { algotype: c.algotype.label, disposition: c.algotype.disposition }, { actor: c.id });
        break;
      default: break;
    }
    this.emit('fallout', { severity: f.severity, resistance: f.resistance, id: opt.id, name: opt.name, text: opt.text, narration: truncate(narration, 500), effect: eff, majors: c.majors }, { actor: c.id });
    if (c.deck) {
      // What happens to you becomes part of the deck you draw from.
      const why = `fallout: ${opt.name}`;
      if (eff.type === 'condition') this.gainCard(c.id, conditionCard(opt), why);
      if (eff.type === 'compel') this.gainCard(c.id, compelCard(opt), why);
      if (eff.type === 'gain_domain') this.gainCard(c.id, domainCard(eff.domain, { lent: true }), why);
      if (eff.type === 'fork') this.gainCard(c.id, voiceCard(), why);
      if (eff.type === 'ingressed') this.gainCard(c.id, domainCard('Threshold', { lent: true }), why);
      if (lostDomain) for (const k of cardsInPlay(c.deck).filter((x) => x.type === 'domain' && x.domain === lostDomain)) this.removeCard(c.id, k.uid, why);
    }
    if (c.majors >= this.rules.majorsToDissolve && !c.dissolved) {
      c.dissolved = true;
      this.emit('character.dissolve', { text: `${c.name} returns to the Latent.` }, { actor: c.id });
    }
    return followUp;
  }

  changeCone(id, { reach = 0, horizon = 0 }, why = '') {
    const c = this.char(id);
    const before = { ...c.cone };
    c.cone.reach = Math.max(0, Math.min(4, c.cone.reach + reach));
    c.cone.horizon = Math.max(0, Math.min(4, c.cone.horizon + horizon));
    if (before.reach !== c.cone.reach || before.horizon !== c.cone.horizon) {
      this.emit('cone.change', { before, after: { ...c.cone }, why }, { actor: id });
    }
  }

  /** A guard lasts until the guardian's next turn. */
  clearGuardsBy(guardianId) {
    for (const [ally, g] of Object.entries(this.state.guards)) if (g === guardianId) delete this.state.guards[ally];
  }

  tick(clockId, by, why = '') {
    const clock = this.state.clocks[clockId];
    if (!clock || by === 0) return null;
    if (clock.done && by > 0) return null;
    const r = tickClock(clock, by);
    if (r.delta === 0) return r;
    this.emit('clock.tick', { clock: clockId, name: clock.name, kind: clock.kind, by: r.delta, value: clock.value, size: clock.size, why });
    if (r.completed) {
      this.emit('clock.complete', { clock: clockId, name: clock.name, kind: clock.kind, onComplete: clock.onComplete });
      this.completedQueue.push(clockId);
      this.#onClockComplete(clockId);
    }
    this.#checkSecrets();
    return r;
  }

  #onClockComplete(id) {
    if (id === 'attractor') {
      for (const pid of this.activeCast()) this.inflict(pid, 'boundary', this.rng.die(8), { die: 8, source: 'attractor' });
      this.state.nextDesperate = true;
    }
    if (id === 'ingression') this.state.nextDesperate = true;
  }

  // ---------------------------------------------------------------- clues / facts / secrets

  #nextClueSeeds(n) {
    const loc = this.location();
    const seeds = (loc?.clueSeeds ?? []).filter((s) => !this.state.cluesRevealedSeeds.has(s.id));
    const chosen = seeds.slice(0, n);
    for (const s of chosen) this.state.cluesRevealedSeeds.add(s.id);
    return chosen;
  }

  /** Record a clue. `text` is the GM's wording; the seed keeps it anchored. */
  addClue(seed, text, by) {
    const clue = { id: seed.id, seed: seed.seed, text: truncate(text || seed.seed, 300), by, scene: this.state.scene?.id };
    this.state.clues.push(clue);
    this.emit('clue.found', clue, { actor: by });
    this.#checkSecrets();
    return clue;
  }

  addFacts(texts, source) {
    const added = [];
    for (const t of texts ?? []) {
      const text = truncate(String(t).trim(), 240);
      if (!text) continue;
      if (this.state.facts.some((f) => jaccard(f.text, text) > 0.8)) continue; // near-duplicate
      const fact = { id: `f${this.state.facts.length + 1}`, text, source, scene: this.state.scene?.id };
      this.state.facts.push(fact);
      added.push(fact);
      this.emit('fact.add', fact);
    }
    return added;
  }

  #checkSecrets() {
    const opened = [];
    for (const s of this.scenario.secrets) {
      if (this.state.unlockedSecrets.has(s.id)) continue;
      const g = s.gate;
      let open = false;
      if (g.type === 'success_on') open = this.state.npcSuccess.has(g.target.split(':')[1]);
      if (g.type === 'clue_count') open = this.state.clues.length >= g.n;
      if (g.type === 'clock') open = (this.state.clocks[g.clock]?.value ?? 0) >= g.gte;
      if (g.type === 'scene') open = this.state.scene?.id === g.scene;
      if (open) {
        this.state.unlockedSecrets.add(s.id);
        opened.push(s);
        this.emit('secret.unlock', { id: s.id, text: s.text, gate: g });
        this.addFacts([s.text], 'secret');
      }
    }
    return opened;
  }

  // ---------------------------------------------------------------- memory

  rewriteMemory(actorId, memId, text) {
    const c = this.char(actorId);
    const m = c.memories.find((mm) => mm.id === memId) ?? c.memories[0];
    if (!m) return null;
    const before = m.experiences.join(' ');
    m.experiences = [truncate(text, 300)];
    m.versions.push({ scene: this.state.scene?.id, text: m.experiences[0], forced: true });
    this.emit('memory.rewrite', { memory: m.id, before, after: m.experiences[0], original: m.original, drift: +(1 - jaccard(m.original, m.experiences[0])).toFixed(3) }, { actor: actorId });
    return m;
  }

  loseMemory(actorId, memId) {
    const c = this.char(actorId);
    let idx = c.memories.findIndex((mm) => mm.id === memId);
    if (idx < 0) idx = c.memories.length - 1;
    if (idx < 0) return null;
    const [m] = c.memories.splice(idx, 1);
    this.emit('memory.lose', { memory: m.id, text: m.experiences.join(' '), original: m.original, left: c.memories.length }, { actor: actorId });
    if (c.deck && this.#removeMemoryCard(actorId, m.id, 'erased')) this.gainCard(actorId, gapCard(m.id), 'the shape of the gap');
    return m;
  }

  formMemory(actorId, text) {
    const c = this.char(actorId);
    const t = truncate(text, 300);
    if (!t) return null;
    if (c.memories.length < this.rules.memorySlots) {
      const m = { id: `m${c.nextMemoryId++}`, experiences: [t], original: t, versions: [], invokedInScene: null };
      c.memories.push(m);
      this.emit('memory.form', { memory: m.id, text: t, slots: c.memories.length }, { actor: actorId });
      if (c.deck) this.gainCard(actorId, memoryCard(m.id), 'a new memory', 'discard');
      return m;
    }
    const host = c.memories.find((m) => m.experiences.length < this.rules.experiencesPerMemory);
    if (host) {
      host.experiences.push(t);
      this.emit('memory.form', { memory: host.id, text: t, appended: true, slots: c.memories.length }, { actor: actorId });
      return host;
    }
    // Full: oldest memory moves to a fragile backup, or is forgotten
    const oldest = c.memories.shift();
    if (c.deck) this.#removeMemoryCard(actorId, oldest.id, 'no room to hold it');
    if (c.backups.length < this.rules.backupSlots) {
      c.backups.push(oldest);
      this.emit('memory.backup', { memory: oldest.id, text: oldest.experiences.join(' ') }, { actor: actorId });
    } else {
      this.emit('memory.lose', { memory: oldest.id, text: oldest.experiences.join(' '), original: oldest.original, left: c.memories.length, reason: 'no room' }, { actor: actorId });
    }
    return this.formMemory(actorId, t);
  }

  /** Haunts: spend one experience to clear stress up to the haunt's die. */
  rest(action) {
    const c = this.char(action.actor);
    const h = (this.location()?.haunts ?? []).find((hh) => hh.id === action.rest.haunt);
    const m = c.memories.find((mm) => mm.id === action.rest.memory);
    if (!h || !m) { this.flag('rest', 'invalid haunt rest', c.id); return null; }
    const spent = m.experiences.pop();
    if (!m.experiences.length) c.memories.splice(c.memories.indexOf(m), 1);
    const amount = Math.min(c.stress[h.resistance], this.rng.die(h.die));
    c.stress[h.resistance] -= amount;
    if (this.rules.restGrantsResolve && !c.deck) c.resolve += this.rules.restGrantsResolve;
    const ev = this.emit('haunt.rest', { haunt: h.id, name: h.name, resistance: h.resistance, die: h.die, cleared: amount, spent, memory: m.id, memoryGone: !m.experiences.length, total: this.totalStress(c.id), resolve: c.resolve }, { actor: c.id });
    if (c.deck) {
      // A haunt is a campfire: what you spent, what you set down, what you take with you.
      if (!m.experiences.length) this.#removeMemoryCard(c.id, m.id, `spent at ${h.name}`);
      if (action.rest.remove) this.removeCard(c.id, action.rest.remove, `set down at ${h.name}`);
      for (let i = 0; i < (this.rules.restGrantsResolve ?? 0); i++) this.gainCard(c.id, resolveCard(), `rest at ${h.name}`);
    }
    return ev.data;
  }

  #removeMemoryCard(id, memId, why) {
    const k = cardsInPlay(this.char(id).deck).find((x) => x.type === 'memory' && x.memory === memId);
    return k ? this.removeCard(id, k.uid, why) : null;
  }

  // ---------------------------------------------------------------- theorize

  /**
   * @param {object} action   validated action with .theorize
   * @param {string[]} acceptedByGm   clue ids the GM agrees the theory accounts for
   */
  theorize(action, acceptedByGm = []) {
    const claimed = action.theorize.clues;
    const accepted = claimed.filter((id) => acceptedByGm.includes(id));
    if (accepted.length < claimed.length) this.emit('theorize.rejected_clues', { rejected: claimed.filter((id) => !accepted.includes(id)) }, { actor: action.actor });
    const t = this.rules.theorize;
    const d1 = this.rng.die(6), d2 = this.rng.die(6);
    const total = d1 + d2 + accepted.length - t.complexity;
    const result = total >= t.greatAt ? 'great' : total >= t.trueAt ? 'true' : 'false';
    this.emit('theorize', { theory: action.theorize.theory, claimed, accepted, dice: [d1, d2], complexity: t.complexity, total, result }, { actor: action.actor });
    if (result !== 'false') {
      this.state.theory = { text: action.theorize.theory, actor: action.actor, accepted };
      this.addFacts([`CANON — what is ingressing: ${action.theorize.theory}`], 'theory');
      if (result === 'great') {
        if (this.deckMode) for (const id of this.activeCast()) this.gainCard(id, insightCard(), 'a theory that proved true', 'top');
        else {
          this.state.pendingBonus = this.state.pendingBonus ?? {};
          for (const id of this.activeCast()) this.state.pendingBonus[id] = (this.state.pendingBonus[id] ?? 0) + 1;
        }
      }
    } else {
      this.inflict(action.actor, 'coherence', this.rng.die(t.failStressDie), { die: t.failStressDie, source: 'wrong theory' });
      this.tick('ingression', t.failIngressionTicks, 'a wrong theory widens the opening');
    }
    return { result, accepted, total, fallouts: this.pendingFallouts.splice(0), completed: this.completedQueue.splice(0) };
  }

  // ---------------------------------------------------------------- beats

  declareBeats(actorId, beatIds) {
    const c = this.char(actorId);
    const all = CALLINGS[c.calling].beats.filter((b) => b.tier !== 'zenith');
    const chosen = [];
    for (const id of beatIds ?? []) {
      const b = all.find((bb) => bb.id === id);
      if (b && !chosen.includes(b.id) && chosen.length < 2) chosen.push(b.id);
    }
    while (chosen.length < 2) { const b = all.find((bb) => !chosen.includes(bb.id)); chosen.push(b.id); this.flag('beats', `auto-filled beat ${b.id}`, actorId); }
    c.beats.declared = chosen;
    this.emit('beats.declare', { beats: chosen }, { actor: actorId, backstage: { beats: chosen.map((id) => all.find((b) => b.id === id)) } });
    return chosen;
  }

  hitBeat(actorId, beatId, why = '') {
    const c = this.state.characters[actorId];
    if (!c) { this.flag('beat', `unknown actor ${actorId}`); return false; }
    if (!c.beats.declared.includes(beatId)) { this.flag('beat', `${actorId} did not declare ${beatId}`, actorId); return false; }
    if (c.beats.hit.includes(beatId)) return false;
    const beat = CALLINGS[c.calling].beats.find((b) => b.id === beatId);
    c.beats.hit.push(beatId);
    this.emit('beat.hit', { beat: beatId, tier: beat.tier, text: beat.text, why: truncate(why, 200) }, { actor: actorId });
    if (beat.tier === 'minor') this.#gainResolve(actorId, `beat: ${beat.text}`);
    if (beat.tier === 'major') {
      this.changeCone(actorId, beatId === 'kinship.cone' ? { reach: 1 } : { horizon: 1 }, `major beat: ${beat.text}`);
      if (c.deck && this.rules.deck.draftOnMajorBeat) this.offerDraft(actorId, `major beat: ${beat.text}`);
    }
    return true;
  }

  // ---------------------------------------------------------------- audience (the Latent as a crowd)

  audienceIngress(optionId, spotlightId) {
    const sid = this.state.scene?.id;
    const used = this.state.audienceUsed[sid] ?? 0;
    if (used >= this.rules.audienceIngressPerScene) { this.flag('audience', 'audience cap reached this scene'); return false; }
    const opt = (this.scenario.audience ?? []).find((o) => o.id === optionId);
    if (!opt) return false;
    this.state.audienceUsed[sid] = used + 1;
    this.emit('audience.ingress', { option: opt.id, label: opt.label, text: opt.text, spotlight: spotlightId });
    if (opt.effect.type === 'gift' && spotlightId) {
      if (this.deckMode) this.gainCard(spotlightId, giftCard(), 'an audience gift', 'top');
      else {
        this.state.pendingBonus = this.state.pendingBonus ?? {};
        this.state.pendingBonus[spotlightId] = (this.state.pendingBonus[spotlightId] ?? 0) + 1;
      }
      this.tick('ingression', 1, 'an audience gift');
    }
    if (opt.effect.type === 'tick') this.tick(opt.effect.clock, opt.effect.by, 'the audience pulls');
    if (opt.effect.type === 'force_memory') this.state.forceMemory = true;
    return true;
  }

  // ---------------------------------------------------------------- ending

  resolveEnding() {
    const ap = this.state.clocks.aperture;
    const ing = this.state.clocks.ingression;
    // chosen: read AND answered · overrun: read, but it arrived first · closed: answered unread · unread: neither
    const read = !!this.state.theory;
    const answered = !!ap?.done || (!!ap && ap.value >= Math.ceil(ap.size / 2) && !ing?.done);
    let ending = read ? (answered ? 'chosen' : 'overrun') : (ap?.done ? 'closed' : 'unread');
    this.state.ending = ending;
    this.emit('ending', { ending, text: this.scenario.endings[ending], theory: this.state.theory?.text ?? null });
    return ending;
  }

  // ---------------------------------------------------------------- views for prompts & renderer

  publicSheet(id) {
    const c = this.char(id);
    return {
      id: c.id, name: c.name, pronoun: c.pronoun, pitch: c.pitch, look: c.look,
      skills: c.skills, domains: c.domains, calling: c.calling, cone: { ...c.cone },
      stress: { ...c.stress }, protection: { ...c.protection }, total: this.totalStress(id),
      fallouts: c.fallouts.map((f) => ({ name: f.name, severity: f.severity })),
      conditions: c.conditions.map((x) => x.name), memories: c.memories.length, resolve: c.resolve,
      dissolved: c.dissolved, forked: c.forked,
      guardedBy: this.state.guards[id] ?? null,
      algotype: c.algotypeRevealed ? c.algotype.label : null,
      ...(c.deck ? { deck: { hand: c.deck.hand.length, draw: c.deck.draw.length, discard: c.deck.discard.length, size: cardsInPlay(c.deck).length, handSize: this.handSize(id) } } : {}),
    };
  }

  /** A player's own deck: the hand in full, the rest as counts, and every card for "view deck". */
  deckView(id) {
    const c = this.char(id);
    if (!c.deck) return null;
    const card = (k) => {
      const v = pubCard(k);
      if (k.type === 'memory') v.memoryText = c.memories.find((m) => m.id === k.memory)?.experiences.join(' ') ?? '';
      if (k.type === 'memory') v.invokedThisScene = c.memories.find((m) => m.id === k.memory)?.invokedInScene === this.state.scene?.id;
      if (k.type === 'drive') v.disposition = c.algotype.disposition;
      if (k.type === 'domain') v.here = this.#domainRelevant(k.domain);
      v.playable = k.kind !== 'status';
      v.removable = isRemovable(k);
      return v;
    };
    const zone = (z) => c.deck[z].map((k) => ({ uid: k.uid, name: k.name, type: k.type, kind: k.kind, zone: z, removable: isRemovable(k) }));
    return {
      hand: c.deck.hand.map(card),
      handSize: this.handSize(id),
      edgesAllowed: this.edgesAllowed(id),
      drawPile: c.deck.draw.length, discardPile: c.deck.discard.length, exhausted: c.deck.exhaust.length, removed: c.deck.removed.length,
      cards: [...zone('hand'), ...zone('draw'), ...zone('discard')],
      offer: c.deck.offer ? { why: c.deck.offer.why, cards: c.deck.offer.cards.map(pubCard), queued: c.deck.offers.length } : null,
      lastMove: c.deck.lastMove,
      drivePlays: c.deck.drivePlays, driveRevealAt: this.rules.deck.driveRevealAt,
    };
  }

  /** What a player agent may know: limited by its light cone. */
  playerView(id) {
    const c = this.char(id);
    const horizon = Math.max(1, c.cone.horizon);
    const windowSize = horizon * this.rules.horizonEventWindow;
    return {
      you: {
        ...this.publicSheet(id),
        voice: c.voice,
        knack: c.knack,
        memories: c.memories.map((m) => ({ id: m.id, text: m.experiences.join(' '), invokedThisScene: m.invokedInScene === this.state.scene?.id })),
        backups: c.backups.map((m) => ({ id: m.id, text: m.experiences.join(' ') })),
        beats: c.beats.declared.map((bid) => ({ ...CALLINGS[c.calling].beats.find((b) => b.id === bid), hit: c.beats.hit.includes(bid) })),
        compels: c.compels,
        restedThisScene: !!this.state.restedThisScene?.has(id),
        disposition: c.algotype.disposition, // hidden drive, phrased as disposition
        ...(c.deck ? { deck: this.deckView(id), flaw: c.flaw } : {}),
      },
      allies: this.activeCast().filter((x) => x !== id).map((x) => this.publicSheet(x)),
      scene: this.state.scene ? { id: this.state.scene.id, kind: this.state.scene.kind, title: this.state.scene.title } : null,
      location: this.locationInfo(),
      clocks: this.visibleClocks(id),
      reach: this.effectiveReach(id),
      cohesion: this.state.cohesion,
      clues: this.state.clues.map((cl) => ({ id: cl.id, text: cl.text })),
      facts: this.state.facts.slice(-12).map((f) => f.text),
      theory: this.state.theory?.text ?? null,
      recent: this.events.slice(-windowSize).map(describeEvent).filter(Boolean),
      forceMemory: !!this.state.forceMemory,
    };
  }

  gmView() {
    return {
      scenario: { title: this.scenario.title, premise: this.scenario.premise, question: this.scenario.question, tone: this.scenario.tone, safety: this.scenario.safety },
      scene: this.state.scene,
      location: this.locationInfo(),
      cast: this.activeCast().map((id) => {
        const c = this.char(id);
        return { ...this.publicSheet(id), beats: c.beats.declared.map((bid) => ({ ...CALLINGS[c.calling].beats.find((b) => b.id === bid), hit: c.beats.hit.includes(bid) })), compels: c.compels };
      }),
      clocks: this.visibleClocks(null),
      clues: this.state.clues,
      unrevealedClueCount: (this.location()?.clueSeeds ?? []).filter((s) => !this.state.cluesRevealedSeeds.has(s.id)).length,
      facts: this.state.facts.map((f) => `${f.id}: ${f.text}`),
      secretsToReveal: this.scenario.secrets.filter((s) => this.state.unlockedSecrets.has(s.id)).map((s) => s.text),
      theory: this.state.theory,
      recent: this.events.slice(-30).map(describeEvent).filter(Boolean),
    };
  }

  snapshot() {
    const s = this.state;
    return {
      scene: s.scene?.id,
      cast: s.order.map((id) => this.publicSheet(id)),
      clocks: Object.values(s.clocks).map((c) => ({ ...c })),
      cohesion: s.cohesion,
      clues: s.clues.length,
      facts: s.facts.length,
      theory: s.theory?.text ?? null,
    };
  }

  exportSession(meta = {}) {
    return {
      format: 'latent.session/1',
      meta: { ...meta, seed: this.seed, rules: this.rules, scenario: this.scenario.id, createdAt: new Date().toISOString() },
      events: deepClone(this.events),
      final: {
        snapshot: this.snapshot(),
        characters: deepClone(Object.values(this.state.characters).map((c) => ({ ...c, algotype: c.algotype }))),
        facts: deepClone(this.state.facts),
        clues: deepClone(this.state.clues),
        theory: this.state.theory,
        ending: this.state.ending,
      },
    };
  }
}

/** One-line, human-readable description of an event (for prompts, captions, logs). */
export function describeEvent(e, names = null) {
  const n = (id) => (names?.[id] ?? id);
  const d = e.data ?? {};
  switch (e.type) {
    case 'scene.enter': return `— Scene: ${d.title} —`;
    case 'scene.frame': return `GM: ${d.text}`;
    case 'character.intro': return `${n(e.actor)}: ${d.text}`;
    case 'action.declare': return `${n(e.actor)}${d.say ? `: "${d.say}"` : ''}${d.do ? ` — ${d.do}` : ''}`;
    case 'stakes.set': return `Stakes for ${n(e.actor)}: ${d.position}/${d.effect}, ${d.resistance} at risk (d${d.die}). ${d.failure_looks_like}`;
    case 'roll': return `${n(e.actor)} rolls [${d.dice.join(',')}]${d.removed.length ? ` minus [${d.removed.join(',')}]` : ''} → ${d.label}`;
    case 'outcome': return `GM: ${d.text}`;
    case 'complication': return `Complication: ${d.text}`;
    case 'stress': return d.taken ? `${n(e.actor)} takes ${d.taken} ${d.resistance} stress (total ${d.total})` : null;
    case 'stress.heal': return `${n(e.actor)} mends ${n(d.target)}: ${d.amount} ${d.resistance} stress cleared (total ${d.total})`;
    case 'fallout': return `${n(e.actor)} suffers ${d.severity} fallout: ${d.name}`;
    case 'clock.tick': return `${d.name} ${d.by > 0 ? '+' : ''}${d.by} (${d.value}/${d.size})`;
    case 'clock.complete': return `${d.name} is complete: ${d.onComplete}`;
    case 'clue.found': return `Clue ${d.id}: ${d.text}`;
    case 'npc.moved': return `${d.name} is moved by ${n(e.actor)}`;
    case 'delve.forced': return d.text;
    case 'memory.invoke': return `${n(e.actor)} remembers, differently: "${d.reinterpretation}"`;
    case 'memory.lose': return `${n(e.actor)} loses a memory.`;
    case 'memory.rewrite': return `${n(e.actor)}'s memory rewrites itself: "${d.after}"`;
    case 'memory.form': return `${n(e.actor)} forms a memory: "${d.text}"`;
    case 'theorize': return `${n(e.actor)} theorizes: "${d.theory}" → ${d.result}`;
    case 'beat.hit': return `${n(e.actor)} hits a beat: ${d.text}`;
    case 'stress.share': return `${n(e.actor)} shares ${n(d.from)}'s stress (cohesion ${d.cohesion})`;
    case 'guard.set': return `${n(e.actor)} guards ${d.name} until their next turn`;
    case 'haunt.rest': return `${n(e.actor)} rests at ${d.name}, spending a memory`;
    case 'dialogue': return `${d.speaker}: ${d.text}`;
    case 'audience.ingress': return `The audience: ${d.text}`;
    case 'cone.change': return `${n(e.actor)}'s light cone changes (reach ${d.after.reach}, horizon ${d.after.horizon})`;
    case 'algotype.reveal': return `${n(e.actor)}'s hidden drive shows: ${d.algotype}`;
    case 'character.dissolve': return d.text;
    case 'ending': return `Ending: ${d.text}`;
    case 'ending.narrate': return d.text ? `GM: ${d.text}` : null;
    case 'character.epilogue': return d.text ? `${n(e.actor)}: ${d.text}` : null;
    case 'deck.play': {
      const names_ = [d.move?.name ?? (d.improvised ? `improvised ${d.improvised}` : null), ...(d.edges ?? []).map((k) => k.name), d.guard?.name, d.compel?.name].filter(Boolean);
      return names_.length ? `${n(e.actor)} plays ${names_.join(' + ')}` : null;
    }
    case 'deck.gain': return `${n(e.actor)} gains a card: ${d.card.name} (${d.why})`;
    case 'deck.remove': return `${n(e.actor)} loses a card: ${d.card.name} (${d.why})`;
    case 'deck.draft': return d.card ? `${n(e.actor)} drafts ${d.card.name}` : `${n(e.actor)} takes nothing from ${d.why}`;
    default: return null;
  }
}
