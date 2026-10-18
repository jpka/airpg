# Session review — all-scripted smoke test (seed `mock-demo`)

**Ending:** overrun · **Theory:** “A mind that has no body yet, using our bodies as a draft of the one it wants.” · **Arc:** tragedy (fall) (r=0.643) · **Fitness:** 4.3001
**Events:** 344 · **LLM calls:** 0 · **Rolls:** 18 · **Any-success:** 61% · **Fallouts:** 7 (0 major) · **Beats:** 6/6 · **Agency:** 83%

## Salient moments (clip candidates)

1. **The Choir: Narrowing** — score 42.878, ~17s, events 106–126 (stacks)
   - Hook: “If this fails, The Choir loses some reach to the Proof-Stacks.”
   - Turn: [5, 6] → Failure
   - Payoff: The Proof-Stacks folds around The Choir. Downhill feels like home, and that is exactly the trap.
   - Why: shares stress, fallout (Narrowing), desperate position
2. **Ilse-2: Bleed-through** — score 23.359, ~15s, events 286–306 (aperture)
   - Hook: “If this fails, Ilse-2 loses some boundary to the Aperture.”
   - Turn: [4, 7, 2] → Failure
   - Payoff: Ilse-2 pushes, and the push is used against them.
   - Why: shares stress, a secret opens, fallout (Bleed-through), fallout (Follower)
3. **The Choir: “Convince an entity to join you — or merge with it.”** — score 21.994, ~20s, events 19–30 (slope)
   - Hook: “If this fails, The Choir loses some boundary to the Morphic Slope.”
   - Turn: [6, 10, 2, 6] → Critical success
   - Payoff: The Choir finds the gradient that the Morphic Slope was hiding. The way down opens like a held breath released.
   - Why: critical success, major beat
4. **The Morphic Slope — complete** — score 18.184, ~20s, events 52–63 (slope)
   - Hook: “If this fails, SORT/7 loses some boundary to the Morphic Slope.”
   - Turn: [9, 1, 7] → Success
   - Payoff: SORT/7 finds the gradient that the Morphic Slope was hiding. The way down opens like a held breath released.
   - Why: The Morphic Slope completes, major beat
5. **The Choir: Narrowing** — score 16.767, ~16s, events 267–285 (aperture)
   - Hook: “If this fails, The Choir loses some boundary to the Aperture.”
   - Turn: [6, 2, 6] → Success at a cost
   - Payoff: The Choir moves the world an inch, and pays for the inch.
   - Why: shares stress, fallout (Narrowing), desperate position
6. **Ilse-2 names the pattern — and is wrong** — score 15.235, ~14s, events 228–237 (library)
   - Hook: “That is not my face. It is close.”
   - Payoff: Ilse-2's theory slides off the pattern. It was the wrong shape, and the wrong shape costs.
   - Why: theory fails
7. **SORT/7: “Find a clue no one else could have found.”** — score 12.785, ~18s, events 87–100 (garden)
   - Hook: “If this fails, SORT/7 loses some coherence to the Garden of Unfinished Bodies.”
   - Turn: [6, 3, 10] → Critical success
   - Payoff: SORT/7 reads the Garden of Unfinished Bodies like handwriting, and a line of it resolves.
   - Why: critical success, a secret opens, beat hit
8. **The Choir: “Grow your light cone by caring about something larger than you can see.”** — score 12.638, ~18s, events 75–86 (garden)
   - Hook: “If this fails, The Choir loses some memory to the Garden of Unfinished Bodies.”
   - Turn: [3, 8, 3] → Success
   - Payoff: The Choir reads the Garden of Unfinished Bodies like handwriting, and a line of it resolves.
   - Why: major beat

## Game design report

- ❌ **Dead mechanic: Haunts (spend a memory to clear stress).** Never triggered this session. Either agents do not understand it, the prompt does not surface it, or it is not worth its complexity.
- ❌ **Dead mechanic: Memory loss.** Never triggered this session. Either agents do not understand it, the prompt does not surface it, or it is not worth its complexity.
- ✅ **Stakes were declared before every roll.** 100% of 18 stakes had a hook spectators could read before the dice.
- ✅ **Success rate sits in a dramatic band.** 61% any-success (target 40–75%).
- ✅ **Fallout landed at a healthy rate.** 7 fallouts over 18 rolls (39%). _(events 123, 126, 266, 285, 304, 306…)_
- ✅ **Actions mattered.** 83% of actions changed the game state.
- ✅ **The party behaved like a collective.** 5 stress shares; cohesion reached 5. _(events 37, 112, 159, 274, 292)_
- ✅ **A theory became canon.** Ilse-2: "A mind that has no body yet, using our bodies as a draft of the one it wants." → false (1/3 clues accepted, 2d6=2+3) · SORT/7: "A mind that has no body yet, using our bodies as a draft of the one it wants." → true (3/3 clues accepted, 2d6=6+2) _(events 233, 250)_
- ✅ **Beat fulfilment 100%.** 6 of 6 declared beats hit. _(events 29, 50, 62, 85, 99, 169)_
- ℹ️ **Ingression completed.** At event 242 (70% through). _(events 242)_

## Narrative design report

- ⚠️ **Narration repeats itself.** 35% repeated trigrams. Top phrases: "finds the gradient that"×5, "the gradient that the"×5, "was hiding the way"×5, "hiding the way down"×5, "the way down opens"×5.
- ✅ **Tension peaked late.** Peak tension 0.75 at 76% of the session. _(events 260)_
- ✅ **SORT/7's hidden drive surfaced.** Clusterer of likeness — same×2, resembl×2, kind×1, cluster×1, order×2.
- ✅ **Ilse-2's hidden drive surfaced.** Seeker of the source — original×1, first×3, back×1, before×3.
- ℹ️ **Arc shape: tragedy (fall).** Best fit r=0.643 against Reagan et al.'s six emotional arcs.
- ℹ️ **Memories were reinterpreted.** 9 invocations, mean drift 0.24 from the original (0 = verbatim, 1 = unrelated). Identity as committed confabulation was too timid. _(events 21, 71, 77, 134, 154, 173…)_
- ℹ️ **The Choir's hidden drive stayed hidden.** Hoarder of samples — carry×1.
- ℹ️ **3 secret(s) unlocked.** Phase-gated secrets enter prompts only when their gate opens.
- ℹ️ **Ending: overrun.** They read it right, and too late to choose. What comes through is what they named — but on its own terms. _(events 331)_

## Metrics

| metric | value |
|---|---|
| Bands | critFail 0 · fail 7 · cost 2 · success 6 · crit 3 |
| Success by position | risky 62% (n=13) · desperate 60% (n=5) |
| Stress taken | boundary 10 · reach 9 · substrate 3 · coherence 1 |
| Clocks completed | The Morphic Slope, The Proof-Stacks, Ingression |
| Memory | invoked 9, mean drift 0.243, rewrites 0, lost 0, rests 0 |
| Spotlight | choir 8 · sort7 8 · ilse2 8 |
| Narration | 30 beats, 20.3 words avg, repetition 35% |
| GM moves | 5 distinct, entropy 2.19 bits |
| Engine flags | — |
| Agent calls | 0 (fallbacks 0, retries 0, avg 0 ms) |
| Dead mechanics | haunt.rest, memory.lose |

## Descriptors (for the Explorer)

```json
{
  "falloutRate": 0.389,
  "successRate": 0.611,
  "cooperation": 0.208,
  "memoryLoss": 0,
  "coneGrowth": 2,
  "peakPosition": 0.756,
  "arcShape": "tragedy (fall)"
}
```

_Structural metrics come from engine events and are exact. Tension/affect curves and arc fit are heuristics. LLM-judge scores, when present, are a noisy sensor._