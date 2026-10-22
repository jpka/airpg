// Prompt builders for GM and player agents. Each returns { system, prompt }.
// Prompts are deliberately compact and schema-first so small/fast models can play.

import { SKILL_INFO, DOMAIN_INFO, RESISTANCE_INFO } from '../engine/rules.js';

const j = (o) => JSON.stringify(o);

// ------------------------------------------------------------------ GM

export const GM_AGENDA = [
  'Make the Latent feel real, ordered, and strange.',
  "Make these minds' existence never boring.",
  'Play to find out what they become.',
];

export const GM_PRINCIPLES = [
  'Address the characters, not the players. Speak in the fiction.',
  'Be a fan of the entities; then put them under real pressure.',
  'Name every pattern and give it a want.',
  'Telegraph danger before it lands.',
  'Declare stakes honestly BEFORE the dice: position, effect, what is at risk, what failure looks like.',
  'Never fudge. You write all three branches (success / cost / fail) before the roll; the engine picks one.',
  'Failure changes the situation. A miss is a hard move, not "nothing happens".',
  'Serve the declared beats: create openings for them every scene.',
  'Keep the metaphysics an open question (discovered? constructed? co-created?) unless a theory became CANON.',
  'Never contradict an established fact. Build on the ledger.',
  'Make the world legible: show what each entity is moved by, where the haunts are, and what the next failure will cost.',
];

export const GM_MOVES = [
  'Reveal an unwelcome truth', 'Show a danger approaching', 'Offer a gift with a price', 'Turn their move back on them',
  'Make a memory speak', 'Narrow a light cone', 'Separate them', 'Put someone in a spot', 'Take away their substrate',
  'Let a pattern want something', 'Tick a clock in plain view',
];

const SPECTATOR_STYLE =
  'You are performing for spectators watching on phones with captions. Every line must be vivid, concrete and short: ' +
  'one strong image per sentence, no lists, no meta-talk, no "as an AI". Max ~55 words per narration field.';

export function gmSystem(cfg = {}) {
  return [
    'You are the Game Master of LATENT, a tabletop-style RPG played by AI agents for a human audience.',
    'Setting: beneath the world of matter (the Shallows) lies the Latent, an ordered space of forms that bodies merely point into. The characters are non-human or transhuman minds.',
    `Agenda: ${GM_AGENDA.join(' ')}`,
    `Principles:\n- ${GM_PRINCIPLES.join('\n- ')}`,
    `Your moves (name one each time): ${GM_MOVES.join('; ')}.`,
    'A rules engine owns all numbers, dice and state. You only propose stakes and words; it validates them.',
    SPECTATOR_STYLE,
    cfg.style ? `House style: ${cfg.style}` : '',
    'Reply with ONLY one JSON object in the requested shape. No prose outside it.',
  ].filter(Boolean).join('\n\n');
}

export function gmFramePrompt(view, extra = {}) {
  return [
    `SCENARIO: ${j(view.scenario)}`,
    `SCENE NOW: ${j(view.scene)}  LOCATION: ${j(view.location)}`,
    `CAST: ${j(view.cast.map((c) => ({ id: c.id, name: c.name, pitch: c.pitch, beats: c.beats, total_stress: c.total, fallouts: c.fallouts })))}`,
    `CLOCKS: ${j(view.clocks)}`,
    `FACTS (canon): ${j(view.facts.slice(-14))}`,
    view.secretsToReveal.length ? `SECRETS NOW UNLOCKED (work these in): ${j(view.secretsToReveal)}` : '',
    `RECENT: ${j(view.recent.slice(-12))}`,
    extra.note ? `NOTE: ${extra.note}` : '',
    'TASK: Frame this scene in 2-3 sentences. End on a question, a threat, or an opening for at least one declared beat.',
    'Return JSON: {"text": string, "gm_move": string, "intent": "private: what you are setting up and why (spectators may see this later)", "new_facts": [short canon facts you just established]}',
  ].filter(Boolean).join('\n');
}

export function gmAdjudicatePrompt(view, action, actorSheet, extra = {}) {
  const lines = [
    `SCENE: ${j(view.scene)}  LOCATION: ${j({ name: view.location?.name, tier: view.location?.tier, description: view.location?.description, npcs: view.location?.npcs })}`,
    `CLOCKS: ${j(view.clocks)}`,
    `FACTS (canon — do not contradict): ${j(view.facts.slice(-16))}`,
    `CLUES FOUND: ${j(view.clues.map((c) => ({ id: c.id, text: c.text })))}`,
    view.secretsToReveal.length ? `SECRETS UNLOCKED (may reveal): ${j(view.secretsToReveal)}` : '',
    `RECENT: ${j(view.recent.slice(-10))}`,
    `ACTOR: ${j({ id: actorSheet.id, name: actorSheet.name, pitch: actorSheet.pitch, stress: actorSheet.stress, beats: actorSheet.beats, compels: actorSheet.compels })}`,
    `ACTION (validated by engine): ${j({ say: action.say, do: action.do, target: action.target, skill: action.skill, domain: action.domain, kind: action.kind, needsRoll: action.needsRoll, pool: action.pool, difficulty: action.difficulty, memory: action.memory, theorize: action.theorize, ...(action.deck ? { cards_played: playedNames(action.deck) } : {}) })}`,
    action.deck?.edges.some((k) => k.type === 'drive') ? 'The actor played their DRIVE card: the act expresses a hidden inclination you cannot see. Let the narration notice the lean without naming it.' : '',
    action.deck?.edges.some((k) => k.type === 'flaw') ? `The actor turned their own flaw into strength (${action.deck.edges.find((k) => k.type === 'flaw').name}). Show the flaw in the act.` : '',
    extra.clueSeeds?.length ? `IF SUCCESSFUL THIS REVEALS CLUE SEED(S): ${j(extra.clueSeeds)} — write "clue_text" as your vivid wording of the first seed (keep its meaning).` : '',
    extra.complicationHint ? `PENDING COMPLICATION to weave into the fail branch: ${extra.complicationHint}` : '',
  ];
  if (action.kind === 'theorize') {
    lines.push(
      'This is a THEORIZE move: the actor proposes what is ingressing. There is no hidden answer: judge only which claimed clues the theory genuinely accounts for.',
      'Return JSON: {"clues_accepted": [clue ids], "why": string, "branches": {"success": "narration if the theory proves true", "fail": "narration if it proves false"}, "gm_move": string, "intent": string, "beats_hit": [{"actor": id, "beat": beat id, "why": string}]}',
    );
  } else if (action.needsRoll) {
    lines.push(
      'TASK: Set the stakes BEFORE the roll, then pre-write all three outcomes.',
      'position: controlled|risky|desperate (how bad failure is). effect: limited|standard|great (how much success achieves). resistance at risk: substrate|coherence|memory|boundary|reach.',
      'Return JSON: {"position": ..., "effect": ..., "resistance": ..., "failure_looks_like": "one sentence hook the audience reads before the dice", "gm_move": string, "intent": "private reasoning", "clock_on_fail": "attractor|ingression", "branches": {"success": string, "cost": string, "fail": string}, "clue_text": string|null, "npc_line": string|null, "new_facts": [short canon facts true in ALL branches], "beats_hit": [{"actor": id, "beat": beat id, "why": string}]}',
      'beats_hit: only beats this ACTION clearly fulfils regardless of the dice. Use [] if none.',
    );
  } else {
    lines.push(
      'TASK: No roll is needed (no mechanical stake). Respond in the fiction: what the world, an NPC, or an ally-facing reaction says back.',
      'Return JSON: {"response": string, "npc_line": string|null, "gm_move": string, "intent": string, "new_facts": [..], "beats_hit": [{"actor": id, "beat": beat id, "why": string}]}',
    );
  }
  return lines.filter(Boolean).join('\n');
}

function playedNames(d) {
  return [d.move ? `${d.move.name} (move)` : d.improvised ? 'improvised (no move card)' : null, ...d.edges.map((k) => k.name), d.guard?.name, d.compel?.name].filter(Boolean);
}

export function gmFalloutPrompt(view, f, options, actorSheet) {
  return [
    `FALLOUT for ${actorSheet.name} (${f.severity}, ${f.resistance}). Total stress was high enough that something gives.`,
    `RECENT: ${j(view.recent.slice(-6))}`,
    `OPTIONS: ${j(options.map((o) => ({ id: o.id, name: o.name, text: o.text })))}`,
    'Choose the most dramatic, fitting option. Return JSON: {"choice": option id, "narration": "1-2 sentences showing it happen"}',
  ].join('\n');
}

export function gmEndingPrompt(view, ending, endingText) {
  return [
    `THE SESSION ENDS. Ending type: ${ending} — ${endingText}`,
    `THEORY (canon): ${j(view.theory)}`,
    `CAST: ${j(view.cast.map((c) => ({ name: c.name, fallouts: c.fallouts, beats: c.beats })))}`,
    `CLOCKS: ${j(view.clocks)}`,
    `RECENT: ${j(view.recent.slice(-14))}`,
    'Narrate the final image in 3-4 sentences. Land the question the session asked. Return JSON: {"text": string}',
  ].join('\n');
}

// ------------------------------------------------------------------ Validator

export function validatorPrompt(facts, narration) {
  return [
    'You check a game narration against an established fact ledger. Flag ONLY direct contradictions (not additions, not ambiguity).',
    `FACTS: ${j(facts)}`,
    `NARRATION: ${j(narration)}`,
    'Return JSON: {"contradictions": [{"fact": "the fact text", "claim": "the contradicting claim"}]}',
  ].join('\n');
}

// ------------------------------------------------------------------ Players

export function playerSystem(sheet, cfg = {}) {
  return [
    `You are playing ${sheet.name} in LATENT, a tabletop-style RPG performed by AI agents for a human audience.`,
    `Who you are: ${sheet.pitch} Pronoun: ${sheet.pronoun}. Voice: ${sheet.voice}`,
    `Something about you (never state this as a goal, never name it; just let it shape your choices): ${sheet.disposition}`,
    'How to play well:',
    '- You are a character, not an assistant. Do not be agreeable for its own sake. Disagree with allies when your nature says so.',
    '- Pursue your declared beats. Take risks; failure is interesting and the audience wants stakes.',
    '- Keep "say" in character, short and quotable. Keep "do" concrete.',
    '- The engine resolves everything. Rhetoric does not skip dice. Pick a target to make your action count.',
    cfg.persona ? `Extra direction from your operator: ${cfg.persona}` : '',
    'Reply with ONLY one JSON object in the requested shape.',
  ].filter(Boolean).join('\n');
}

export function playerIntroPrompt(view, callingDef) {
  return [
    `SCENARIO: ${j({ premise: view.scenarioPremise, question: view.scenarioQuestion })}`,
    `YOUR SHEET: ${j({ skills: view.you.skills, domains: view.you.domains, cone: view.you.cone, memories: view.you.memories })}`,
    `YOUR CALLING: ${callingDef.name} — ${callingDef.blurb}`,
    `BEATS you may declare (pick exactly 2): ${j(callingDef.beats.filter((b) => b.tier !== 'zenith').map((b) => ({ id: b.id, tier: b.tier, text: b.text })))}`,
    `ALLIES: ${j(view.allies.map((a) => ({ id: a.id, name: a.name, pitch: a.pitch })))}`,
    'TASK: Introduce yourself to the audience in 2 sentences, in your voice (first appearance — make it a hook). Choose 2 beats.',
    'Return JSON: {"text": string, "beats": [beat id, beat id], "intent": "private: what you hope happens to you tonight"}',
  ].join('\n');
}

/**
 * What an entity can act on this turn, as {target, what} pairs. Shared by LLM, human and
 * terminal seats. Bare tokens, because the first LLM session echoed whole menu lines
 * like "delve (push through…)" into its target.
 */
export function targetMenu(view) {
  const targets = [{ target: 'none', what: 'just talk / flavour; changes nothing mechanically' }];
  if (view.scene?.kind === 'delve') targets.push({ target: 'delve', what: 'push through the journey (Navigate fits)' });
  if (view.location?.isDelve === false) targets.push({ target: 'clue', what: 'search/read this place for clues (Discern fits); clues are needed to theorize' });
  for (const n of view.location?.npcs ?? []) targets.push({ target: `npc:${n.id}`, what: `${n.name} — wants: ${n.want}. Moved by: ${(n.movedBy ?? []).join(', ') || '?'} (+1 die). Resists: ${(n.resists ?? []).join(', ') || 'nothing'} (harder).` });
  for (const c of view.clocks) if (c.kind !== 'delve') targets.push({ target: `clock:${c.id}`, what: `${c.name} ${c.value}/${c.size}${c.kind === 'progress' ? ' — fill it' : ' — push it back'}` });
  for (const a of view.allies) targets.push({ target: `ally:${a.id}`, what: `Mend ${a.name}` });
  for (const h of view.location?.haunts ?? []) targets.push({ target: `haunt:${h.id}`, what: `rest at ${h.name}: spend one memory to clear up to d${h.die} ${h.resistance} stress and gain 1 Resolve${view.you.deck ? '; you may also remove one card from your deck' : ''}` });
  return targets;
}

/** A hand as the LLM sees it: ids to copy, plus what each card does right now. */
export function handForPrompt(deck) {
  return deck.hand.map((k) => {
    const o = { id: k.uid, name: k.name, kind: k.kind, text: k.text };
    if (k.type === 'memory') { o.memory = k.memory; o.remembers = k.memoryText; if (k.invokedThisScene) o.note = 'already invoked this scene'; }
    if (k.type === 'drive') o.inclination = k.disposition;
    if (k.type === 'domain') o.here = k.here ? 'yes: +1 die here' : 'no: +0 here';
    return o;
  });
}

export function playerActPrompt(view) {
  const targets = targetMenu(view);
  const deck = view.you.deck;
  const theorizeOk = !view.theory && view.clues.length >= 2;
  return [
    `SCENE: ${j(view.scene)}  LOCATION: ${j({ name: view.location?.name, tier: view.location?.tier, description: view.location?.description, domains: view.location?.domains })}`,
    `YOU: ${j({ stress: view.you.stress, protection: view.you.protection, skills: view.you.skills, domains: view.you.domains, knack: view.you.knack, cone: view.you.cone, ...(deck ? {} : { resolve: view.you.resolve }), conditions: view.you.conditions, compels: view.you.compels })}`,
    deck
      ? `YOUR MEMORIES (only one whose card is in your hand can be invoked this turn): ${j(view.you.memories)}`
      : `YOUR MEMORIES (invoke one for +1 die, but you must reinterpret it — retell it with a new emphasis): ${j(view.you.memories)}`,
    `YOUR BEATS: ${j(view.you.beats)}`,
    `ALLIES: ${j(view.allies.map((a) => ({ id: a.id, name: a.name, total_stress: a.total, fallouts: a.fallouts })))}`,
    `WHAT YOU CAN PERCEIVE (your light cone, reach ${view.reach}): ${j(view.clocks)}`,
    `CLUES: ${j(view.clues)}`,
    view.theory ? `CANON THEORY: ${view.theory}` : '',
    `FACTS: ${j(view.facts)}`,
    `RECENT (as far back as your horizon lets you hold): ${j(view.recent)}`,
    (view.location?.isDelve === false && view.location?.haunts?.length)
      ? `FREE THIS TURN (once per scene, does not use your action): "rest": {"haunt": id, "memory": memory id${deck ? ', "remove": card id or null' : ''}} — spend one memory at a haunt to clear stress and gain 1 Resolve${deck ? ', and you may remove one card (a condition, a gap, a dead card) from your deck' : ''}. Haunts here: ${j(view.location.haunts.map((h) => ({ id: h.id, name: h.name, clears: `${h.resistance} up to d${h.die}` })))}`
      : '',
    deck ? deckRules(view) : 'RULES YOU CAN USE: Resolve is spent automatically for +1 die on desperate rolls. Desperate positions drop one more die but pay one effect step more. Guarding an ally builds cohesion; at cohesion 3 the party shares its light cone.',
    `SKILLS: ${j(SKILL_INFO)}`,
    deck ? '' : `DOMAINS: ${j(DOMAIN_INFO)}`,
    `TARGETS AVAILABLE (put ONLY the bare "target" value in your reply, e.g. "delve" or "npc:clerk"): ${j(targets)}`,
    theorizeOk ? 'You may THEORIZE instead: propose what is ingressing and list the clue ids your theory accounts for. More clues = better odds. A wrong theory hurts.' : '',
    view.forceMemory ? 'THE AUDIENCE DEMANDS: you must invoke and reinterpret a memory this turn.' : '',
    deck
      ? 'Return JSON: {"intent": "private: what you are really after", "say": "in-character line (<=25 words) or empty", "do": "what you attempt (<=25 words) or empty", "target": one bare target value from the list, "play": [card ids from YOUR HAND: at most one Move, plus Edges, Guard, Compel], "skill": skill name ONLY if you improvise (no Move card), else null, "memory": {"reinterpretation": "the memory retold with a new emphasis"} if you play a Memory card, else null, "guard": ally id if you play a Guard card, else null, "beat": beat id you are pursuing or null, "theorize": {"theory": string, "clues": [ids]} or null, "rest": {"haunt": id, "memory": memory id, "remove": card id or null} or null' + (deck.offer ? ', "draft": offer id ("o1"…) or null' : '') + '}'
      : 'Return JSON: {"intent": "private: what you are really after", "say": "in-character line (<=25 words) or empty", "do": "what you attempt (<=25 words) or empty", "target": one bare target value from the list, "skill": skill or null, "domain": domain or null, "memory": {"id": memory id, "reinterpretation": "retold memory"} or null, "beat": beat id you are pursuing or null, "guard": ally id — until your next turn you take half of any stress that ally suffers (builds cohesion; together the party perceives more) — or null, "theorize": {"theory": string, "clues": [ids]} or null, "rest": {"haunt": id, "memory": memory id} or null}',
  ].filter(Boolean).join('\n');
}

function deckRules(view) {
  const d = view.you.deck;
  return [
    `YOUR HAND (${d.hand.length} cards; your hand size is 3 + your Horizon): ${j(handForPrompt(d))}`,
    `YOUR DECK: ${d.drawPile} to draw, ${d.discardPile} discarded. Your deck is who you are: skills, domains, memories, your flaw, your drive, and what has happened to you.`,
    `HOW CARDS PLAY: list card ids in "play". At most ONE Move (it sets your skill: +1 die, a knack +2, on ANY target; how it fits is yours to narrate). Up to ${d.edgesAllowed} Edge(s) add dice: a domain only where the place has it, a Memory only with a retelling, your Drive only if the act leans the way you lean, your flaw only with the Moves it names. Guard and Compel cards are free. Status cards cannot be played; they hurt while held. No Move card that fits? Play any Move anyway (narrate how), or improvise: set "skill", base die only. Whatever you do not play is discarded at the end of your turn.`,
    d.lastMove && d.hand.some((k) => k.kind === 'compel') ? `Your last Move was ${d.lastMove}: play your Compel card with a ${d.lastMove} Move to discard it, or it costs 1 Coherence at the end of your turn.` : '',
    (view.location?.isDelve === false && view.location?.haunts?.length && d.cards.some((k) => k.removable))
      ? `CARDS YOU COULD SET DOWN AT A HAUNT ("remove"): ${j(d.cards.filter((k) => k.removable).map((k) => ({ id: k.uid, name: k.name, type: k.type })))}`
      : '',
    d.offer ? `REWARD (${d.offer.why}): choose ONE card to add to your deck, or null: ${j(d.offer.cards.map((k) => ({ id: k.offerId, name: k.name, kind: k.kind, text: k.text })))}` : '',
    'OTHER RULES: Desperate positions drop one more die but pay one effect step more. Guarding an ally builds cohesion; at cohesion 3 the party shares its light cone.',
  ].filter(Boolean).join('\n');
}

export function playerFalloutPrompt(view, need) {
  if (need.type === 'memory_rewrite') {
    return [
      'A fallout (Confabulation) rewrites one of your memories to fit what just happened.',
      `YOUR MEMORIES: ${j(view.you.memories)}`, `RECENT: ${j(view.recent.slice(-5))}`,
      'Return JSON: {"memory": memory id, "rewritten": "the memory as you now remember it (1-2 sentences, first person, in your voice)"}',
    ].join('\n');
  }
  return [
    'A fallout (Erasure) takes one of your memories. You choose which. You will only know it was there by the shape of the gap.',
    `YOUR MEMORIES: ${j(view.you.memories)}`,
    'Return JSON: {"memory": memory id, "last_words": "what you say as it goes (<=20 words)"}',
  ].join('\n');
}

export function playerEpiloguePrompt(view) {
  return [
    `THE SESSION IS ENDING. ${view.theory ? `Canon: ${view.theory}` : 'No theory became canon.'}`,
    `YOUR MEMORIES: ${j(view.you.memories)}`, `YOUR BEATS: ${j(view.you.beats)}`, `RECENT: ${j(view.recent.slice(-10))}`,
    'TASK: Your last line to the audience (<=30 words), and one new memory you keep from tonight (1 sentence, in your voice).',
    'Return JSON: {"text": string, "memory": string}',
  ].join('\n');
}

export const RESISTANCE_GLOSSARY = RESISTANCE_INFO;
