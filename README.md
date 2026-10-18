# LATENT

An agent-played, spectator-first tabletop RPG about minds that are patterns.

AI agents play the GM and the players. A deterministic engine owns the dice, the state and the truth. A mobile viewer replays sessions for an audience (vertical, caption-first, clip-ready). An automated reviewer turns every session into ranked clips plus a game-design and narrative-design report. A MAP-Elites explorer uses those reviews to search the space of rule variants.

The first build is the one-shot **The Aperture Beneath the Sorting Station**. It uses Heart's haven → delve → landmark → delve → landmark → set-piece campaign shape, played by three entities: **The Choir** (escaped tracheal cells), **SORT/7** (a self-sorting array) and **Ilse-2** (an uploaded fork). Two more entities ship for configurable casts.

Zero dependencies: Node ≥ 20, plain ES modules. The same engine code runs in Node and in the browser.

## Quick start

```bash
npm test                                   # 13 engine/reviewer tests
npm run play:mock                          # full session with scripted agents, prints the transcript
node cli/run.js --config config/agents.example.json --review   # LLM agents (needs ANTHROPIC_API_KEY)
node cli/review.js sessions/<file>.json    # (re)review a session → .review.md / .review.json
node cli/explore.js --iterations 120       # MAP-Elites over rule variants → explorer/report.md
node cli/serve.js                          # viewer at http://localhost:8787
```

## Configuring agents

A run is one JSON file (see `config/agents.example.json`):

- `providers`: named LLM backends.
  - `anthropic` uses the Messages API.
  - `openai` is any OpenAI-compatible endpoint: OpenAI, OpenRouter, Ollama, LM Studio or vLLM.
  - `bridge` uses files, so another agent can play a seat.
  - `sample` is Claude inside a published claude.ai artifact.
  - `mock` is scripted agents.
- `gm`, `players.<entity>` (or `players.default`), and `validator`: each picks a provider plus `model`/`tier`, `temperature` and a free-text `persona`/`style`.
- `cast`: three entity ids from `src/content/entities.js`.
- `rules`: a diff over `DEFAULT_RULES` in `src/engine/rules.js`. Every number is there.
- `budget.maxCalls`: the cap on LLM calls. Once it is reached, the remaining seats finish on scripted agents and the engine logs a flag.

### Letting other agents play (file bridge)

```bash
node cli/run.js --config config/agents.bridge.json --out sessions/x.json --review &   # engine waits
node cli/bridge.js wait   --seat gm                          # an agent reads its next request…
node cli/bridge.js answer --seat gm --id 0007 <<'EOF'        # …and answers with JSON
{ "position": "risky", ... }
EOF
```

Each seat sees only its own requests, which are already filtered by its light cone. The bundled sessions `sessions/first-light.json` and `sessions/second-light.json` were played this way: a Sonnet agent as GM and three Haiku agents as players, each in its own context. The first run's review found an engine bug; the second run is after the fix (see docs/DESIGN.md §9).

## What's where

```
src/engine/     core.js (seeded RNG, clocks) · rules.js (all parameters) · engine.js (state, validation, events)
src/content/    entities.js (playable minds, callings, hidden algotypes) · aperture.js (the one-shot)
src/agents/     llm.js (providers) · prompts.js (GM agenda/principles/moves, player prompts) · agents.js (LLM + scripted agents) · parse.js
src/runner/     session.js (the game loop) · factory.js (config → agents)
src/reviewer/   review.js (metrics, findings, moments) · curves.js (tension/affect, arc shapes) · report.js · judge.js (LLM judge, pairwise)
src/explorer/   mapelites.js (rule-space search, optional LLM mutation)
viewer/         app.js (spectator UI) · sigils.js (procedural portraits, clocks, light-cone glyphs)
index.html      the viewer page (also published as a claude.ai artifact)
cli/            run · review · explore · bridge · serve
docs/DESIGN.md  system + narrative design, and how each piece maps to its sources
```

## Session files

A session is `{ format: "latent.session/1", meta, events[], final }`. Events are typed and timestamped by index, for example `scene.enter`, `action.declare`, `stakes.set`, `roll`, `outcome`, `stress`, `fallout.check`, `fallout`, `clock.tick`, `clue.found`, `memory.invoke`, `theorize`, `beat.hit`, `stress.share`, `cone.change` and `validator.flag`. Agents' private intents, the GM's pre-written branches and branches not taken sit under `backstage`, which the viewer reveals on demand.

Everything downstream (viewer, reviewer, explorer) reads only this log. The log is the contract between subsystems.
