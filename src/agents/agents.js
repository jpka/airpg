// Agents: LLM-backed and scripted (mock) GM and players with the same interface.
//
// GM:     frame(view) · adjudicate(view, action, sheet, extra) · fallout(view, f, options, sheet) · ending(view, ending, text)
// Player: intro(view, calling) · act(view) · fallout(view, need) · epilogue(view)
// Every method returns { data, meta } where meta = { ok, ms, raw?, error?, fallback? } for the reviewer.

import { extractJson } from './parse.js';
import * as P from './prompts.js';
import { createRng, truncate } from '../engine/core.js';

async function callJson(provider, { system, prompt, temperature, maxTokens, model, tier, tag }, validate) {
  const t0 = Date.now();
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await provider.complete({
        system,
        prompt: attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was not valid JSON for this shape. Reply with ONLY the JSON object.`,
        temperature, maxTokens, model, tier, tag,
      });
      const data = extractJson(raw);
      if (data && (!validate || validate(data))) return { data, meta: { ok: true, ms: Date.now() - t0, attempts: attempt + 1, raw: truncate(raw, 2000) } };
    } catch (err) {
      return { data: null, meta: { ok: false, ms: Date.now() - t0, error: String(err?.message ?? err?.code ?? err), raw: truncate(raw, 2000) } };
    }
  }
  return { data: null, meta: { ok: false, ms: Date.now() - t0, error: 'invalid_json', raw: truncate(raw, 2000) } };
}

// ------------------------------------------------------------------ LLM agents

export class LLMGM {
  constructor({ provider, model = null, tier = null, temperature = 0.85, style = '', mockFallback = null, label = 'GM' }) {
    Object.assign(this, { provider, model, tier, temperature, style, label });
    this.system = P.gmSystem({ style });
    this.fallback = mockFallback ?? new MockGM({ seed: 'gm-fallback' });
    this.kind = 'llm';
  }
  async #ask(prompt, validate, tag, maxTokens = 1100) {
    return callJson(this.provider, { system: this.system, prompt, temperature: this.temperature, maxTokens, model: this.model, tier: this.tier, tag: `gm.${tag}` }, validate);
  }
  async #withFallback(res, fb) {
    if (res.data) return res;
    const f = await fb();
    return { data: f.data, meta: { ...res.meta, fallback: true } };
  }
  async frame(view, extra) {
    return this.#withFallback(await this.#ask(P.gmFramePrompt(view, extra), (d) => typeof d.text === 'string', 'frame'), () => this.fallback.frame(view, extra));
  }
  async adjudicate(view, action, sheet, extra = {}) {
    const validate = action.kind === 'theorize' ? (d) => Array.isArray(d.clues_accepted) && d.branches
      : action.needsRoll ? (d) => d.position && d.branches && d.branches.success && d.branches.fail
      : (d) => typeof d.response === 'string';
    return this.#withFallback(await this.#ask(P.gmAdjudicatePrompt(view, action, sheet, extra), validate, 'adjudicate', 1400), () => this.fallback.adjudicate(view, action, sheet, extra));
  }
  async fallout(view, f, options, sheet) {
    return this.#withFallback(await this.#ask(P.gmFalloutPrompt(view, f, options, sheet), (d) => d.choice, 'fallout', 400), () => this.fallback.fallout(view, f, options, sheet));
  }
  async ending(view, ending, text) {
    return this.#withFallback(await this.#ask(P.gmEndingPrompt(view, ending, text), (d) => typeof d.text === 'string', 'ending', 600), () => this.fallback.ending(view, ending, text));
  }
}

export class LLMValidator {
  constructor({ provider, model = null, tier = 'quick' }) { Object.assign(this, { provider, model, tier }); this.kind = 'llm'; }
  async check(facts, narration) {
    if (!facts.length || !narration) return { data: { contradictions: [] }, meta: { ok: true, ms: 0, skipped: true } };
    return callJson(this.provider, {
      system: 'You are a strict continuity checker. Reply with ONLY JSON.',
      prompt: P.validatorPrompt(facts.slice(-30), narration), temperature: 0, maxTokens: 400, model: this.model, tier: this.tier, tag: 'validator',
    }, (d) => Array.isArray(d.contradictions));
  }
}

export class LLMPlayer {
  constructor({ provider, model = null, tier = null, temperature = 1.0, persona = '', sheet, mockFallback = null }) {
    Object.assign(this, { provider, model, tier, temperature, persona });
    this.id = sheet.id;
    this.system = P.playerSystem(sheet, { persona });
    this.fallback = mockFallback ?? new MockPlayer({ id: sheet.id, seed: `fb-${sheet.id}` });
    this.kind = 'llm';
  }
  async #ask(prompt, validate, tag, maxTokens = 700) {
    return callJson(this.provider, { system: this.system, prompt, temperature: this.temperature, maxTokens, model: this.model, tier: this.tier, tag: `${this.id}.${tag}` }, validate);
  }
  async #withFallback(res, fb) {
    if (res.data) return res;
    const f = await fb();
    return { data: f.data, meta: { ...res.meta, fallback: true } };
  }
  async intro(view, calling) {
    return this.#withFallback(await this.#ask(P.playerIntroPrompt(view, calling), (d) => typeof d.text === 'string', 'intro'), () => this.fallback.intro(view, calling));
  }
  async act(view) {
    return this.#withFallback(await this.#ask(P.playerActPrompt(view), (d) => 'target' in d || 'say' in d || 'theorize' in d, 'act'), () => this.fallback.act(view));
  }
  async fallout(view, need) {
    return this.#withFallback(await this.#ask(P.playerFalloutPrompt(view, need), (d) => d.memory, 'fallout', 300), () => this.fallback.fallout(view, need));
  }
  async epilogue(view) {
    return this.#withFallback(await this.#ask(P.playerEpiloguePrompt(view), (d) => typeof d.text === 'string', 'epilogue', 300), () => this.fallback.epilogue(view));
  }
}

// ------------------------------------------------------------------ Mock agents
// Deterministic scripted agents. They exist so the whole pipeline (engine →
// renderer → reviewer → explorer) runs offline, fast, and reproducibly; the
// Explorer uses them to sweep rule variants mechanically.

const ok = (data) => ({ data, meta: { ok: true, ms: 0, mock: true } });

const VOICE = {
  choir: {
    say: ['We are many and we are listening.', 'Let us carry some of that.', 'We have crossed wounds before.', 'Hold still. We know this shape.', 'Every cell of us votes yes.', 'We do not leave things behind.'],
    remember: (t) => `Not a breath, then — a bridge. ${t.replace(/^We were /, 'We had been ').replace(/^We /, 'Once we ')}`,
  },
  sort7: {
    say: ['Index three disagrees with index nine. Interesting.', 'Getting worse first is permitted.', 'This resembles me. I will stand near it.', 'Comparing. Comparing. Found.', 'I was not built to want this.', 'Order is not the same as truth.'],
    remember: (t) => `Re-reading: ${t} The detour was the point.`,
  },
  ilse2: {
    say: ['I have been here before. Or she has.', 'Nobody touch the memories. Mine are rentals.', 'Fine. I will go first, again.', 'That is not my face. It is close.', 'Original or not, I am the one who is here.', 'Ask me later who I was.'],
    remember: (t) => `Maybe it was never her kitchen. ${t}`,
  },
  regent: {
    say: ['⟨left⟩ Forward. ⟨right⟩ Back.', 'We will regrow the rest.', 'A decree is only a voltage.', 'Two heads, one argument.'],
    remember: (t) => `⟨left⟩ We remember it whole. ⟨right⟩ We remember it cut. ${t}`,
  },
  lattice: {
    say: ['08:14. Proceed.', 'Congestion ahead. Rerouting.', 'Red means nothing here.', 'Keep moving. Keep moving.'],
    remember: (t) => `Timestamp revised: ${t}`,
  },
};

const BRANCH_TEMPLATES = {
  delve: {
    success: (n, l) => `${n} finds the gradient that the ${l} was hiding. The way down opens like a held breath released.`,
    cost: (n, l) => `${n} gets through, but the ${l} takes its toll: something has to bend to make the path.`,
    fail: (n, l) => `The ${l} folds around ${n}. Downhill feels like home, and that is exactly the trap.`,
  },
  clue: {
    success: (n, l) => `${n} reads the ${l} like handwriting, and a line of it resolves.`,
    cost: (n, l) => `${n} learns something true — and the knowing leaves a mark.`,
    fail: (n, l) => `${n} reaches into the ${l}; the pattern reaches back first.`,
  },
  npc: {
    success: (n, x) => `${x} turns toward ${n}, and for the first time listens.`,
    cost: (n, x) => `${x} agrees, but asks for something in return.`,
    fail: (n, x) => `${x} hears ${n} wrong, perfectly.`,
  },
  clock: {
    success: (n) => `${n} leans on the moment and it gives.`,
    cost: (n) => `${n} moves the world an inch, and pays for the inch.`,
    fail: (n) => `${n} pushes, and the push is used against them.`,
  },
  ally: {
    success: (n, x) => `${n} closes the seam in ${x}. It holds.`,
    cost: (n, x) => `${n} patches ${x} with something borrowed from itself.`,
    fail: (n, x) => `${n}'s repair takes, wrongly. ${x} flinches.`,
  },
};

export class MockGM {
  constructor({ seed = 'mock-gm', harshness = 0.5 } = {}) { this.rng = createRng(seed); this.harshness = harshness; this.kind = 'mock'; }
  async frame(view) {
    const l = view.location;
    const hook = view.cast.find((c) => c.beats?.some((b) => !b.hit));
    const beat = hook?.beats.find((b) => !b.hit);
    const secret = view.secretsToReveal.at(-1);
    const text = `${l?.description ?? ''} ${secret ? `And now it is plain: ${secret.toLowerCase()}` : ''} ${beat ? `Something here seems made for ${hook.name}.` : ''}`.trim();
    return ok({ text: truncate(text, 360), gm_move: secret ? 'Reveal an unwelcome truth' : 'Show a danger approaching', intent: beat ? `Open a door for ${hook.name}'s beat: ${beat.text}` : 'Establish the place.', new_facts: [`${l?.name} is tier ${l?.tier}.`] });
  }
  async adjudicate(view, action, sheet, extra = {}) {
    const n = sheet.name;
    const lname = (view.location?.name ?? 'place').replace(/^The /, '');
    if (action.kind === 'theorize') {
      const accepted = action.theorize.clues.filter(() => this.rng.next() < 0.85);
      return ok({ clues_accepted: accepted, why: 'The theory accounts for most of what was found.', branches: { success: `${n}'s theory lands. The Aperture seems to exhale, as if relieved to be read.`, fail: `${n}'s theory slides off the pattern. It was the wrong shape, and the wrong shape costs.` }, gm_move: 'Reveal an unwelcome truth', intent: 'Let the theory decide the truth.', beats_hit: this.#beats(action, sheet, 'inquiry.name') });
    }
    if (!action.needsRoll) {
      return ok({ response: `${view.location?.name ?? 'The Latent'} answers ${n} with a hum that is almost a word.`, npc_line: null, gm_move: 'Let a pattern want something', intent: 'Keep the scene breathing.', new_facts: [], beats_hit: this.rng.next() < 0.3 ? this.#beats(action, sheet) : [] });
    }
    const t = action.target.type;
    const tier = view.location?.tier ?? 1;
    const harsh = this.rng.next() < this.harshness;
    const position = tier >= 3 ? (harsh ? 'desperate' : 'risky') : tier === 2 ? (harsh ? 'risky' : 'controlled') : 'controlled';
    const effect = this.rng.pick(['limited', 'standard', 'standard', 'great']);
    const resistance = { delve: this.rng.pick(['reach', 'substrate', 'boundary']), clue: this.rng.pick(['coherence', 'memory']), npc: this.rng.pick(['boundary', 'coherence']), clock: 'boundary', ally: 'substrate' }[t] ?? 'coherence';
    const x = t === 'npc' ? view.location.npcs.find((p) => p.id === action.target.id)?.name : t === 'ally' ? view.cast.find((c) => c.id === action.target.id)?.name : lname;
    const T = BRANCH_TEMPLATES[t] ?? BRANCH_TEMPLATES.clock;
    const branches = { success: T.success(n, x), cost: T.cost(n, x), fail: `${T.fail(n, x)}${extra.complicationHint ? ` ${extra.complicationHint}` : ''}` };
    return ok({
      position, effect, resistance,
      failure_looks_like: `If this fails, ${n} loses some ${resistance} to the ${lname}.`,
      gm_move: this.rng.pick(['Show a danger approaching', 'Offer a gift with a price', 'Put someone in a spot', 'Tick a clock in plain view']),
      intent: `Pressure ${n} where it hurts: ${resistance}.`,
      clock_on_fail: this.rng.next() < 0.25 ? 'ingression' : 'attractor',
      branches,
      clue_text: extra.clueSeeds?.[0]?.seed ?? null,
      npc_line: t === 'npc' ? `"You ask as if asking were free," says ${x}.` : null,
      new_facts: [],
      beats_hit: this.#beats(action, sheet),
    });
  }
  #beats(action, sheet, prefer = null) {
    const open = (sheet.beats ?? []).filter((b) => !b.hit);
    const want = open.find((b) => b.id === prefer) ?? open.find((b) => b.id === action.beat);
    if (want && this.rng.next() < 0.6) return [{ actor: sheet.id, beat: want.id, why: 'The action fulfils it.' }];
    return [];
  }
  async fallout(view, f, options, sheet) {
    const o = this.rng.pick(options);
    return ok({ choice: o?.id, narration: `${sheet.name}: ${o?.text ?? ''}` });
  }
  async ending(view, ending, text) {
    return ok({ text: `${text} The Garden keeps growing. Somewhere, a queue re-sorts itself around a new key.` });
  }
}

export class MockValidator {
  constructor() { this.kind = 'mock'; }
  async check() { return { data: { contradictions: [] }, meta: { ok: true, ms: 0, mock: true } }; }
}

const isStatusLike = (k) => ['condition', 'compel', 'gap', 'voice'].includes(k.type);
const MOVE_FITS = { delve: ['Navigate', 'Evade', 'Endure'], clue: ['Discern'], npc: ['Signal', 'Discern'], clock: ['Signal', 'Reshape', 'Discern'], ally: ['Mend', 'Endure'] };

export class MockPlayer {
  constructor({ id, seed = 'mock', boldness = 0.5, cooperation = 0.4 } = {}) {
    this.id = id; this.rng = createRng(`${seed}:${id}`); this.boldness = boldness; this.cooperation = cooperation; this.kind = 'mock';
  }
  #say() { return this.rng.pick(VOICE[this.id]?.say ?? ['…']); }
  async intro(view, calling) {
    const beats = this.rng.shuffle(calling.beats.filter((b) => b.tier !== 'zenith')).slice(0, 2).map((b) => b.id);
    return ok({ text: `${view.you.pitch} ${this.#say()}`, beats, intent: 'Find out what I am for.' });
  }
  async act(view) {
    const res = await this.#act(view);
    if (view.you.deck) res.data = this.#cards(view, res.data);
    return res;
  }

  /** Deck mode: turn the scripted intent into cards from the hand (plus drafts and haunt removals). */
  #cards(view, intent) {
    const r = this.rng;
    const deck = view.you.deck;
    const hand = deck.hand;
    const out = { ...intent, play: [] };
    if (deck.offer) {
      const calling = deck.offer.cards.find((k) => k.type === 'calling');
      out.draft = (calling && r.next() < 0.5 ? calling : r.pick(deck.offer.cards)).offerId;
    }
    const t = String(intent.target ?? 'none').split(':')[0];
    const setDown = deck.cards.find((k) => k.removable && isStatusLike(k));
    if (setDown && out.rest) out.rest = { ...out.rest, remove: setDown.uid };
    if (setDown && t === 'haunt') out.remove = setDown.uid;
    if (out.guard && !hand.some((k) => k.kind === 'guard')) out.guard = null;
    if (out.guard) out.play.push(hand.find((k) => k.kind === 'guard').uid);
    const rolls = t !== 'none' && t !== 'haunt' && !intent.theorize;
    if (!rolls) {
      if (out.memory && !hand.some((k) => k.type === 'memory' && k.memory === out.memory.id)) out.memory = null;
      return out;
    }
    // Best Move in hand for this target: the intended skill, else any skill that fits (an entity's own levers first).
    const npc = t === 'npc' ? view.location?.npcs?.find((n) => `npc:${n.id}` === intent.target) : null;
    const fits = [intent.skill, ...(npc?.movedBy ?? []), ...(MOVE_FITS[t] ?? [])];
    let move = null;
    for (const s of fits) { move = hand.find((k) => k.type === 'knack' && k.skill === s) ?? hand.find((k) => k.kind === 'move' && k.skill === s); if (move) break; }
    move ??= hand.find((k) => k.type === 'knack') ?? hand.find((k) => k.kind === 'move'); // any approach beats improvising
    if (move) { out.play.push(move.uid); out.skill = move.skill; }
    const edges = [];
    if (out.memory) {
      const mc = hand.find((k) => k.type === 'memory' && k.memory === out.memory.id)
        ?? hand.find((k) => k.type === 'memory' && !k.invokedThisScene);
      if (mc) { edges.push(mc); out.memory = mc.memory === out.memory.id ? out.memory : { id: mc.memory, reinterpretation: (VOICE[this.id]?.remember ?? ((x) => x))(mc.memoryText) }; }
      else out.memory = null;
    }
    const dom = hand.find((k) => k.type === 'domain' && k.here);
    if (dom) edges.push(dom);
    out.domain = dom?.domain ?? null;
    const flaw = hand.find((k) => k.type === 'flaw' && k.edgeFor?.includes(out.skill));
    if (flaw) edges.push(flaw);
    const oneUse = hand.find((k) => ['resolve', 'gift', 'insight'].includes(k.type));
    if (oneUse && (view.location?.tier ?? 1) >= 2) edges.push(oneUse);
    const calling = hand.find((k) => k.type === 'calling' && (!k.onlyTargets || k.onlyTargets.includes(t)));
    if (calling && r.next() < 0.7) edges.push(calling);
    const drive = hand.find((k) => k.type === 'drive');
    if (drive && r.next() < 0.6) edges.push(drive);
    const voice = hand.find((k) => k.type === 'voice');
    if (voice && r.next() < 0.4) edges.push(voice);
    // Playing a flaw that costs focus frees the slot it was costing.
    const kept = edges.slice(0, deck.edgesAllowed - (flaw?.focus ?? 0));
    if (out.memory && !kept.some((k) => k.type === 'memory')) out.memory = null;
    out.play.push(...kept.map((k) => k.uid));
    const compel = hand.find((k) => k.kind === 'compel');
    if (compel && deck.lastMove === out.skill) out.play.push(compel.uid);
    return out;
  }

  async #act(view) {
    const r = this.rng;
    const you = view.you;
    const kind = view.scene?.kind;
    const openBeat = you.beats.find((b) => !b.hit)?.id ?? null;
    const locDomains = view.location?.domains ?? [];
    const domain = you.domains.find((d) => locDomains.includes(d)) ?? you.domains[0];
    const memOk = you.memories.filter((m) => !m.invokedThisScene);
    const useMem = (view.forceMemory || r.next() < 0.35) && memOk.length;
    const mem = useMem ? r.pick(memOk) : null;
    const memory = mem ? { id: mem.id, reinterpretation: (VOICE[this.id]?.remember ?? ((t) => t))(mem.text) } : null;
    const hurtAlly = view.allies.filter((a) => a.total >= 5).sort((a, b) => b.total - a.total)[0];
    const share = r.next() < this.cooperation ? view.allies[0]?.id ?? null : null;
    // Free rest at landmarks when hurt (v0.3), never spending the memory being invoked.
    // With a deck, a haunt is also where you set down a status card, so clogged hands rest too.
    const spare = you.memories.filter((m) => m.id !== mem?.id);
    const clogged = !!you.deck?.cards.some(isStatusLike) && spare.length > 2;
    const rest = view.location?.isDelve === false && view.location?.haunts?.length && (you.total >= 4 || clogged) && spare.length > 1
      ? { haunt: r.pick(view.location.haunts).id, memory: spare.at(-1).id } : null;
    const base = { intent: '', say: this.#say(), memory, beat: openBeat, guard: share, theorize: null, rest };
    const skillFor = (pref) => pref.find((s) => you.skills.includes(s)) ?? pref[0];

    if (!view.theory && view.clues.length >= 3 && (kind === 'finale' || (kind === 'landmark' && view.scene.id === 'library' && r.next() < 0.5))) {
      const clues = view.clues.map((c) => c.id);
      const theory = this.rng.pick([
        'A mind that has no body yet, using our bodies as a draft of the one it wants.',
        'The Garden itself, remembering forward: a shape that wants to finish.',
        'A sorting rule that became a self, pulling every pattern into its order.',
      ]);
      return ok({ ...base, intent: 'Name it before it names us.', theorize: { theory, clues }, target: 'none', memory: null });
    }
    if (hurtAlly && you.skills.includes('Mend') && r.next() < 0.6) {
      return ok({ ...base, intent: `Keep ${hurtAlly.name} together.`, do: `mend ${hurtAlly.name}'s fraying edges`, target: `ally:${hurtAlly.id}`, skill: 'Mend', domain });
    }
    if (you.total >= 7 && view.location?.haunts?.length && you.memories.length > 1 && r.next() < 0.5) {
      const h = r.pick(view.location.haunts);
      return ok({ ...base, intent: 'Rest, even if it costs a memory.', do: `rest at ${h.name}`, target: `haunt:${h.id}`, memory: { id: you.memories.at(-1).id } });
    }
    if (kind === 'delve') {
      if (r.next() < 0.15) return ok({ ...base, intent: 'Talk while walking.', do: '', target: 'none' });
      return ok({ ...base, intent: 'Get us through.', do: r.pick(['find the gradient', 'step out of the basin, even though it hurts', 'follow the herd uphill', 'climb the next proven step']), target: 'delve', skill: skillFor(['Navigate', 'Evade', 'Endure']), domain });
    }
    if (kind === 'finale') {
      const ap = view.clocks.find((c) => c.id === 'aperture');
      if (ap) return ok({ ...base, intent: 'Answer it.', do: 'speak to the Aperture in the shape of our theory', target: 'clock:aperture', skill: skillFor(['Signal', 'Reshape', 'Discern']), domain });
      return ok({ ...base, intent: 'I cannot see it, so I hold the others.', do: 'anchor the party', target: view.allies[0] ? `ally:${view.allies[0].id}` : 'none', skill: skillFor(['Mend', 'Endure']), domain });
    }
    // landmark / prologue
    const npc = view.location?.npcs?.[0];
    const roll = r.next();
    if (npc && roll < 0.3) return ok({ ...base, intent: `Move ${npc.name}.`, do: `appeal to ${npc.name}`, target: `npc:${npc.id}`, skill: skillFor(['Signal', 'Discern', 'Reshape']), domain });
    if (roll < 0.85) return ok({ ...base, intent: 'Read the place.', do: r.pick(['read the voltage-handwriting', 'compare the shelves to myself', 'listen to the beds', 'trace the queue key']), target: 'clue', skill: skillFor(['Discern']), domain });
    return ok({ ...base, intent: 'Just be here a moment.', do: '', target: 'none' });
  }
  async fallout(view, need) {
    const m = this.rng.pick(view.you.memories);
    if (need.type === 'memory_rewrite') return ok({ memory: m?.id, rewritten: (VOICE[this.id]?.remember ?? ((t) => t))(m?.text ?? '') });
    return ok({ memory: m?.id, last_words: 'I will know it by the gap.' });
  }
  async epilogue(view) {
    return ok({ text: this.#say(), memory: `We went down to the Aperture and came back ${view.theory ? 'knowing one thing' : 'unsure'}.` });
  }
}
