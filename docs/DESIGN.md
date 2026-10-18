# LATENT — design notes for the first build

## 1. What the first build is

A complete vertical slice. One one-shot exercises every subsystem with the smallest content surface:

| Subsystem | First-build implementation |
|---|---|
| Engine | Deterministic, seeded. Resistance-style d10 pools, stakes declared before the roll, clocks, fact ledger, clue ledger, phase-gated secrets, light-cone visibility, memories, beats, theorize, typed event log |
| Agents | GM and players as LLM agents behind one provider interface (Anthropic, OpenAI-compatible, claude.ai `sample`, file bridge), plus scripted agents for offline and explorer runs |
| Validator | The engine corrects illegal or lenient stakes, rejects invalid intents, and refuses targets outside a light cone. An optional LLM continuity checker blocks contradicting facts from becoming canon |
| Spectator renderer | Mobile 9:16 stage. Live captions, procedural portraits, ring clocks, dice tray, stress strip, backstage overlay, ledger, clips |
| Reviewer | Structural metrics, tension/affect curves, arc-shape fit, salient-moment ranking into clips, design and narrative findings with event evidence, optional LLM judge (single and pairwise) |
| Explorer | MAP-Elites over rule variants. The behaviour descriptors and fitness come from the reviewer; mutations can optionally be proposed by an LLM (ELM-style) |

## 2. Setting and themes

Beneath the Shallows (matter) lies **the Latent**: an ordered space of forms that bodies only *point into*. Lately something is pouring through. The characters are minds that already live half in the Latent: escaped cells, an algorithm with an unchosen drive, a fork of an uploaded woman, a regenerating flatworm, a dead city's traffic router.

The game is in conversation with Michael Levin's work. It treats his ideas as *open questions to stage*, not doctrine. The fiction never settles whether the Latent is discovered, constructed or co-created. Only a theory proven in play becomes canon, and only for that session.

| Levin idea | Where it lives in play |
|---|---|
| Cognitive light cone (TAME) | Each entity has **Reach** (spatial/scale) and **Horizon** (temporal). Clocks have a scale; an agent's prompt contains only the clocks inside its Reach, and their consequences only if its Horizon is long enough. History in the prompt is windowed by Horizon. Small minds literally cannot see big threats |
| Multiscale agency; stress as cognitive glue | **Share stress**: an agent may absorb half of an ally's incoming stress. Each share adds **Cohesion**; at Cohesion 3 the party perceives the union of its light cones. Carrying another's stress twice grows Reach ("care as advancement") |
| Persuadability axis | Each entity lists the skills that can change it and the skills it resists. Matching earns +1 die; force on a mind that reasons steps difficulty up |
| Self-improvising memory | Invoking a memory gives +1 die but requires retelling it with new emphasis. The engine keeps the original and measures drift. Fallout can rewrite or erase memories. Haunts are paid for with memories (spend an experience to heal) |
| Algotypes / unexpected side-quests | Each entity has a hidden **algotype**, phrased to its agent as a disposition, never as a goal. The reviewer checks whether the drive surfaced in behaviour. The *Ingressed* fallout reveals it publicly |
| Ingression from a space of forms | The **Ingression** clock (cosmic scale) ticks every scene. *Bleed-through* fallout lends a Threshold domain at the cost of ticking it. The finale's truth is whatever the party theorized |
| Morphospace navigation, delayed gratification | Delves are goal-space terrain whose basins feel like arrival. Inquiry's beat "accept a worse position on purpose" rewards it |

## 3. Rules summary

**Rolling.** Build a pool of d10s: one base die, +1 if your skill applies, +1 if your domain matches the place, +1 for your knack (skill+domain mastery), +1 for an invoked memory, +1 if your skill matches the target's persuadability. Before the roll the GM declares **position** (controlled / risky / desperate, which sets the incoming stress die d4/d6/d8) and **effect** (limited / standard / great, which sets the outgoing die d4/d6/d8, or 1/2/3 clock ticks). The GM also pre-writes the success, cost and fail narrations. The engine sets **difficulty** from the location's tier: risky removes the highest die, dangerous the two highest. Read the highest remaining die: 1 critical failure (double stress) · 2–5 failure · 6–7 success at a cost · 8–9 success · 10 critical (outgoing die steps up).

**Resistances.** Substrate (the medium you run on), Coherence (staying one process), Memory, Boundary (where you end and the Latent begins), Reach (your light cone). Protection subtracts from each hit.

**Fallout (from Heart).** After any stress, roll a d12. If the result is at or under your total stress, fallout happens: minor on 1–6 (that resistance clears), major on 7–12 (everything clears). Fallouts per resistance include, for example, Leaking, Split, Confabulation, Erasure, Bleed-through, Ingressed, Narrowing and Cone Collapse. The third major fallout returns the entity to the Latent.

**Delves (from Heart).** A delve has a resistance pool that the party wears down with outgoing dice. If the rounds run out first, the party forces the passage: everyone takes Reach stress and the Attractor ticks.

**Beats (from Heart).** Each entity declares two beats from its calling. The GM must create openings for them; the engine validates hits. A minor beat grants Resolve (+1 die on a desperate roll). A major beat grows the light cone.

**Theorize (from Carved from Brindlewood).** With clues found, propose what is ingressing and list the clue ids it explains. The GM judges only which clues the theory genuinely accounts for. Roll 2d6 + accepted clues − complexity. On 7+ the theory is true and becomes canon; on 10+ everyone also gets +1 die. A wrong theory costs Coherence and widens the opening.

**Endings.** *Chosen* (read and answered) · *Overrun* (read, but it arrived first) · *Closed* (answered unread) · *Unread*.

## 4. Campaign shape (after Heart)

Heart's quickstart runs as a short chain of landmarks joined by delves, ending in a climactic set-piece. Each landmark has haunts (places to recover) and a want-driven NPC; each delve has a resistance pool and a handful of events. Advancement comes from beats tied to a calling. The one-shot copies that skeleton:

`Sorting Station (haven, tier 1) → Morphic Slope (delve 10, tier 2) → Garden of Unfinished Bodies (landmark, tier 2) → Proof-Stacks (delve 12, tier 3) → Library of Proofs That Want Things (landmark, tier 3) → the Aperture (finale) → Afterimage (epilogue)`

The planned campaign arc follows Heart's guidance of roughly eight linked sessions. The party descends tiers over the arc, the Ingression clock persists between sessions, and zenith beats signal the endgame. Memories carry over, so identity drift accumulates across a season.

## 5. Agents

- **GM**: a PbtA-style *agenda + principles + move list*, so its behaviour is auditable. It must name a move on every call, declare stakes before the dice, and pre-commit all branches. That last rule is a fairness device for spectators, and it gives the reviewer the branches not taken.
- **Players**: persona, voice, calling and beats, a hidden algotype disposition, and a prompt that contains only their light-cone view. They are told explicitly to be characters, not assistants: disagree, take risks, pursue beats.
- **Engine-side guards** against the documented LLM failure modes:

  | Failure mode | Guard |
  |---|---|
  | Sycophantic adjudication | Rolls are decided from structured targets, not rhetoric |
  | Lenient positions | Tier minimums raise them, with a logged flag |
  | Premature secrets | Secrets enter prompts only when their gate opens |
  | Fact drift | Ledger plus an optional continuity checker; contradicting facts are not added |
  | Hallucinated mechanics | Unknown skills, targets, clues and memories are corrected and flagged |

  Every LLM call has a scripted fallback, so a bad reply never stalls a broadcast. Fallbacks are counted against the agents in the review.

## 6. Spectator design

- One 9:16 stage that is always capture-ready; *Clean* hides operator chrome.
- Every scene follows a shorts grammar: **stake** (stakes card with a one-line "if this fails…" hook) → **turn** (dice, with dropped dice struck through) → **payoff** (narration, fallout, clock).
- Clocks, the stress strip and light-cone glyphs are always on screen, because the game frame must stay legible with the sound off.
- **Backstage** replaces actual play's documentary frame: private intents, the GM's plan, pre-committed branches, branches not taken, hidden drives, engine flags.
- **Audience ingress**: once per scene the viewers can push the Latent (a gift, the Attractor pulling harder, a forced memory). Their influence routes through the engine and is capped.

## 7. Reviewer

Three tiers, kept separate on purpose:

1. **Structural metrics from events.** These are exact: band distribution, success by position, fallout rate, delve rolls, beat fulfilment, agency (the share of actions that changed state), spotlight balance, memory drift, dead mechanics, engine flags, agent fallbacks, GM-move entropy, narration length and repetition.
2. **Curves.** Tension combines threat-clock fill, stress load and live stakes, with a Dramatis-style escape-routes term. Affect is lexicon valence blended with mechanical valence. The affect curve is fit to Reagan et al.'s six arc shapes.
3. **LLM judge.** Optional and noisy. Used comparatively (`judgePair` runs both orders and reports whether the judge agreed with itself).

**Clips** are ranked from events, not text: magnitude × (1 + tension swing) × (1 + affect swing), capped at two per scene. Each clip carries the hook, roll, payoff, reasons and an estimated length. **Findings** are typed (success / warning / failure / info) and grouped into game, narrative and agents, and each links to event indices. Output: `*.review.md` for humans, `*.review.json` (with descriptors and fitness) for machines.

## 8. Explorer

The genome is a rule diff plus a scripted-agent play-style. Each genome is evaluated on 3 seeds with scripted agents, which takes milliseconds. The archive is keyed by two reviewer descriptors (default: success rate × memories lost per entity); each cell keeps its best variant. Fitness rewards beat fulfilment, tension variance, a late climax, agency, mechanic coverage, healthy difficulty and fallout bands, and strong clips. It penalises spotlight imbalance and repetition. `--llm config.json --llm-every 10` has an LLM propose rule changes from an elite's findings.

**Caveat:** scripted agents measure the *mechanics*, not the fiction. Re-run promising elites with LLM agents and compare them pairwise before adopting a rule change.

## 9. First iteration (review → fix → re-run)

| | first-light | second-light |
|---|---|---|
| Talk-only turns | 16 | 0 |
| Agency | 58% | 95% |
| Engine intent flags | 17 | 0 |
| Rolls | 9 | 19 |
| Theory | failed (0 clues) | canon (c1, c5) |
| Ending | unread | chosen |
| Dead mechanics | haunts, memory loss | haunts, memory loss, stress sharing, persuasion |

The first session's review traced almost every failure to one engine bug: agents copied whole menu lines into `target`. The fix was a tolerant parser plus a `{target, what}` menu. The second session's review opens the next iteration:

- Four mechanics are never chosen. They need stronger surfacing in prompts, or cutting.
- Desperate rolls succeed 71% of the time, so the tier minimums or the desperate difficulty may need raising.
- Fitness fell from 4.29 to 3.97, entirely because of the dead-mechanic penalty. Read the composite next to the findings, not on its own.

### Iteration 2 → v0.2 (from second-light's review)

**Diagnosis**
- Agents could not see what moved each entity.
- Stress sharing only fired if the sharer was hurt on that same action.
- Resting was never worth a memory.
- Position changed only the stress die, not the odds.

**Changes**
- Each entity's persuadability is shown in the target menu.
- A persistent **guard** move: take half of an ally's stress until your next turn.
- Desperate drops one more die but pays one effect step more.
- Resting grants Resolve.
- The reviewer now separates *choices* nobody made (failures) from *consequences* that didn't occur (variance).

### Iteration 3 → v0.3 (from third-light's review)

| | first | second | third (v0.2) |
|---|---|---|---|
| Talk-only turns | 16 | 0 | 0 |
| Agency | 58% | 95% | 100% |
| Desperate success | 50% (n=2) | 71% (n=7) | 29% (n=7) |
| Guards / stress shared | 0 / 1 | 0 / 0 | 19 / 16 |
| Acts on entities | 3 | 3 | 6 |
| Fallouts (major) | 2 (0) | 4 (0) | 19 (2) |
| Dead choices | haunts, guard, clues | haunts, guard | haunts |
| Ending | unread | chosen | unread |

v0.2 worked: desperate felt desperate, guarding and persuasion got used. It also overcorrected:
- A shared hit rolled fallout for *both* entities, so sharing multiplied fallout. That is the opposite of stress as glue.
- Cohesion never decayed (it reached 16).
- Haunts still cost a whole turn.

**v0.3 changes**
- A shared hit makes one fallout check, rolled by the more-stressed sharer.
- Cohesion decays by 1 per scene.
- At landmarks, resting is a free add-on to an action, once per scene.

Measured over 40 scripted seeds with heavy guarding:

| | v0.2 rules | v0.3 rules |
|---|---|---|
| Fallout per roll | 0.68 | 0.54 |
| Peak cohesion | 10.8 | 8.3 |
| Rests per session | 0.1 | 1.4 |

**Explorer candidate.** The top MAP-Elites cells on v0.3 share one pattern: risky stress d4, landmarks two rounds, delves one round, delveScale 0.8, Attractor 8. It reaches ~28% fallout with no dead mechanics. It is saved as `config/rules/v0.3-candidate.json` and is **not** the default until an LLM A/B confirms it:

```bash
node cli/run.js --config <cfg> --rules config/rules/v0.3-candidate.json --review
node cli/compare.js sessions/a.review.json sessions/b.review.json
```

**Seat-agent discipline.** In three of the bridge playtests, a Haiku seat made one stray read-only tool call outside its instructions: a browser-tab check, device info, and a granted-apps listing. Nothing changed, but long-running seat agents should get an explicit tool allowlist, not just instructions.

## 10. Known limits and next steps

- Bridge seats keep their own conversation history, so a player agent may remember further back than its Horizon allows. API-driven seats are stateless per call and do respect it.
- The forked-voice fallout (*Split*) is tracked but does not yet spawn a second agent instance. The design calls for one, with divergence tracked in the ledger.
- No voice or TTS yet. The event log already carries everything a TTS track or an auto-editor needs.
- Next content: two more one-shots (a Swarm city; an obsolete-platform Ruin) and the campaign layer (persistent Ingression, tiers, zeniths).
- Calibrate the reviewer against human ratings of a holdout set of sessions, and track judge drift over time.
