# Working on LATENT (for coding agents)

Read README.md and docs/DESIGN.md first. The engine is the only authority on state; agents propose, the engine validates, and the event log is the contract between engine, viewer, reviewer and explorer.

## Every pull request: independent review, then fix

Run this loop whenever you open a pull request, and again whenever you push to one.

1. **Spawn an independent reviewer.** Use a fresh agent with no context from the author's session, ideally a different model or a different agent tool. It reviews `git diff <base>...HEAD`, read-only: it must not edit, commit, push or comment. Tell it what the change intends (link the DESIGN.md section) and what to prioritise. On a follow-up push, it focuses on the commits since the last review.
2. **The reviewer proves what it reports.** Each finding comes with a file and line, a concrete failing scenario, and a reproduction (a test or a small script in a scratch directory, never in the repo). Unverified suspicions and design concerns go in a separate list.
3. **Fix every verified bug** in the same pull request, each with a regression test (`test/*.test.js`). Rerun the reviewer's reproduction to show it now passes.
4. **Decide every design concern; don't leave it open.** Change it or keep it, use data where data can decide (scripted runs over many seeds), and record the decision and its reason in docs/DESIGN.md. A concern that is neither changed nor documented counts as unresolved.
5. **Re-verify before pushing** (see the checklist below), then update the pull request description so its claims and numbers match the code.
6. **Repeat from step 1 for that push** until a review finds nothing serious. Post a short summary of the findings on the pull request: what was fixed, what was kept and why.

## Checks before any push

- `npm test` passes.
- **Legacy mode is untouched.** With `rules: { deck: { enabled: false } }`, scripted sessions must produce the same event streams as `main` did. Compare `[type, actor, data]` per event, ignoring the `rules` object in `session.start`. Committed legacy sessions in `sessions/` must review to the same fitness and findings.
- **Both human seats still play through:**
  - Terminal: `yes '' | node cli/play.js --seat ilse2` reaches an ending with no engine flags against the seat.
  - Browser: drive a "You play" run in the viewer (`node cli/serve.js`), for example with Playwright. It needs no console errors, and no horizontal scroll at 390px width.
- **Docs match the code.** README, DESIGN.md and the pull request description carry rule descriptions, test counts and measured tables; update whichever ones changed.

## Rule changes

A change to the rules is measured, not asserted:
- Compare against the previous rules over 40 scripted seeds with both casts (see DESIGN.md §10).
- Record the table in DESIGN.md.
- For changes that affect how agents play, run an LLM playtest on the file bridge (`config/agents.bridge.json`, `cli/bridge.js`) and compare reviews with `node cli/compare.js`.

Scripted agents measure the mechanics, not the fiction.

## Conventions

- Zero dependencies: Node ≥ 20 and plain ES modules. The same engine code runs in Node and in the browser.
- Match the surrounding code: compact, with sparse comments that say why.
- Every number that tunes the game lives in `src/engine/rules.js`.
- The engine must stay deterministic for a given seed. Randomness comes only from `engine.rng`.
- Never commit scratch output. `bridge/` is gitignored.
