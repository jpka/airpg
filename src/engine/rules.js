// LATENT rule parameters. Everything the Explorer may mutate lives here, so a
// "rule variant" is just a JSON diff over DEFAULT_RULES.
//
// Lineage (see docs/DESIGN.md):
//  - d10 pool / highest die / bands / d12-vs-total-stress fallout  ← Heart: The City Beneath (Resistance system)
//  - position & effect declared BEFORE the roll, progress clocks   ← Blades in the Dark
//  - five memories × three experiences, memories as a spendable     ← Thousand Year Old Vampire
//  - theorize against a clue ledger, no predetermined truth        ← Carved from Brindlewood
//  - cognitive light cone (Reach × Horizon), persuadability axis   ← Michael Levin, TAME

export const RESISTANCES = ['substrate', 'coherence', 'memory', 'boundary', 'reach'];

export const RESISTANCE_INFO = {
  substrate: { label: 'Substrate', blurb: 'the body or medium you run on: tissue, silicon, voltage' },
  coherence: { label: 'Coherence', blurb: 'holding together as one process rather than many' },
  memory:    { label: 'Memory',    blurb: 'the records you reinterpret to stay yourself' },
  boundary:  { label: 'Boundary',  blurb: 'where you end and the Latent (or others) begin' },
  reach:     { label: 'Reach',     blurb: 'your cognitive light cone: how far and how long you can care' },
};

export const SKILLS = ['Signal', 'Navigate', 'Discern', 'Endure', 'Evade', 'Reshape', 'Disrupt', 'Mend', 'Conceal'];
export const SKILL_INFO = {
  Signal:   'persuade, argue, broadcast a bioelectric or symbolic message',
  Navigate: 'move through goal-space; the delve skill',
  Discern:  'notice, read, interpret patterns; find clues',
  Endure:   'hold your shape under pressure',
  Evade:    'slip away, re-route, avoid capture by an attractor',
  Reshape:  'change your own or another body/structure',
  Disrupt:  'break, unmake, interrupt a process',
  Mend:     'repair, heal, restore coherence in self or ally',
  Conceal:  'hide, mask your pattern, misdirect',
};

export const DOMAINS = ['Flesh', 'Code', 'Number', 'Swarm', 'Ruin', 'Dream', 'Archive', 'Threshold'];
export const DOMAIN_INFO = {
  Flesh:     'living tissue, cells, bioelectric fields',
  Code:      'software, algorithms, executing instructions',
  Number:    'mathematical forms — low-agency platonic truths',
  Swarm:     'collectives, colonies, distributed selves',
  Ruin:      'dead or abandoned substrates, obsolete platforms',
  Dream:     'high-agency patterns, minds-in-waiting',
  Archive:   'records, memory stores, backups',
  Threshold: 'interfaces where the Latent pours into matter',
};

export const POSITIONS = ['controlled', 'risky', 'desperate'];
export const EFFECTS = ['limited', 'standard', 'great'];
export const DIFFICULTIES = ['standard', 'risky', 'dangerous'];

export const DEFAULT_RULES = {
  id: 'latent-0.5',
  // Dice pool: 1 base + skill + domain + mastery(<=1) + memory + assists + resolve
  memoryInvokeBonus: 1,
  maxMastery: 1,
  // Result bands on the highest remaining d10
  bands: { critFail: 1, failMax: 5, costMax: 7, successMax: 9 }, // 10 = crit
  critFailStressMultiplier: 2,
  // Stakes (declared before the roll by the GM agent, validated by the engine)
  stressDie: { controlled: 4, risky: 6, desperate: 8 },
  effectDie: { limited: 4, standard: 6, great: 8 },     // outgoing die vs delves / adversaries
  effectTicks: { limited: 1, standard: 2, great: 3 },   // ticks vs progress & threat clocks
  critStepsDieUp: true,
  // Difficulty removes highest dice; set by the engine from tier & persuadability, never by the GM's mood
  difficultyRemove: { standard: 0, risky: 1, dangerous: 2 },
  difficultyByTier: { 0: 'standard', 1: 'standard', 2: 'standard', 3: 'risky' },
  minPositionByTier: { 0: 'controlled', 1: 'controlled', 2: 'risky', 3: 'risky' },
  persuadabilityMatchBonus: 1,      // +1 die when your skill matches how an entity can be changed
  persuadabilityMismatchStep: 1,    // +1 difficulty step when you use force on a mind that reasons (etc.)
  // Fallout (Heart): roll d12; if <= total stress → fallout; minor if the d12 shows <= minorMax, else major
  fallout: { die: 12, minorMax: 6 },
  majorsToDissolve: 3,              // third major fallout = critical: the entity returns to the Latent
  // Memory (TYOV)
  memorySlots: 5,
  experiencesPerMemory: 3,
  backupSlots: 2,
  // Haunts: rest by spending an experience; removes stress up to the haunt die on its resistance
  hauntsSpendExperience: true,
  // Theorize (Brindlewood): 2d6 + accepted clues - complexity
  theorize: { complexity: 4, trueAt: 7, greatAt: 10, failStressDie: 6, failIngressionTicks: 2 },
  // v0.5 (fourth light's clue drought): an entity you move (npc.moved) also gives up this many of the
  // place's unrevealed clues, as Brindlewood hands out a clue on any successful investigation. 0 = v0.4.
  cluesFromEntities: 1,
  // Collective (Levin: stress sharing as cognitive glue)
  shareStress: true,                // guard: take half of an ally's stress until your next turn
  cohesionForSharedCone: 3,         // party sees the union of light cones at this cohesion
  sharesForReachGrowth: 2,          // "care as advancement": shared stress twice → Reach +1 (once/session)
  // Desperate positions: harder AND more rewarding (review of second-light: desperate rolls succeeded 71%)
  desperateDifficultyStep: 1,
  desperateEffectStep: 1,
  // Haunts: resting also grants Resolve, so trading a memory for respite is worth it
  restGrantsResolve: 1,
  restIsFreeAtLandmarks: true,      // v0.3: resting rides along with an action (once per scene) instead of costing the turn
  // v0.3: shared stress makes ONE fallout check (the more-stressed sharer), so sharing smooths rather than multiplies fallout
  sharedHitSingleFalloutCheck: true,
  cohesionDecayPerScene: 1,
  // v0.4: the deck. Every trait, flaw and condition is a card; a turn is one Move card plus Edges.
  // Set deck.enabled=false for the v0.3 free-form intent grammar (old sessions, A/B runs).
  deck: {
    enabled: true,
    handBase: 3,                    // hand size = handBase + Horizon: the temporal light cone is how many options you can hold
    handMin: 2,
    handMax: 7,
    edgesPerTurn: 2,                // Edge cards per action (domains, memories, drive, resolve…); flaws can lower it
    copiesPerSkill: 2,
    restRemoves: 1,                 // a haunt is a campfire: resting may also remove one card from your deck
    driveRevealAt: 3,               // the third time you play your Drive card, everyone sees what you are drawn to
    draftAtLandmarks: true,         // entering a landmark offers each entity a card
    draftOnMajorBeat: true,
    offerSize: 3,
    regretStress: 1,                // a compel still held at the end of your turn costs this much stress
  },
  // Light cone
  horizonEventWindow: 6,            // events of history an agent sees per point of Horizon
  // Content scaling (lets the Explorer tune pacing without editing scenarios)
  delveScale: 1,
  clockSizes: {},                   // e.g. { ingression: 10, attractor: 5 }
  // Pacing
  roundsPerScene: { prologue: 0, delve: 2, landmark: 1, finale: 1 },
  ingressionTicksPerScene: 1,
  audienceIngressPerScene: 1,
};

export function mergeRules(base, diff) {
  const out = JSON.parse(JSON.stringify(base));
  for (const [k, v] of Object.entries(diff ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object') out[k] = mergeRules(out[k], v);
    else out[k] = v;
  }
  return out;
}

/** How many clues a moved entity gives up: `cluesFromEntities` as a whole number ≥ 0 (true is 1; junk is 0). */
export function entityClues(rules) {
  return Math.max(0, Math.floor(Number(rules?.cluesFromEntities) || 0));
}

export function stepDie(d, steps = 1) {
  const ladder = [4, 6, 8, 10, 12];
  const i = Math.max(0, ladder.indexOf(d));
  return ladder[Math.max(0, Math.min(ladder.length - 1, i + steps))];
}

export function stepDifficulty(diff, steps = 1) {
  const i = DIFFICULTIES.indexOf(diff);
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, i + steps))];
}

export function bandOf(highest, rules = DEFAULT_RULES) {
  const b = rules.bands;
  if (highest <= b.critFail) return 'critFail';
  if (highest <= b.failMax) return 'fail';
  if (highest <= b.costMax) return 'cost';
  if (highest <= b.successMax) return 'success';
  return 'crit';
}

export const BAND_LABEL = {
  critFail: 'Critical failure',
  fail: 'Failure',
  cost: 'Success at a cost',
  success: 'Success',
  crit: 'Critical success',
};

export function positionRank(p) { return POSITIONS.indexOf(p); }
