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
    };
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
    // Scene-gated secrets
    this.#checkSecrets();
    // The Latent keeps pouring in, scene by scene
    if (def.kind !== 'prologue' && def.kind !== 'epilogue' && this.rules.ingressionTicksPerScene > 0) {
      this.tick('ingression', this.rules.ingressionTicksPerScene, 'the Latent keeps pouring in');
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
      npcs: (l.npcs ?? []).map((n) => ({ id: n, name: this.scenario.npcs[n].name, description: this.scenario.npcs[n].description, want: this.scenario.npcs[n].want })),
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

  // ---------------------------------------------------------------- actions

  /**
   * Normalise and validate an agent's intent. The engine — not the agent —
   * decides whether a roll is required.
   */
  validateAction(actorId, intent = {}) {
    const c = this.char(actorId);
    const issues = [];
    const out = {
      actor: actorId,
      say: truncate(intent.say ?? '', 400),
      do: truncate(intent.do ?? '', 400),
      intent: truncate(intent.intent ?? '', 400),
      skill: null, domain: null, target: { type: 'none' }, memory: null, beat: null,
      shareWith: null, rest: null, theorize: null, kind: 'talk', needsRoll: false,
      pool: null, difficulty: 'standard',
    };

    // Skill / domain: anyone can try anything with the base die; only owned ones add dice.
    const skill = SKILLS.find((s) => s.toLowerCase() === String(intent.skill ?? '').toLowerCase()) ?? null;
    const domain = DOMAINS.find((d) => d.toLowerCase() === String(intent.domain ?? '').toLowerCase()) ?? null;
    out.skill = skill; out.domain = domain;
    if (intent.skill && !skill) issues.push(`unknown skill "${intent.skill}"`);
    if (intent.domain && !domain) issues.push(`unknown domain "${intent.domain}"`);

    // Target grammar
    out.target = this.parseTarget(intent.target, actorId, issues);

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
      const memId = intent.memory?.id ?? c.memories[0]?.id;
      out.rest = { haunt: out.target.id, memory: c.memories.find((m) => m.id === memId) ? memId : c.memories[0]?.id ?? null };
      if (!out.rest.memory) issues.push('no memory left to spend at a haunt');
    }

    // Memory invocation (+1 die, must reinterpret)
    if (intent.memory && intent.memory.id && out.kind !== 'rest') {
      const m = c.memories.find((mm) => mm.id === intent.memory.id);
      if (!m) issues.push(`memory ${intent.memory.id} does not exist`);
      else if (m.invokedInScene === this.state.scene?.id) issues.push(`memory ${m.id} already invoked this scene`);
      else if (!intent.memory.reinterpretation) issues.push(`memory ${m.id} invoked without reinterpretation`);
      else out.memory = { id: m.id, reinterpretation: truncate(intent.memory.reinterpretation, 400) };
    }

    // Beat being pursued (advisory; the GM proposes hits, the engine validates)
    if (intent.beat) out.beat = String(intent.beat);

    // Stress sharing (Levin: stress as cognitive glue)
    if (intent.share_stress_with && this.rules.shareStress) {
      const ally = String(intent.share_stress_with);
      if (this.state.characters[ally] && ally !== actorId && !this.char(ally).dissolved) out.shareWith = ally;
      else issues.push(`cannot share stress with "${ally}"`);
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

  parseTarget(raw, actorId, issues = []) {
    // Agents sometimes echo the menu text ("ally:ilse2 (Mend Ilse-2)"): keep only the target token.
    const t = (String(raw ?? 'none').trim().match(/^[a-z]+(?::[a-z0-9_-]+)?/i)?.[0] ?? 'none').toLowerCase();
    if (!t || t === 'none') return { type: 'none' };
    if (t === 'delve') {
      if (!this.state.delveClockId) { issues.push('no delve in this scene'); return { type: 'none' }; }
      return { type: 'delve', id: this.state.delveClockId };
    }
    if (t === 'clue' || t === 'clues') return { type: 'clue' };
    if (t === 'aperture') return this.parseTarget('clock:aperture', actorId, issues);
    const [kind, id] = t.split(':');
    if (kind === 'clock') {
      const clock = this.state.clocks[id];
      if (!clock || clock.kind === 'delve') { issues.push(`unknown clock "${id}"`); return { type: 'none' }; }
      if (!this.canSeeClock(actorId, clock)) { issues.push(`clock "${id}" is outside ${actorId}'s light cone`); this.flag('outside_light_cone', `${actorId} targeted ${id}`, actorId); return { type: 'none' }; }
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
    if (action.skill && c.skills.includes(action.skill)) { pool++; parts.push(action.skill); }
    if (action.domain && c.domains.includes(action.domain) && this.#domainRelevant(action.domain)) { pool++; parts.push(action.domain); }
    if (c.knack && action.skill === c.knack.skill && action.domain === c.knack.domain && this.rules.maxMastery > 0) { pool++; parts.push('mastery'); }
    if (action.memory) { pool += this.rules.memoryInvokeBonus; parts.push(`memory:${action.memory.id}`); }
    if (c.resolve > 0) { /* resolve is spent automatically on desperate rolls */ }
    let difficulty = this.rules.difficultyByTier[this.tier()] ?? 'standard';
    if (action.target.type === 'npc') {
      const npc = this.scenario.npcs[action.target.id];
      if (action.skill && npc.persuadedBy.includes(action.skill)) { pool += this.rules.persuadabilityMatchBonus; parts.push('persuadable'); }
      if (action.skill && npc.resists.includes(action.skill)) { difficulty = stepDifficulty(difficulty, this.rules.persuadabilityMismatchStep); parts.push('mismatch'); }
    }
    for (const cond of c.conditions) if (action.skill && cond.penalty.includes(action.skill)) { pool--; parts.push(`-${cond.name}`); }
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
    const action = this.validateAction(actorId, intent);
    const c = this.char(actorId);
    if (action.memory) {
      const m = c.memories.find((mm) => mm.id === action.memory.id);
      const before = m.experiences.join(' ');
      m.invokedInScene = this.state.scene?.id;
      m.versions.push({ scene: this.state.scene?.id, text: action.memory.reinterpretation });
      const drift = 1 - jaccard(m.original, action.memory.reinterpretation);
      this.emit('memory.invoke', { memory: m.id, before, reinterpretation: action.memory.reinterpretation, original: m.original, drift: +drift.toFixed(3) }, { actor: actorId });
    }
    for (const issue of action.issues) this.flag('intent', issue, actorId);
    this.emit('action.declare', {
      say: action.say, do: action.do, kind: action.kind, target: action.target, skill: action.skill, domain: action.domain,
      memory: action.memory?.id ?? null, needsRoll: action.needsRoll, pool: action.pool, poolParts: action.poolParts,
      difficulty: action.difficulty, theorize: action.theorize, shareWith: action.shareWith, rest: action.rest,
    }, { actor: actorId, backstage: { intent: action.intent, beat: action.beat } });
    return action;
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
      out.stress.push(...this.inflict(action.actor, stakes.resistance, amount, { die: stakes.die, shareWith: action.shareWith }));
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
        const n = crit ? 2 : 1;
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
    for (const [id, amt] of parts) {
      const c = this.char(id);
      if (c.dissolved) continue;
      const prot = c.noProtection.includes(resistance) ? 0 : c.protection[resistance];
      const taken = Math.max(0, amt - prot);
      c.stress[resistance] += taken;
      const ev = this.emit('stress', { resistance, rolled: amt, die, protection: prot, taken, value: c.stress[resistance], total: this.totalStress(id), source }, { actor: id });
      results.push(ev.data);
      if (taken > 0) this.#falloutCheck(id, resistance);
    }
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
    switch (eff.type) {
      case 'condition': c.conditions.push({ name: opt.name, penalty: eff.penalty }); break;
      case 'compel': c.compels.push(eff.text); break;
      case 'protection': c.protection[eff.resistance] = Math.max(0, c.protection[eff.resistance] + eff.delta); break;
      case 'lose_domain': if (c.domains.length) { const lost = c.domains.pop(); followUp.push({ type: 'lost_domain', domain: lost }); } break;
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
    const ev = this.emit('haunt.rest', { haunt: h.id, name: h.name, resistance: h.resistance, die: h.die, cleared: amount, spent, memory: m.id, memoryGone: !m.experiences.length, total: this.totalStress(c.id) }, { actor: c.id });
    return ev.data;
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
        this.state.pendingBonus = this.state.pendingBonus ?? {};
        for (const id of this.activeCast()) this.state.pendingBonus[id] = (this.state.pendingBonus[id] ?? 0) + 1;
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
    if (beat.tier === 'minor') { c.resolve++; this.emit('resolve.gain', { resolve: c.resolve }, { actor: actorId }); }
    if (beat.tier === 'major') this.changeCone(actorId, beatId === 'kinship.cone' ? { reach: 1 } : { horizon: 1 }, `major beat: ${beat.text}`);
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
      this.state.pendingBonus = this.state.pendingBonus ?? {};
      this.state.pendingBonus[spotlightId] = (this.state.pendingBonus[spotlightId] ?? 0) + 1;
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
      algotype: c.algotypeRevealed ? c.algotype.label : null,
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
        disposition: c.algotype.disposition, // hidden drive, phrased as disposition
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
    case 'stress': return d.taken ? `${n(e.actor)} takes ${d.taken} ${d.resistance} stress (total ${d.total})` : null;
    case 'fallout': return `${n(e.actor)} suffers ${d.severity} fallout: ${d.name}`;
    case 'clock.tick': return `${d.name} ${d.by > 0 ? '+' : ''}${d.by} (${d.value}/${d.size})`;
    case 'clock.complete': return `${d.name} is complete: ${d.onComplete}`;
    case 'clue.found': return `Clue ${d.id}: ${d.text}`;
    case 'memory.invoke': return `${n(e.actor)} remembers, differently: "${d.reinterpretation}"`;
    case 'memory.lose': return `${n(e.actor)} loses a memory.`;
    case 'memory.rewrite': return `${n(e.actor)}'s memory rewrites itself: "${d.after}"`;
    case 'memory.form': return `${n(e.actor)} forms a memory: "${d.text}"`;
    case 'theorize': return `${n(e.actor)} theorizes: "${d.theory}" → ${d.result}`;
    case 'beat.hit': return `${n(e.actor)} hits a beat: ${d.text}`;
    case 'stress.share': return `${n(e.actor)} shares ${n(d.from)}'s stress (cohesion ${d.cohesion})`;
    case 'haunt.rest': return `${n(e.actor)} rests at ${d.name}, spending a memory`;
    case 'dialogue': return `${d.speaker}: ${d.text}`;
    case 'audience.ingress': return `The audience: ${d.text}`;
    case 'cone.change': return `${n(e.actor)}'s light cone changes (reach ${d.after.reach}, horizon ${d.after.horizon})`;
    case 'algotype.reveal': return `${n(e.actor)}'s hidden drive shows: ${d.algotype}`;
    case 'character.dissolve': return d.text;
    case 'ending': return `Ending: ${d.text}`;
    default: return null;
  }
}
