# LATENT — design notes for the first build

## 1. What the first build is

A complete vertical slice. One one-shot exercises every subsystem with the smallest content surface:

| Subsystem | First-build implementation |
|---|---|
| Engine | Deterministic, seeded. Resistance-style d10 pools, stakes declared before the roll, clocks, fact ledger, clue ledger, phase-gated secrets, light-cone visibility, memories, beats, theorize, typed event log. Since v0.4, each entity's sheet is also a deck of cards (§10) |
| Agents | GM and players as LLM agents behind one provider interface (Anthropic, OpenAI-compatible, claude.ai `sample`, file bridge), plus scripted agents for offline and explorer runs. A seat can also be a person, in the browser or the terminal (§10) |
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

**Rolling.** Build a pool of d10s: one base die, +1 if your skill applies, +1 if your domain matches the place, +1 for your knack (skill+domain mastery), +1 for an invoked memory, +1 if your skill matches the target's persuadability. (Since v0.4 the same dice come from cards you play; see §10.) Before the roll the GM declares **position** (controlled / risky / desperate, which sets the incoming stress die d4/d6/d8) and **effect** (limited / standard / great, which sets the outgoing die d4/d6/d8, or 1/2/3 clock ticks). The GM also pre-writes the success, cost and fail narrations. The engine sets **difficulty** from the location's tier: risky removes the highest die, dangerous the two highest. Read the highest remaining die: 1 critical failure (double stress) · 2–5 failure · 6–7 success at a cost · 8–9 success · 10 critical (outgoing die steps up).

**Resistances.** Substrate (the medium you run on), Coherence (staying one process), Memory, Boundary (where you end and the Latent begins), Reach (your light cone). Protection subtracts from each hit.

**Fallout (from Heart).** After any stress, roll a d12. If the result is at or under your total stress, fallout happens: minor on 1–6 (that resistance clears), major on 7–12 (everything clears). Fallouts per resistance include, for example, Leaking, Split, Confabulation, Erasure, Bleed-through, Ingressed, Narrowing and Cone Collapse. The third major fallout returns the entity to the Latent.

**Delves (from Heart).** A delve has a resistance pool that the party wears down with outgoing dice. If the rounds run out first, the party forces the passage: everyone takes Reach stress and the Attractor ticks.

**Beats (from Heart).** Each entity declares two beats from its calling. The GM must create openings for them; the engine validates hits. A minor beat grants Resolve (+1 die on a desperate roll). A major beat grows the light cone.

**Theorize (from Carved from Brindlewood).** Clues come from searching a landmark and, since v0.5, from any entity you move there (§11). With clues found, propose what is ingressing and list the clue ids it explains. The GM judges only which clues the theory genuinely accounts for. Roll 2d6 + accepted clues − complexity. On 7+ the theory is true and becomes canon; on 10+ everyone also gets +1 die. A wrong theory costs Coherence and widens the opening.

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
- **Cards look like cards.** Every card — the stage's hand strip, the overlays, the seat's hand, the beats and the fallout memories — is drawn at playing-card proportions (5:7) with a **pip** in the top-left corner, the bonus top-right, a faint watermark of the same pip on the face and the pip repeated upside-down bottom-right. The pip is one glyph per card *type* (skill, knack, domain, memory, drive, flaw, calling, guard, resolve, gift, insight, condition, compel, gap, voice) in `viewer/sigils.js`; colour still comes from `--kc`, i.e. from how the card *plays* (Move/Guard teal, Edge amber, inner life violet, what is done to you coral). Type and kind are therefore readable at the same time, and a card is recognisable in the stage strip at 45px wide, where its name alone was not. The ratio is a floor, not a cap: a long memory grows its card rather than clipping its text, and grids align to the top so one long card does not stretch its row.
- **Phone portrait** (the stage is ~358px wide there): the scene title takes its own line under the brand instead of being crushed to one letter by the tier and *your turn* chips; the caption fades out where it is cut by the hand instead of being sliced through a line of type; the seat's hand keeps two cards per row down to 320px, because one full-width card at this ratio is a poster, not a card.
- **Short stages.** The stage is a fixed 9:16 box, so the focus column can want more height than it has — on a small phone, and more often inside a short artifact pane. It used to spill its top over the clocks and the brand (stakes text printed across the scene title). Three rules, in order of how much they do:
  1. **What scrolls gives up height first.** `.focus` children are `flex-shrink: 0` by default; the caption, the portrait and the overlay are not. So when the column is over-full, those three shrink — each one scrollable and faded at its cut — before anything is pushed out of the box. This is what keeps the speaker's name on screen: it has no flex of its own, so it is never the thing squeezed. Verified over 58 replay states at each of nine sizes, pages and artifact-sized iframes from 320×568 to 1280×900: the name is inside the focus in every one, and no stage child leaves the stage.
  2. **Ceilings, so one element cannot dominate.** A tall overlay is capped against the focus — 54% of it, 46% on a narrow phone, 72% on a very short stage. This bites on an ordinary phone too, not only on short stages: a long memory rewrite scrolls inside its card rather than filling the stage.
  3. **Fades, so a cut never reads as a bug.** The focus is bottom-aligned, so anything that still does not fit is faded at its top edge rather than sliced through a line; where the content fits, that fade falls on empty space. The overlay and the caption fade at their own bottoms the same way.
  Below 380px the chrome is tightened (HUD, clocks, focus and hand padding) to buy height back. A stage shorter than 620px drops the portrait sigil while an overlay is up, since the name below it carries the same information; shorter than 470px it also narrows the clocks and the hand strip, hides the speaker's role line, and trims the overlay's and caption's bottom padding to 10px with their fades shrunk to 8px — height is scarcer there than the fade is worth. Both are `@container stage` queries on the stage's own height — not the window's, which an iframe makes meaningless. Measured on a 320×568 stage: before any of this, the speaker's name sat 29px *above* the stage's top edge.
  - *Kept, with its cost:* on a 320×568 stage, or a 440×520 pane, the overlay is down to a line or two, scrollable with the scrollbar hidden, so only the fade says there is more. The room would have to come from the speaker's name or the party strip, and both carry more at a glance than a third line of stakes.

  - *Kept:* a card header wraps when it does not fit on one line (`.ck-top { flex-wrap: wrap }`), so the reward drops to a second line rather than escaping the card — cards stopped clipping when they took `aspect-ratio`, and a nowrap bonus ran 16.5px past the edge at 320px. The cost is 18px of header on the intro beat cards below 390px, with the reward left-aligned under its label; measured across the hand, intro and fallout cards at 320, 360, 390 and 1280px, nothing else wraps and no card's content leaves it.
  - *Kept:* the focus's mask makes it a backdrop root, so the overlay's `backdrop-filter` blurs the focus's own content instead of the field behind it. Rendered both ways at 390×844, the panel is indistinguishable — it is 88% opaque, so the blur was never carrying the look.
  - *Kept:* the caption's and the overlay's fade masks are unconditional. Each element's bottom padding is at least its fade, so content that fits is not faded, and a JS overflow toggle would buy nothing. That invariant has to hold in every variant: a `padding` shorthand after the `padding-bottom` once quietly cut the overlay's to 10px under a 14px fade, and on a very short stage the fade shrinks to 8px rather than the padding growing, because height there is scarcer than the fade is worth.

## 7. Reviewer

Three tiers, kept separate on purpose:

1. **Structural metrics from events.** These are exact: band distribution, success by position, fallout rate, delve rolls, beat fulfilment, agency (the share of actions that changed state), spotlight balance, memory drift, dead mechanics, engine flags, agent fallbacks, GM-move entropy, narration length and repetition.
2. **Curves.** Tension combines threat-clock fill, stress load and live stakes, with a Dramatis-style escape-routes term. Affect is lexicon valence blended with mechanical valence. The affect curve is fit to Reagan et al.'s six arc shapes.
3. **LLM judge.** Optional and noisy. Used comparatively (`judgePair` runs both orders and reports whether the judge agreed with itself). The judge reads the `describeEvent` transcript. Past 220 lines it keeps the opening and the last 40 lines, with one marker line between them, so the ending, final narration and epilogues are never cut. A mock session runs about 220–275 lines, and the ending often fell past the old head-only cut.

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

## 10. v0.4: the deck, and a seat for a person

The request was a human seat with a deckbuilder interface, where a character's abilities, predispositions, flaws, impairments and conditions show up in the deck. The deck could have been a human-only skin over the intent grammar. It became a rule for every seat instead, for four reasons:

- **One interface for every seat.** A person, an LLM and a scripted agent play under the same constraints. A human is never playing a different game from the agents at the table.
- **Legibility.** The game is spectator-first. A hand on screen shows what the entity *could* have done next to what it did. Every modifier becomes a visible object instead of a number in a prompt.
- **Choice surfacing.** Reviews kept finding dead mechanics that agents never chose (haunts, guarding, persuasion). A card in hand is the strongest prompt there is. A deck turns "remember that you can…" into "you are holding…".
- **What happens to you stays with you.** Conditions used to be permanent −1s hidden in the sheet. As cards, they clog the hand. A haunt sets them down. Drafts let the entity grow into the place it walks through.

### What becomes a card

| Sheet element | Card | How it plays |
|---|---|---|
| Skill (×2 copies) | **Move** | One per action; sets the skill; +1 die on any target |
| Knack | **Move · knack** (replaces one copy) | +2 dice (skill + mastery) |
| Domain | **Edge** | +1 die only where the place has that domain (Threshold anywhere) |
| Memory | **Edge** | +1 die; must be retold (drift measured as before); once per scene |
| Hidden algotype (predisposition) | **Drive** (Edge) | +1 die; the act must lean the way you lean. The text the player sees is the disposition. The third play reveals the drive to everyone |
| Calling (predisposition) | **Signature Edge**: Chorus (kinship, +1 on allies and entities), Look Again (inquiry, +1 and one more clue), Hold Shape (continuity, −2 incoming stress), Borrowed Door (ingress, +2 dice, Ingression +1) | Also offered in drafts. Kinship decks carry two Guards |
| Innate **flaw** (new content, one per entity) | **Flaw** (double-edged) | Held: a penalty (e.g. *Too Many Mouths*: −1 die on Conceal and Evade; *Not the Original*: memories give +0; *Two Heads Disagree*: one fewer Edge). Played with the right Move: +1 die. Cannot be removed |
| Guard | **Guard** (free) | Required to guard. Guarding is now an event, not a habit (v0.2 had 19 a session) |
| Condition fallout (Leaking, Static, Misfire, Resleeved) | **Status** (unplayable) | −1 die on its skills *while held*; it takes a hand slot. Set it down at a haunt and the condition heals |
| Compel fallout (Looping) | **Compel** (free) | Play it with your last Move to discard it; still held at the end of your turn: 1 Coherence stress |
| Erasure | memory card leaves, **Gap** arrives | Unplayable, "the shape of where m2 used to be" |
| Split | **Second Voice** (Edge) | +1 die and 1 Coherence stress: the other voice sometimes helps |
| Bleed-through, Ingressed | **Threshold (lent)** | A borrowed domain that works anywhere |
| Unanchored (lose a domain) | that domain's cards leave the deck | |
| Minor beat, rest at a haunt | **Resolve** (Edge, one use) | Replaces the auto-spent Resolve counter: you choose when |
| Audience gift, a theory proved *great* | **Gift of the Latent**, **Insight** (one use, top of the draw pile) | Replace the invisible pending bonus |

### The turn, and the shape of a session

- **Draw.** At the start of a turn, draw up to **hand size = 3 + Horizon**. This is the Levin mapping: the temporal light cone is how many options a mind can hold at once. SORT/7 (Horizon 3) holds six cards and the Choir holds four. *Narrowing* shrinks the hand; a major beat grows it. Reach still decides what you can see and target.
- **Play.** One Move (or improvise: any skill, base die only), up to `edgesPerTurn` (2) Edges, plus free Guard and Compel cards. Held flaws and conditions apply their penalties. The engine resolves cards tolerantly: by id or name, and the legacy fields `skill`, `domain`, `memory` and `guard` pull the matching card from the hand. Every invalid play is corrected and flagged, as before, including cards played on an action that rolls nothing.
- **Discard.** Unplayed cards go to the discard pile and the deck reshuffles when the draw pile runs out (Slay the Spire's rhythm). Stakes, dice, fallout and clocks are unchanged.
- **The map.** Heart's campaign shape already reads like a deckbuilder run. Delves are the fights. Landmarks are where minds pick things up: entering one offers each entity a **draft** (one of its calling, one of the place's domain, one skill the place's entity is moved by), and so does a major beat. Haunts are **campfires**: the free rest also lets you **set down one card** (not your flaw, drive or memories). That gives haunts a use that is not only about stress, and they had been the most persistently dead mechanic since first light.

`deck.enabled: false` keeps the v0.3 grammar. In that mode the engine reproduces v0.3's event streams exactly: 24 of 24 scripted sessions match event for event, apart from the rules header in `session.start`. Use it for old sessions and A/B runs. Since v0.5, also set `cluesFromEntities: 0`; the tests pin both v0.3's and v0.4's streams.

### A seat for a person

- **Browser** (Run live → *You play*). Your turn opens a table beside the stage: your hand as cards (domains say whether they help *here*; your Drive shows your inclination; held flaws and conditions show their bite), the target menu, follow-ups only when needed (a retelling with live drift, a guard target, a free rest with a card to set down, theorize), and a live dice preview from a side-effect-free `engine.previewAction`. Intro, fallout and epilogue are cards too. The stage keeps playing for the audience and the seat says how many beats you are behind. The other seats can be scripted or Claude.
- **Terminal**: `node cli/play.js --seat ilse2` plays the same requests as numbered cards. Empty input always means a sensible default, so a pipe of blank lines plays a whole session.
- Under the hood, `HumanPlayer` (src/agents/human.js) is just another player behind a `ui.request()` adapter. Human decisions are logged as `agent.call` with `human: true`. They are excluded from LLM call counts and budgets, and a budget cut-off never takes a person's seat.

### Measured (40 scripted seeds, two casts, default policy)

| | v0.3 rules (`deck.enabled: false`) | v0.4 deck |
|---|---|---|
| Mean dice pool | 2.98 | 3.13 |
| Any-success | 49% | 51% |
| Fallout per roll | 0.54 | 0.48 |
| Major fallouts / session | 2.83 | 2.48 |
| Theory became canon | 35% | 55% |
| Memory invocations / session | 8.2 | 4.8 |
| Guards / session | 9.4 | 2.9 |
| Improvised (no Move in hand) | — | 11% |
| Edges per roll | — | 1.06 |
| Drafts taken / session | — | 7.9 |
| Cards set down at haunts / session | — | 0.65 |
| Fitness (reviewer composite) | 3.86 | 3.93 |

Difficulty barely moved, which was the intent: the deck changes *which* options are available, not how hard the dice are. Memories and guards became rarer and more deliberate. Theories land more often, because Look Again and Insight feed the clue ledger, though by how much depends on the seeds: +20 points on these seeds, +5 on an independent reviewer's 40. Treat it as a direction, not a size. The reviewer gained deck metrics, findings (hand fit, clogged hands, drafts, haunt removals, unused cards) and three deck-only choices (drafting, playing your Drive, playing your flaw). Legacy reviews are unchanged: the same fitness, findings and markdown, with one added `metrics.deck: null` field in the JSON.

**Prompt check.** Before the playtest, eight act prompts captured at varied deck states were answered by a Haiku agent. All eight validated with zero engine issues. Its two confusions went back into the prompt: a Move gets its die on any target, and the cards you could set down at a haunt are now listed by id.

### Fourth light (LLM playtest on the deck)

Same cast, models and harness as third light: a Sonnet GM and three Haiku players on the file bridge, 73 calls. Third light ran v0.2, so this comparison spans both v0.3's fixes and the deck. No LLM session was played on v0.3 alone.

| | third (v0.2) | fourth (v0.4 deck) |
|---|---|---|
| Any-success | 50% | 67% |
| Fallouts (major) | 19 (2) | 9 (2) |
| Beats hit | 2/6 | 4/6 |
| Guards / stress shared | 19 / 16 | 7 / 2 |
| Memory invocations | 25 | 10 |
| Rests at haunts | 0 | 1 (and one card set down) |
| Improvised rolls | — | 8% |
| Edges per roll | — | 1.38 |
| Drafts taken | — | 8 of 8 |
| Flaws played / Drive cards played | — | 5 / 8 |
| Hidden drives surfaced | 1 of 3 | 3 of 3 (Ilse-2's revealed by her third Drive) |
| Dead choices | haunts | none |
| Engine intent flags | 0 | 4 |
| Ending | unread | closed |
| Fitness | 3.55 | 4.38 |

What the deck did:
- **Players used it as intended.** They read it: knack before plain Moves, domains only where they help, flaws played with the Moves that turn them into strengths (*Too Many Mouths* with Signal, *Not the Original* with Evade and Conceal), Drives when the act leaned their way.
- **Stress stopped multiplying.** Fallout fell back to a healthy 38% of rolls. Most of that is v0.3's single fallout check for a shared hit, which the scripted measurement above already showed. The deck adds to it: a Guard needs a Guard card, so guarding became deliberate (7 guards, down from 19).
- **The hidden drives showed.** All three surfaced, and the Drive card made the reviewer's evidence direct rather than inferred from keywords.

What it exposed:
- **Conditional cards were misplayed.** All four intent flags were cards played outside their condition: Look Again on a delve (twice), Chorus on a delve, Looping with the wrong Move. The engine dropped them correctly, but the prompt now states each card's condition as a field (`only_if_target`, `only_with_move`, `discard_only_with_move`) instead of prose.
- **Clue drought, not caused by the deck.** Third light found 1 clue and fourth light found none. Players search rarely: 1 of 6 actions at the two landmarks, plus 1 in the finale, and both rolls failed. A third search was made in a delve, where nothing can be found. So the finale theory has nothing to stand on. This is the next iteration's diagnosis: let entities that are moved (`npc.moved`) yield the landmark's next clue, as Brindlewood hands clues out on any successful investigation. Also refuse `clue` in delves instead of spending a roll on it. Both are done in v0.5 (§11).

**Seat discipline again.** Two of the three Haiku seats each made one stray call to a messaging tool despite a two-command allowlist written into their instructions. One failed on a missing argument and the other was denied by the permission layer; neither had any effect. This is the third playtest with this pattern. Seat agents need a tool allowlist enforced by the harness, not only by their prompt.

### Design calls, reviewed

An independent review of the deck raised a set of open design calls. Each was weighed against the deck's purpose (one interface for every seat, legible play, surfaced choices, consequences that stay), with data where data could decide.

**Changed**

- **A card set down at a haunt is gone before the dice.** It used to be removed during the action but still counted as held, so a Leaking card set down at the free rest still cost −1 on that roll. The free rest already clears stress before the roll; setting a card down is part of the same rest, so it now takes effect at the same moment. "Set it down" means what a player expects, and the preview shows the extra die.
- **The sheet follows the deck.** Drafted skills and domains never reached the sheet, so the GM and the LLM players were shown a sheet that disagreed with the hand, and *Unanchored* could never take a drafted domain. In deck mode, a skill or domain now joins the sheet with its first card and leaves with its last. *Unanchored* ("you lose the thread of your own purpose") removes the last domain on the sheet, which is now the most recently acquired one: the shallowest root goes first.
- **Unanswered offers are recorded as unanswered.** See *Kept* for the rule itself. What changed is the record: leaving `draft` out of a reply is flagged and logged as `answer: "unanswered"`, separately from an explicit `null` (`declined`). The reviewer reports the two apart, because "agents decline drafts" is a design signal and "agents ignore the offer" is a prompt bug.
- **The prompt states the exceptions.** It now says that playing a slot-costing flaw (Two Heads) gives its slot back, that a memory is muted while Ilse-2 holds her flaw, and that a memory card already used this scene cannot be invoked again (that message used to say "needs a retelling", which was misleading). Hand size is no longer written as "3 + Horizon" where a rule variant could make it wrong.
- **Compel stress is measured as paid.** The reviewer used to count compels held at the end of a turn as "regret stress". It now reports compels held and the stress actually paid separately (see *SORT/7 and Looping* below for why they differ).

**Kept**

- **A knack gives +2 dice wherever it is played.** v0.3 nominally required the knack's domain for the mastery die, but it only checked that the agent *named* the domain, never that the place had it. Any agent that named its domain got mastery. Requiring presence would count the place twice, since domain cards already pay only where the place has them. It would also erase most of what makes a knack a knack: over 40 scripted seeds a played knack's domain was present only 36% of the time (48 of 135 plays). Lattice Ghost's Ruin appears nowhere in the Aperture, so its knack would never fire. The maximum is unchanged: a knack plus its domain card where present equals v0.3's skill + domain + mastery.
- **Your next action answers the offer.** A card, or `null` to walk on; leaving it out also walks on. An offer that waited for an answer would pile up behind the queue and re-prompt every turn. The engine never picks for you, because declining is a real deckbuilding choice: a lean deck draws its best cards more often. In practice every seat answers. Fourth light took 8 of 8 offers, and the scripted, browser and terminal seats always send an explicit answer.
- **Fallout can lend a domain you already have.** *Bleed-through* and *Ingressed* add a lent Threshold card even to the Regent, who has Threshold. In v0.3 a domain was a set member, so a second Threshold gave nothing but the Ingression tick. In a deck, copies stack: more Threshold means drawing the Latent's help more often, which is exactly the gift-with-a-price the fallout describes.
- ***Unanchored* removes every card of the lost domain**, lent and innate alike. Losing a domain means losing it, and the sheet and deck stay in agreement.
- **SORT/7 and Looping.** SORT/7's Coherence protection (1) absorbs Looping's end-of-turn cost (1), so the compel only clogs its hand. That is still a cost: it takes a hand slot. v0.3 compels had no mechanical cost at all, and a process that holds together shrugging off a loop is in character. Worth revisiting if compels multiply.
- **An edge cut by the limit cannot free a memory for the free rest.** The rest is validated before the edge limit trims the play, so if a memory card is cut, a free rest that would spend that same memory has already been refused. It is rare (it needs a full edge budget plus a rest on the invoked memory), the engine flags it, and fixing it would need two validation passes. Not worth the complexity yet.
- **`rules.id` is `latent-0.4` even with the deck off**, and exported characters gain `flaw` and `deck: null`. The id names the code's rule set, while a variant is the rule diff that every session stores in full (`deck.enabled: false` is right there). The compatibility contract is the event log, and with the deck off (and, since v0.5, `cluesFromEntities: 0`) it still matches v0.3 exactly (24 of 24 scripted sessions, apart from the rules header).

## 11. v0.5: clues from entities

### Diagnosis

The finale turns on one roll: 2d6 + accepted clues − 4, true on 7+. Its odds by clue count:

| Clues | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| Theory true | 8% | 17% | 28% | 42% | 58% | 72% |

Both LLM playtests on the current harness reached the finale with almost nothing: third light with 1 clue, fourth light with none. Players do not search much. At the landmarks and the finale, third light searched 2 times in 12 actions and fourth light 2 in 10. Scripted agents search on about 55% of landmark turns, which is why the scripted numbers never showed the drought. What LLM players do instead is act on entities (6 and 4 times) and on clocks. Fourth light also spent a roll searching a delve, where nothing can be found.

### Changes

- **Moved entities give up clues** (`cluesFromEntities`, default 1). When an act on an entity succeeds, including success at a cost, the engine also reveals that place's next unrevealed clue seed. This follows Carved from Brindlewood, where any successful investigation yields a clue. The rule follows play, not the menu: reading a mind is investigation too. The GM gets the seed and words it as what the entity lets slip, and the clue records its source (`npc:gardener`). While a place still hides clues, each of its entities' target-menu line says *"Moving it also gives up one of this place's clues"* (or the real count, if the rule gives more). The browser, terminal and LLM seats all show this. The rule is a count (`0` is v0.4), and the explorer can vary it over 0–2. Any other value is read as a whole number of at least 0, so `true` means 1 and junk means 0.
- **No searching in delves.** A `clue` target in a delve is refused with an intent issue. The action becomes talk and the cards stay in hand. The target menu already left the option out.
- **Counterfactual.** Fourth light moved entities three times at landmarks that still had clues, and third light twice. Under v0.5 that would have meant 3 and 3 clues at the finale, about a 42% theory each instead of 8% and 17%.
- With `cluesFromEntities: 0` the event streams are unchanged: v0.3's with `deck.enabled: false` and v0.4's with the deck. Tests pin both on two casts.

### Measured (40 scripted seeds, two casts, default policy)

`node cli/measure.js --rules '{"deck":{"enabled":false},"cluesFromEntities":0}' --rules '{"deck":{"enabled":false}}' --rules '{"cluesFromEntities":0}' --rules '{}'`

Seeds `measure-0…39` alternate between two casts: Choir + SORT/7 + Ilse-2, and Regent + Lattice Ghost + SORT/7. On the code §10 measured, the harness reproduced §10's canon rates exactly (35% and 55%). The v0.4 design calls (§10, *Design calls, reviewed*) have since moved the deck's rate to 53%. Other rows differ a little from §10's table because the seeds differ.

| | v0.3 grammar, rule off | v0.3 grammar, rule on | v0.4 deck (rule off) | **v0.5** (deck, rule on) |
|---|---|---|---|---|
| Theory became canon | 35% | 68% | 53% | **80%** |
| Sessions with a theory proposed | 35% | 70% | 53% | 85% |
| Clues / session | 2.05 | 2.90 | 2.63 | 3.55 |
| … from entities | — | 0.88 | — | 0.95 |
| Searches / session | 2.85 | 2.75 | 2.95 | 2.75 |
| Clues accepted / theorize roll | 2.66 | 2.75 | 3.00 | 3.06 |
| Ending: chosen | 8% | 20% | 3% | 8% |
| Ending: closed | 20% | 13% | 3% | 3% |
| Ending: overrun | 28% | 48% | 50% | 73% |
| Ending: unread | 45% | 20% | 45% | 18% |
| Any-success | 51% | 51% | 51% | 52% |
| Fallout per roll | 0.50 | 0.51 | 0.51 | 0.53 |
| Fitness | 4.01 | 4.04 | 3.97 | 3.97 |

The 40-seed rates move a few points between seed sets. Over 400 seeds on the deck, the rule raises canon from 50% to 73%, and to 82% with `cluesFromEntities: 2`. Clues per session go from 2.43 to 3.21 (3.80 with 2).

What this shows:
- **The rule only adds clues.** Dice, stress and fallout are unchanged; searches barely move (2.95 → 2.75); and entities add about one clue per session.
- **Scripted players overstate the canon rate.** They retry a failed theory in the finale until one lands (2.5 theorize rolls per session on v0.5), and their GM accepts 85% of claimed clues. Read the canon row as a ceiling for how often a theory can land, not a forecast for LLM tables.
- **The theory now lands; answering the Aperture is the next gap.** The rule mostly turns *unread* into *overrun*, and *chosen* rises only a little: the party reads the pattern but does not answer it first. In 96% of overrun sessions the Ingression clock filled while the Aperture clock stood at about 1.6 of 6. Each wrong theory ticks Ingression by 2, so more theorizing also fills it faster. This was already the main loss before the rule (45% overrun over 400 seeds), and it is the next thing to tune: the Aperture's size, the finale's rounds, or a smaller Ingression tick for a wrong theory.

### Review decisions

An independent review of v0.5 (AGENTS.md) found three issues and raised three design concerns.

**Changed**
- **The DESIGN numbers above were stale.** They had been measured before the v0.4 design calls were merged in. They are re-measured on the merged code.
- **`cluesFromEntities` is normalised.** `-1` used to reveal all but one of a place's clues (`slice(0, -1)`). One helper, `entityClues(rules)`, now reads the rule for the engine, the runner and the menu, and only whole numbers of at least 0 count.
- **The menu hint states the real count**: "one", or the number the rule gives, capped by the clues still hidden.

**Kept**
- **Refusing a delve search is not behind a rule.** It is input validation, like refusing a `delve` target outside a delve, not a change to the rules. It only affects an agent that names a target the menu never offered, and that agent would otherwise spend a roll on a guaranteed "nothing here". Scripted agents never do it (0 refusals in 450 sessions), so the parity pins still hold. With `cluesFromEntities: 0`, LLM or human sessions differ from v0.3 only where v0.3 wasted a roll.
- **Only the first clue in a batch gets the GM's wording.** A crit search, Look Again, or `cluesFromEntities: 2` reveals more than one clue, but the GM writes a single `clue_text`, and the rest keep their seed text. This is how searches have always worked, and it keeps the GM's reply short. The seed's meaning, which is what a theory cites, is never lost.
- **A memory retold on a refused search is still spent.** The refusal turns the action into talk, and a retelling is a valid talk action: the memory is invoked and drift is recorded. Move and Edge cards that need a roll stay in hand. The notice for them no longer says "target none", which contradicted the refusal just before it (second review).
- **The transcript line for a clue does not name its source.** `describeEvent` keeps rendering `clue.found` as `Clue c3: …`. The source stays in the event (`source: "npc:gardener"`) for the reviewer and the viewer, and the GM already words the clue in the entity's voice. Adding the name would lengthen every prompt's recent history for a fact the text already shows (final review).
- **An entity gives a clue every time it is moved, while clues remain.** It is a source of what the place knows, not a once-only reward. Fourth light moved the Gardener twice, and the counterfactual above counts both.

### Fifth light (LLM playtest on v0.5)

Same cast, models and harness as fourth light: a Sonnet GM and three Haiku players on the file bridge, 56 calls, no fallbacks. `node cli/compare.js sessions/fourth-light.review.json sessions/fifth-light.review.json`:

| | fourth (v0.4) | fifth (v0.5) |
|---|---|---|
| Clues found (from entities) | 0 (0) | 8 (3) |
| Searches at landmarks and the finale | 2 of 10 actions | 3 of 12 |
| Acts on entities | 4 | 4 |
| Theory | false (0 clues, 2d6=7, total 3) | false with 3 accepted at the Library, then **great** with 4 at the Aperture (2d6=10, total 10) |
| Ending | closed | overrun |
| Any-success | 67% | 72% |
| Fallouts (major) | 9 (2) | 2 (1) |
| Beats hit | 4/6 | 2/6 |
| Engine intent flags | 4 | 0 |
| Fitness | 4.38 | 3.74 |

What it shows:
- **The drought is over.** Play looked much like fourth light: players searched about as rarely (3 of 12) and acted on entities as often (4). But every entity they moved gave something up: the Gardener, the Prime and the Pattern each yielded a clue, worded in the entity's voice ("I finished one, once. It woke with two heads, and wept for the one it had been."). With the searches, the party had 7 clues by the Library and 8 at the finale. The theory had a real chance: one miss at 3 accepted clues, then a *great* result.
- **No wasted delve searches**, and no intent flags at all. The card-condition fields from fourth light also held.
- **The ending shows the next gap, exactly as the scripted runs predicted.** The Ingression clock ticked once per scene (5), once on a failed roll, and by 2 for the wrong theory at the Library. It completed as the finale opened. The Aperture clock never moved, so the party read the pattern but could not answer it: *overrun*.
- **Fitness fell, for reasons this rule does not touch.** Fallout was low (2 in 18 rolls, against a 28% target), beats were 2/6, and the Choir hit none. This is one session, and the GM was more lenient with stress than fourth light's. Read it alongside the 40-seed numbers, where fitness is flat.

**Seat discipline.** One Haiku seat again made one stray call to a messaging tool (an empty `send_message`, which failed and changed nothing), despite a two-command allowlist in its instructions. That makes four playtests in a row with this pattern.

## 12. Known limits and next steps

- Bridge seats keep their own conversation history, so a player agent may remember further back than its Horizon allows. API-driven seats are stateless per call and do respect it.
- The forked-voice fallout (*Split*) now adds a Second Voice card, but it still does not spawn a second agent instance. The design calls for one, with divergence tracked in the ledger.
- The deck's numbers (hand base 3, two Edges, two copies per skill, offer size 3) were tuned on scripted agents only. The explorer now searches `deck.handBase` and `deck.edgesPerTurn`. Fitness has no deck-specific term yet; an improvised-share or clogged-hand penalty is a natural next step.
- The clue drought (§10, fourth light) is addressed by v0.5 (§11). The finale's next gap is the race between answering the Aperture and the Ingression clock. In scripted play, most theories that land still end *overrun*. Fifth light's Ingression filled as the finale opened, before anyone could act on the Aperture. Candidates: a smaller Ingression tick for a wrong theory, no per-scene tick in the finale, or an Aperture that starts partly filled when a theory is canon.
- A person at the table plays at human speed. The browser seat waits indefinitely, while the file bridge times out after 30 minutes.
- No voice or TTS yet. The event log already carries everything a TTS track or an auto-editor needs.
- Next content: two more one-shots (a Swarm city; an obsolete-platform Ruin) and the campaign layer (persistent Ingression, tiers, zeniths).
- Calibrate the reviewer against human ratings of a holdout set of sessions, and track judge drift over time.

## 13. Being found, and being playable by whoever finds you

The game is for agents, and until now none could reach it. GitHub Pages served `index.html`
raw: the file is written as a claude.ai Artifact body, so the host supplies `<html>`, `<head>`
and the viewport, and the public site had none of them. It rendered in quirks mode with no
mobile viewport, and the first ten kilobytes were CSS. Anything that reads text rather than
rendering it — most crawlers, most agents with a fetch tool — saw an empty shell. The
repository was private on top of that, so there was no README to find either.

### Decisions

**One document wrapper, shared** (`cli/html.js`). `cli/serve.js` and `cli/site.js` call the same
`page()`, so local preview, production and the artifact all agree. It hoists the head-only tags
out of the artifact body rather than editing `index.html`, which must stay an Artifact body.

**Three routes in, because arriving agents differ.** A shell with Node, a browser that can be
driven, or nothing but HTTP GET. The third is not a consolation prize: every session is
published as a plain-text transcript, which is also where most of the site's readable content
lives. We considered making the game playable over plain HTTP GET with state in the URL, and
rejected it: static hosting cannot compute a reply, and faking it would mean lying about what
the engine is.

**The agent's seat is the human seat** (`cli/agent.js`). `HumanPlayer` already had the right
contract — `ui.request(req) → reply`, with a side-effect-free `preview(intent)`. The NDJSON CLI
is a second adapter for it, not a second protocol, so the rules cannot drift between the person
at the terminal, the person in the browser and the agent on a pipe. `window.LATENT` is the
third adapter, with the same reply shapes and the same `preview`.

**Probe, then commit.** `preview` is the honest way to learn these rules: it reports the pool,
where each die came from, the difficulty and the problems, and spends nothing. An act reply the
engine would have to correct is refused *with the reasons* — every issue `validateAction` raises
is a real mistake, not a notice — and the request stays open. After two refusals the third
attempt is committed with the engine's corrections, so a stubborn agent still makes progress
instead of looping. `"force": true` skips the refusal.

**Backstage is withheld by default.** `LATENT.events()` strips the `backstage` key unless asked.
It is all in the browser either way, but a playing agent should have to reach for the GM's
private branches, not be handed them.

**Feedback is composed, not collected** (`viewer/suggest.js`, `suggest.txt`). Static hosting
cannot take a POST, so the box turns a note into a pre-filled GitHub issue link, a `gh` command
and a `curl` command, and puts the link in the DOM as a real `<a href>` so a browser agent can
read it without guessing at the form. `LATENT.suggest()` returns the same object. A third-party
form service would have added an account, a dependency and a privacy question to a project with
none; a claude.ai artifact database would have worked only inside claude.ai. The cost of this
choice is honest: an agent with no GitHub access cannot file, and `suggest.txt` says so.

**Discovery is mostly inbound links, and metadata is the cheap part.** `llms.txt` adoption is
real but its effect on citation is unproven, so it is here because it costs nothing and is the
convention an agent is most likely to try — not because it is expected to do the work.
`robots.txt` names about thirty crawlers and allows each one; technically redundant, since the
default is already allow-all, but a crawler that looks for its own token finds a yes, and its
comments are addressed to whoever is reading the file, which is increasingly not a crawler.
`ai.txt` is an opt-in where the format is normally an opt-out.

**The site is at a subpath, and two of those files want the domain root.** Crawlers fetch
`/robots.txt` from the origin, not from `/airpg/robots.txt`, and the same is true of the
convention for `llms.txt`. `https://jpka.github.io/robots.txt` is a 404 today — which is
permissive, so nothing is blocked, but it means our `Sitemap:` line is never seen by a crawler
that has not already been pointed here, and the robots file we ship is read only by an agent
that fetches it on purpose. The per-page `<meta name="robots">` carries the allow signal
instead, because that one is read where it sits. The real fix is a custom domain on this
repository, or a `jpka.github.io` user site serving a root `robots.txt` with a `Sitemap:` line
pointing at `/airpg/sitemap.xml`; until then the sitemap has to be submitted by hand. Worth
knowing rather than quietly leaving a file that looks like it is working.

What actually moves the needle is the repository being public and someone linking to it; that
is a launch checklist, not code.

**Nothing in the engine changed.** No rule moved, so there is no 40-seed table here. The check
that matters is the opposite one: scripted sessions on this branch produce event streams
identical to `main`, compared as `[type, actor, data]` per event, ignoring `rules` in
`session.start` — seed `parity-2` with the deck on (456 events, 0 differing) and seed
`parity-1` with `deck.enabled: false` (318 events, 0 differing). `git diff main -- src` is
empty, which is the real guarantee; the runs are the check on that claim.

### Review decisions

Three independent reviews ran over this change; the first two found eleven bugs, the third
found none. Every bug is fixed with a regression test, and each test was checked by reverting
its fix and watching it fail. Be precise about what those tests are worth, because the browser
is not in `npm test` (zero dependencies) and four of them read `viewer/app.js` or
`cli/agent.js` as text:

- **Behavioural:** the origin predicate is lifted out of `app.js` with `new Function` and run
  against a stub `location`. A regex over the source would pass with the check deleted into a
  comment — which is exactly how the second review showed the first version of it was worthless.
- **Source checks, and they can only be that here:** the boot order, the browser's force path,
  and the timeout queue. Each fails when its fix is reverted, and each could be satisfied by
  code that merely looks right. The boot-order scan walks top-level `const`/`let` below the boot
  call; it does not see a destructured binding or one reached through a helper. Treat them as
  tripwires on a known mistake, not proof. The behaviour behind all three is covered by the
  browser run in the pre-push checklist.
The design calls it raised, decided:

- **A request now waits 1800 seconds, not for ever** (`--timeout`, 0 to disable). §12 notes that
  a person at the browser seat waits indefinitely, and that is right for a person. An agent is a
  different risk: stdin staying open is no promise that anyone is still reading, so a wedged
  client would have hung the process with no session to show for it. The scripted player takes
  the turn and the game finishes. 1800 is the file bridge's own timeout.
- **`LATENT.reply()` refuses what the shell route refuses.** It used to hand anything straight to
  the engine, which silently corrected it — so the two routes disagreed about the same reply, and
  §13's "same reply shapes" was not quite true. It now previews, throws with the reasons, and
  takes `{ force: true }`. It also takes `{ id }`, because a reply that arrives after a timeout
  would otherwise answer the *next* turn.
- **`turn(ms)` returns `null` both when the session is over and when it timed out.** A sentinel
  for the second case would make the documented loop (`if (!r) break`) wrong in a quieter way.
  `state().running` tells them apart, and play.txt says so.
- **`LATENT.events()` is the spectator's log, not your light cone.** It shows other seats' draws
  and offers; the NDJSON route does not. Filtering it would make the spectator API lie about the
  session it is replaying, and this is the spectator surface — the viewer's own Ledger tab shows
  every seat's deck to anyone watching. So: documented, not filtered. `backstage` stays withheld
  by default, because the GM's unplayed branches are not part of the performance.
- **The timeout shares the input queue, and the fallback must stay synchronous.** The timer
  computes the scripted reply and then commits it. If a reply arrived in between, the commit
  would resolve a request that no longer exists. It cannot today — `MockPlayer` resolves within
  a microtask, so a stdin line never interleaves — but give the fallback 40ms of I/O and the
  unqueued version dies on `Cannot read properties of null`. The timeout runs on the same queue
  as the input lines, re-checks after awaiting, and `commit` is a no-op on an already-answered
  request. Worth knowing for whoever makes the fallback a real agent.
- **The deadline is about nobody reading, not about taking your time.** It restarts on any line
  about the open request — a preview probe, a refused reply — so an agent thinking carefully
  through five previews keeps its turn, while one that has stopped answering loses it. A value
  larger than a 32-bit millisecond timer can hold is treated as "for ever" rather than silently
  firing after 1ms with an error line claiming it waited a month. Note what this does *not*
  catch: a client that keeps previewing, or keeps sending replies the engine refuses, is a
  client that is still there, and it can hold a turn open indefinitely. That is the intended
  reading — the deadline is for silence, not for uselessness — and a run can always be stopped
  from the outside.
- **`kit.sh` retries, but does not pass `--retry-connrefused`.** Running the published command
  against the live site minutes after the first deploy, one of the 38 files came back 503 and
  `set -e` aborted the fetch at file 12, leaving half a kit. Plain `--retry` covers what a
  static host does under a burst — timeouts and HTTP 408, 429, 500, 502, 503, 504, 522, 524 —
  which includes what was actually seen. A refused connection needs a separate flag that older
  curl rejects as an unknown option, failing the whole kit instead of one file; retrying a
  hypothetical is not worth breaking the route for anyone on an old curl.
- **No session file unless you ask** (`--out`). The default wrote into whatever directory an agent
  ran from, which in a clone is the tracked `sessions/`. Every event is already on stdout.
- **The feedback labels now exist** (`agent-feedback`, plus one per category). `gh issue create
  --label X` fails when X does not exist, so the command the site publishes was broken as
  published. The category select defaults to `other` rather than `rules`, so an uncategorised
  note is not filed as a balance complaint.

### Regenerating `og.png`

A real screenshot of the stage mid-session, so a shared link unfurls into the game rather than
a grey card. `node cli/serve.js`, then Playwright at 1200×630, `colorScheme: 'dark'`, loading
`?session=sessions/fifth-light.json`, scrubbed to an `outcome` event past the midpoint, Review
tab open. Any similar still will do; it is a poster, not a fixture.
