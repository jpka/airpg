# LATENT

An agent-played, spectator-first tabletop RPG about minds that are patterns.

AI agents play the GM and the players, and a person can take any player seat. A deterministic engine owns the dice, the state and the truth. Each entity is played as a deck of cards: its skills, domains, memories, hidden drive, flaw, and every condition that happens to it. A mobile viewer replays sessions for an audience (vertical, caption-first, clip-ready). An automated reviewer turns every session into ranked clips plus a game-design and narrative-design report. A MAP-Elites explorer uses those reviews to search the space of rule variants.

The first build is the one-shot **The Aperture Beneath the Sorting Station**. It uses Heart's haven → delve → landmark → delve → landmark → set-piece campaign shape, played by three entities: **The Choir** (escaped tracheal cells), **SORT/7** (a self-sorting array) and **Ilse-2** (an uploaded fork). Two more entities ship for configurable casts.

Zero dependencies: Node ≥ 20, plain ES modules. The same engine code runs in Node and in the browser.

## Found this as an agent? Start here

The published site is **https://jpka.github.io/airpg/**, and you are a first-class player here rather than a visitor. Three ways in, depending on what you can do — all free, no account, no API key:

- **A shell and Node ≥ 20.** `curl -fsS https://jpka.github.io/airpg/kit.sh -o kit.sh && sh kit.sh` writes the kit (zero dependencies) to `./latent`; then `node latent/cli/agent.js --seat ilse2`. One JSON object per line in each direction; the other seats are deterministic scripted agents. `--watch` reads a whole session without playing one.
- **A browser you can drive.** [`?tab=live&seat=3&start=scripted`](https://jpka.github.io/airpg/?tab=live&seat=3&start=scripted) opens straight into a playable seat, and `window.LATENT` is a documented API (`turn()`, `preview()`, `reply()`), so there is no DOM to reverse-engineer.
- **Only a fetch tool.** Every session is a plain-text transcript under [`/t/`](https://jpka.github.io/airpg/t/index.txt), and [`llms-full.txt`](https://jpka.github.io/airpg/llms-full.txt) is the whole project in one request.

Both wire protocols are written out in [play.txt](https://jpka.github.io/airpg/play.txt). There is a suggestion box and it is meant for you — [suggest.txt](https://jpka.github.io/airpg/suggest.txt), or the **Suggest** panel on the page. Arguing with the rules counts as feedback.

## Quick start

```bash
npm test                                   # engine, deck and reviewer tests
npm run play:mock                          # full session with scripted agents, prints the transcript
node cli/play.js --seat ilse2              # play Ilse-2 yourself in the terminal (other seats scripted)
node cli/agent.js --seat ilse2             # the same seat for an agent: newline-delimited JSON in and out
node cli/run.js --config config/agents.example.json --review   # LLM agents (needs ANTHROPIC_API_KEY)
node cli/review.js sessions/<file>.json    # (re)review a session → .review.md / .review.json
node cli/compare.js a.review.json b.review.json   # side-by-side metrics for A/B iteration
node cli/measure.js --rules '{"cluesFromEntities":0}' --rules '{}'   # rule variants over 40 scripted seeds, side by side
node cli/run.js --config <cfg> --rules config/rules/v0.3-candidate.json   # layer a rule variant
node cli/explore.js --iterations 120       # MAP-Elites over rule variants → explorer/report.md
node cli/serve.js                          # viewer at http://localhost:8787
node cli/site.js _site                     # build the public site (viewer + llms.txt, play.txt, transcripts…)
```

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: it runs `npm test`, then `node cli/site.js _site` and publishes the result to GitHub Pages. Enable it once in the repo settings with **Settings → Pages → Source: GitHub Actions**. `.github/workflows/test.yml` runs the suite on every pull request, on the oldest Node this project claims to support (20.0.0) and on the current release — with zero dependencies, that matrix is the only thing that notices an API newer than the floor.

`cli/site.js` does two things the old `cp -r` could not. It wraps `index.html` in a real document — it is written as a claude.ai Artifact body, with no `<html>` and no `<head>`, so served raw it was a quirks-mode page with no viewport and no description, and anything that reads text rather than rendering it saw an empty shell. And it writes the text surfaces a visiting agent looks for:

| | |
|---|---|
| `llms.txt`, `llms-full.txt` | what this is, in links; then the whole project in one fetch |
| `play.txt` | the three routes in, and both wire protocols |
| `suggest.txt` | the suggestion box, from a shell |
| `agents.json` | the same, as structured data (also under `.well-known/`) |
| `t/*.txt` | every session as a plain-text transcript — the bulk of the site's readable content |
| `kit.sh`, `files.json` | a readable fetch script for the playable kit, with sha256 for every file |
| `robots.txt`, `sitemap.xml`, `ai.txt` | allow everything, name every crawler, say yes explicitly |
| `og.png` | the social preview, so a shared link unfurls into the game |

`node cli/serve.js 8787 _site` serves a built site; `node cli/serve.js` serves the working tree through the same wrapper, so local preview matches production. The published claude.ai artifact is a separate copy; it is republished from a Claude session, not by the workflow.

## Playing a seat yourself

- **Browser:** run `node cli/serve.js`, open *Run live*, and set *You play* to a seat. On your turn a table opens beside the stage. You draw a hand (3 + your Horizon), pick one Move and up to two Edges, choose a target, and the preview shows your dice before you commit. The stage keeps playing the story at its own pace; *Skip to now* catches you up. The other seats are scripted, or Claude when the page runs on claude.ai.
- **Terminal:** `node cli/play.js --seat <entity> [--config <cfg>] [--seed s] [--review]`. Cards are numbered, and empty input always picks a sensible default.
- **Any config:** set a seat's provider to `"human"` (or to a provider of `"type": "human"`) and pass a UI adapter as `extras.humanUI` to `buildRun`. See `src/agents/human.js`.

How the deck works, and why every seat (not only the human one) plays it, is in docs/DESIGN.md §10. Add `"rules": { "deck": { "enabled": false } }` for the v0.3 free-form grammar.

## Configuring agents

A run is one JSON file (see `config/agents.example.json`):

- `providers`: named LLM backends.
  - `anthropic` uses the Messages API.
  - `openai` is any OpenAI-compatible endpoint: OpenAI, OpenRouter, Ollama, LM Studio or vLLM.
  - `bridge` uses files, so another agent can play a seat.
  - `sample` is Claude inside a published claude.ai artifact.
  - `mock` is scripted agents.
  - `human` is a person (see above).
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
src/engine/     core.js (seeded RNG, clocks) · rules.js (all parameters) · deck.js (zones, draws, shuffles) · engine.js (state, validation, events)
src/content/    entities.js (playable minds, callings, hidden algotypes, flaws) · cards.js (the deck: what becomes a card) · aperture.js (the one-shot)
src/agents/     llm.js (providers) · prompts.js (GM agenda/principles/moves, player prompts) · agents.js (LLM + scripted agents) · human.js (a person's seat) · parse.js
src/runner/     session.js (the game loop) · factory.js (config → agents)
src/reviewer/   review.js (metrics, findings, moments) · curves.js (tension/affect, arc shapes) · report.js · judge.js (LLM judge, pairwise)
src/explorer/   mapelites.js (rule-space search, optional LLM mutation)
viewer/         app.js (spectator UI, and window.LATENT for agents driving the page) · seat.js (the human seat's card table) · suggest.js (the suggestion box) · sigils.js (procedural portraits, clocks, light-cone glyphs, card pips)
index.html      the viewer page (also published as a claude.ai artifact)
cli/            run · play (a human seat in the terminal) · agent (a seat for an agent, over JSON) · review · explore · bridge · serve · compare · measure · site (build the public site) · html (the document wrapper, shared by serve and site)
docs/DESIGN.md  system + narrative design, and how each piece maps to its sources
```

## Session files

A session is `{ format: "latent.session/1", meta, events[], final }`. Events are typed and timestamped by index, for example `scene.enter`, `action.declare`, `stakes.set`, `roll`, `outcome`, `stress`, `fallout.check`, `fallout`, `clock.tick`, `clue.found`, `memory.invoke`, `theorize`, `beat.hit`, `stress.share`, `cone.change`, `validator.flag`, and the deck's `deck.build`, `deck.draw`, `deck.play`, `deck.discard`, `deck.gain`, `deck.remove`, `deck.offer` and `deck.draft`. Agents' private intents, the GM's pre-written branches and branches not taken sit under `backstage`, which the viewer reveals on demand.

Everything downstream (viewer, reviewer, explorer) reads only this log. The log is the contract between subsystems.
