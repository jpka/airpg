# Session review — all-scripted smoke test (seed `mock-demo`)

**Ending:** unread · **Theory:** none became canon · **Arc:** tragedy (fall) (r=0.806) · **Fitness:** 4.0795
**Events:** 360 · **LLM calls:** 0 · **Rolls:** 18 · **Any-success:** 44% · **Fallouts:** 8 (1 major) · **Beats:** 6/6 · **Agency:** 91%

## Salient moments (clip candidates)

1. **The Choir: Ingressed** — score 73.831, ~16s, events 277–304 (aperture)
   - Hook: “If this fails, The Choir loses some boundary to the Aperture.”
   - Turn: [2, 1, 5] → Critical failure
   - Payoff: The Choir pushes, and the push is used against them.
   - Why: critical failure, The Attractor Wakes completes, shares stress, hidden drive revealed, major fallout (Ingressed), fallout (Follower), desperate position
2. **SORT/7: Follower** — score 37.59, ~15s, events 238–259 (aperture)
   - Hook: “If this fails, SORT/7 loses some boundary to the Aperture.”
   - Turn: [4, 1, 8, 9] → Failure
   - Payoff: SORT/7 pushes, and the push is used against them.
   - Why: shares stress, fallout (Follower), fallout (Narrowing), desperate position
3. **The Morphic Slope — complete** — score 25.232, ~20s, events 50–61 (slope)
   - Hook: “If this fails, SORT/7 loses some boundary to the Morphic Slope.”
   - Turn: [10, 9, 1] → Critical success
   - Payoff: SORT/7 finds the gradient that the Morphic Slope was hiding. The way down opens like a held breath released.
   - Why: critical success, The Morphic Slope completes, major beat
4. **The Choir: “Convince an entity to join you — or merge with it.”** — score 21.994, ~20s, events 19–30 (slope)
   - Hook: “If this fails, The Choir loses some boundary to the Morphic Slope.”
   - Turn: [6, 10, 2, 6] → Critical success
   - Payoff: The Choir finds the gradient that the Morphic Slope was hiding. The way down opens like a held breath released.
   - Why: critical success, major beat
5. **The Proof-Stacks — complete** — score 14.932, ~18s, events 185–200 (stacks)
   - Hook: “If this fails, Ilse-2 loses some boundary to the Proof-Stacks.”
   - Turn: [6, 2, 9, 6] → Success at a cost
   - Payoff: Ilse-2 gets through, but the Proof-Stacks takes its toll: something has to bend to make the path.
   - Why: The Proof-Stacks completes, fallout (Bleed-through), desperate position
6. **SORT/7: Static** — score 14.76, ~18s, events 137–154 (stacks)
   - Hook: “If this fails, SORT/7 loses some reach to the Proof-Stacks.”
   - Turn: [1, 3, 10] → Failure
   - Payoff: The Proof-Stacks folds around SORT/7. Downhill feels like home, and that is exactly the trap.
   - Why: shares stress, fallout (Static)
7. **The Choir: “Grow your light cone by caring about something larger than you can see.”** — score 11.823, ~18s, events 73–85 (garden)
   - Hook: “If this fails, The Choir loses some memory to the Garden of Unfinished Bodies.”
   - Turn: [5, 3, 8] → Success
   - Payoff: The Choir reads the Garden of Unfinished Bodies like handwriting, and a line of it resolves.
   - Why: major beat
8. **SORT/7: “Find a clue no one else could have found.”** — score 9.131, ~17s, events 86–101 (garden)
   - Hook: “If this fails, SORT/7 loses some coherence to the Garden of Unfinished Bodies.”
   - Turn: [3, 6, 3] → Success at a cost
   - Payoff: SORT/7 learns something true — and the knowing leaves a mark.
   - Why: shares stress, beat hit

## Game design report

- ❌ **Dead mechanic: Theorize (clue-ledger truth).** No agent chose it this session. Either agents do not understand it, the prompt does not surface it, or it is not worth its complexity.
- ✅ **Stakes were declared before every roll.** 100% of 18 stakes had a hook spectators could read before the dice.
- ✅ **Success rate sits in a dramatic band.** 44% any-success (target 40–75%).
- ✅ **Fallout landed at a healthy rate.** 8 fallouts over 18 rolls (44%). _(events 154, 200, 256, 259, 276, 302…)_
- ✅ **Actions mattered.** 91% of actions changed the game state.
- ✅ **The party behaved like a collective.** 9 guard(s) set, 6 stress share(s); cohesion reached 6. _(events 92, 143, 177, 246, 291, 325)_
- ✅ **Beat fulfilment 100%.** 6 of 6 declared beats hit. _(events 29, 48, 60, 84, 100, 135)_
- ℹ️ **Consequences that did not occur.** Memory loss. Normal variance in one session; watch across several.
- ℹ️ **Ingression completed.** At event 234 (65% through). _(events 234)_
- ℹ️ **The Attractor Wakes completed.** At event 288 (80% through). _(events 288)_

## Narrative design report

- ⚠️ **Narration repeats itself.** 32% repeated trigrams. Top phrases: "pushes and the push"×6, "and the push is"×6, "the push is used"×6, "push is used against"×6, "is used against them"×6.
- ✅ **Tension peaked late.** Peak tension 0.87 at 82% of the session. _(events 295)_
- ✅ **SORT/7's hidden drive surfaced.** Clusterer of likeness — same×2, resembl×3, kind×1, cluster×1, order×2.
- ✅ **Ilse-2's hidden drive surfaced.** Seeker of the source — original×1, first×3, back×2, before×2.
- ℹ️ **Arc shape: tragedy (fall).** Best fit r=0.806 against Reagan et al.'s six emotional arcs.
- ℹ️ **Memories were reinterpreted.** 10 invocations, mean drift 0.23 from the original (0 = verbatim, 1 = unrelated). Identity as committed confabulation was too timid. _(events 21, 69, 75, 127, 157, 172…)_
- ℹ️ **The Choir's hidden drive stayed hidden.** Hoarder of samples · revealed by Ingressed fallout.
- ℹ️ **2 secret(s) unlocked.** Phase-gated secrets enter prompts only when their gate opens.
- ℹ️ **Ending: unread.** The pattern arrived before anyone read it. It will be whatever it is. Some of it is them. _(events 347)_

## Metrics

| metric | value |
|---|---|
| Bands | critFail 2 · fail 8 · cost 3 · success 3 · crit 2 |
| Success by position | risky 70% (n=10) · desperate 13% (n=8) |
| Stress taken | boundary 49 · coherence 5 · reach 6 · substrate 1 |
| Clocks completed | The Morphic Slope, The Proof-Stacks, Ingression, The Attractor Wakes |
| Memory | invoked 10, mean drift 0.23, rewrites 0, lost 0, rests 1 |
| Spotlight | choir 7 · sort7 8 · ilse2 8 |
| Narration | 29 beats, 18.4 words avg, repetition 32% |
| GM moves | 5 distinct, entropy 1.83 bits |
| Engine flags | — |
| Agent calls | 0 (fallbacks 0, retries 0, avg 0 ms) |
| Dead mechanics | theorize |

## Descriptors (for the Explorer)

```json
{
  "falloutRate": 0.444,
  "successRate": 0.444,
  "cooperation": 0.261,
  "memoryLoss": 0.333,
  "coneGrowth": 4,
  "peakPosition": 0.819,
  "arcShape": "tragedy (fall)"
}
```

_Structural metrics come from engine events and are exact. Tension/affect curves and arc fit are heuristics. LLM-judge scores, when present, are a noisy sensor._