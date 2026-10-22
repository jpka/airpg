// Session runner: drives a full one-shot through the engine with any mix of agents.
// Works in Node and the browser. Streams events through hooks.onEvent.

import { Engine } from '../engine/engine.js';
import { CALLINGS } from '../content/entities.js';
import { MockGM, MockPlayer, MockValidator } from '../agents/agents.js';

/**
 * @param {object} o
 * @param {object} o.scenario
 * @param {object[]} o.cast                 entity defs, in spotlight order
 * @param {object} [o.rules]                rule diff
 * @param {string|number} [o.seed]
 * @param {object} o.gm                     GM agent
 * @param {Record<string, object>} o.players  player agents keyed by entity id
 * @param {object} [o.validator]
 * @param {object} [o.hooks]                { onEvent(e), shouldStop(), audience(sceneId, engine) → optionId|null, pace(e) → Promise }
 * @param {object} [o.budget]               { maxCalls }
 * @param {object} [o.meta]                 recorded in the session file
 */
export async function runSession(o) {
  const engine = new Engine({ scenario: o.scenario, cast: o.cast, rules: o.rules, seed: o.seed });
  const hooks = o.hooks ?? {};
  const players = { ...o.players };
  let gm = o.gm;
  const validator = o.validator ?? new MockValidator();
  const budget = { maxCalls: Infinity, ...(o.budget ?? {}) };
  let calls = 0;
  let aborted = false;

  if (hooks.onEvent) engine.on(hooks.onEvent);
  for (const p of Object.values(players)) p.bindEngine?.(engine); // human seats preview their hand against the live engine
  const pace = async () => { if (hooks.pace) await hooks.pace(engine.events.at(-1)); };

  const fallbackGM = new MockGM({ seed: `${o.seed}-gm-budget` });
  const fallbackPlayers = Object.fromEntries(o.cast.map((c) => [c.id, new MockPlayer({ id: c.id, seed: `${o.seed}-budget` })]));

  async function call(agentId, tag, fn) {
    if (calls >= budget.maxCalls) {
      // Out of budget: finish the session with scripted agents and say so.
      if (gm.kind !== 'mock') { gm = fallbackGM; engine.flag('budget', `call budget ${budget.maxCalls} reached; GM switched to scripted`); }
      for (const id of Object.keys(players)) if (players[id].kind === 'llm') { players[id] = fallbackPlayers[id]; } // humans keep their seat
    }
    const res = await fn();
    if (!res.meta?.mock && !res.meta?.skipped && !res.meta?.human) calls++;
    engine.emit('agent.call', { agent: agentId, tag, ms: res.meta?.ms ?? 0, ok: !!res.meta?.ok, fallback: !!res.meta?.fallback, mock: !!res.meta?.mock, ...(res.meta?.human ? { human: true } : {}), error: res.meta?.error ?? null, attempts: res.meta?.attempts ?? 1 }, { actor: agentId === 'gm' ? null : agentId });
    if (res.meta?.fallback) engine.flag('agent', `${agentId}.${tag} fell back to scripted (${res.meta.error})`, agentId === 'gm' ? null : agentId);
    return res.data ?? {};
  }

  const stop = () => { if (!aborted && hooks.shouldStop?.()) { aborted = true; engine.emit('session.abort', { reason: 'stopped by operator' }); } return aborted; };

  async function handleFallouts(list) {
    let queue = [...list];
    while (queue.length) {
      const f = queue.shift();
      if (engine.char(f.actor).dissolved) continue;
      const options = engine.falloutOptions(f);
      const sheet = engine.gmView().cast.find((c) => c.id === f.actor) ?? engine.publicSheet(f.actor);
      const fo = await call('gm', 'fallout', () => gm.fallout(engine.gmView(), f, options, sheet));
      const follow = engine.applyFallout(f, fo.choice, fo.narration);
      await pace();
      for (const need of follow) {
        if (need.type === 'memory_rewrite' || need.type === 'memory_lose') {
          const pr = await call(f.actor, 'fallout', () => players[f.actor].fallout(engine.playerView(f.actor), need));
          if (need.type === 'memory_rewrite') engine.rewriteMemory(f.actor, pr.memory, pr.rewritten || '…');
          else {
            engine.loseMemory(f.actor, pr.memory);
            if (pr.last_words) engine.emit('dialogue', { speaker: engine.char(f.actor).name, text: pr.last_words }, { actor: f.actor });
          }
          await pace();
        }
      }
      queue.push(...engine.pendingFallouts.splice(0));
    }
  }

  async function turn(pid, round, opts) {
    engine.clearGuardsBy(pid);
    engine.emit('turn.start', { round }, { actor: pid });
    engine.drawHand(pid);
    await act(pid, opts);
    // End of turn: unplayed cards are discarded; a compel still held costs stress.
    if (engine.endTurn(pid)) await handleFallouts(engine.pendingFallouts.splice(0));
  }

  async function act(pid, { mustTheorize = false } = {}) {
    const view = engine.playerView(pid);
    if (mustTheorize) view.recent.push('THE APERTURE WILL NOT OPEN TO THE UNREAD: theorize now if you can.');
    const intent = await call(pid, 'act', () => players[pid].act(view));
    const action = engine.declare(pid, intent);
    if (action.memory && engine.state.forceMemory) engine.state.forceMemory = false;
    await pace();
    const gmv = engine.gmView();
    const sheet = gmv.cast.find((c) => c.id === pid);

    if (action.kind === 'rest') {
      const r = engine.rest(action);
      if (r) engine.emit('outcome', { text: `${engine.char(pid).name} rests at ${r.name}. It costs a memory: "${r.spent}"`, band: null, branch: 'rest' }, { actor: pid });
      await pace();
      return;
    }

    if (action.kind === 'theorize') {
      const adj = await call('gm', 'adjudicate', () => gm.adjudicate(gmv, action, sheet));
      const result = engine.theorize(action, (adj.clues_accepted ?? []).map(String));
      const text = result.result === 'false' ? adj.branches?.fail : adj.branches?.success;
      engine.emit('outcome', { text: text ?? '', band: result.result, branch: result.result === 'false' ? 'fail' : 'success' }, { actor: pid, backstage: { notTaken: result.result === 'false' ? adj.branches?.success : adj.branches?.fail, why: adj.why, intent: adj.intent } });
      for (const b of adj.beats_hit ?? []) engine.hitBeat(b.actor ?? pid, b.beat, b.why);
      await pace();
      await handleFallouts(result.fallouts.concat(engine.pendingFallouts.splice(0)));
      return;
    }

    if (action.needsRoll) {
      // The seeds a success could reveal, so the GM can word the first one: a search may find two
      // (a crit, Look Again); a moved entity gives up `cluesFromEntities` of them (v0.5).
      const unrevealed = (engine.location()?.clueSeeds ?? []).filter((s) => !engine.state.cluesRevealedSeeds.has(s.id));
      const fromEntity = action.target.type === 'npc' && engine.rules.cluesFromEntities ? Number(engine.rules.cluesFromEntities) : 0;
      const clueSeeds = action.target.type === 'clue' ? unrevealed.slice(0, 2) : unrevealed.slice(0, fromEntity);
      const clueFrom = fromEntity && clueSeeds.length ? o.scenario.npcs[action.target.id].name : null;
      const adj = await call('gm', 'adjudicate', () => gm.adjudicate(gmv, action, sheet, { clueSeeds, ...(clueFrom ? { clueFrom } : {}) }));
      const stakes = engine.setStakes(action, adj);
      await pace();
      const roll = engine.roll(action, stakes);
      await pace();
      const out = engine.applyOutcome(action, stakes, roll);
      let text = adj.branches?.[out.branch] ?? '';
      if (!text) engine.flag('narration', `GM left the ${out.branch} branch empty`);
      if (out.branch === 'success' && action.target.type === 'clue' && out.clues.length === 0) text += ' But there is nothing more to find here.';
      // Continuity check on what is about to become canon
      const facts = engine.state.facts.map((f) => f.text);
      const v = await call('validator', 'check', () => validator.check(facts, `${text} ${(adj.new_facts ?? []).join(' ')}`));
      const contradictions = v.contradictions ?? [];
      for (const c of contradictions) engine.flag('contradiction', `"${c.claim}" vs fact "${c.fact}"`);
      engine.emit('outcome', { text, band: roll.band, branch: out.branch, complication: out.complication }, {
        actor: pid,
        backstage: { notTaken: Object.fromEntries(Object.entries(adj.branches ?? {}).filter(([k]) => k !== out.branch)), intent: adj.intent },
      });
      const source = action.target.type === 'npc' ? `npc:${action.target.id}` : null;
      out.clues.forEach((seed, i) => engine.addClue(seed, i === 0 ? adj.clue_text : seed.seed, pid, source));
      if (adj.npc_line && out.branch !== 'fail') engine.emit('dialogue', { speaker: action.target.type === 'npc' ? o.scenario.npcs[action.target.id].name : 'The Latent', text: adj.npc_line });
      if (!contradictions.length) engine.addFacts(adj.new_facts, 'gm');
      for (const b of adj.beats_hit ?? []) engine.hitBeat(b.actor ?? pid, b.beat, b.why);
      await pace();
      await handleFallouts(out.fallouts.concat(engine.pendingFallouts.splice(0)));
      return;
    }

    // Talk: no roll, no mechanical stake — the world still answers.
    const adj = await call('gm', 'adjudicate', () => gm.adjudicate(gmv, action, sheet));
    engine.emit('outcome', { text: adj.response ?? '', band: null, branch: 'talk' }, { actor: pid, backstage: { intent: adj.intent } });
    if (adj.npc_line) engine.emit('dialogue', { speaker: engine.location()?.npcs?.length ? o.scenario.npcs[engine.location().npcs[0]].name : 'The Latent', text: adj.npc_line });
    engine.addFacts(adj.new_facts, 'gm');
    for (const b of adj.beats_hit ?? []) engine.hitBeat(b.actor ?? pid, b.beat, b.why);
    await pace();
  }

  // ------------------------------------------------------------------ main loop
  engine.start();
  await pace();
  const scenes = o.scenario.scenes;
  let spotlight = 0;
  for (let si = 0; si < scenes.length && !stop(); si++) {
    const def = engine.enterScene(si);
    await pace();
    await handleFallouts(engine.pendingFallouts.splice(0));

    if (def.kind === 'prologue') {
      const fr = await call('gm', 'frame', () => gm.frame(engine.gmView()));
      engine.emit('scene.frame', { text: fr.text ?? '', gm_move: fr.gm_move ?? '' }, { backstage: { intent: fr.intent } });
      engine.addFacts(fr.new_facts, 'gm');
      await pace();
      for (const pid of engine.activeCast()) {
        if (stop()) break;
        const view = engine.playerView(pid);
        view.scenarioPremise = o.scenario.premise;
        view.scenarioQuestion = o.scenario.question;
        const calling = CALLINGS[engine.char(pid).calling];
        const r = await call(pid, 'intro', () => players[pid].intro(view, calling));
        engine.emit('character.intro', { text: r.text ?? '' }, { actor: pid, backstage: { intent: r.intent } });
        engine.declareBeats(pid, r.beats);
        await pace();
      }
      continue;
    }

    if (def.kind === 'epilogue') {
      const ending = engine.resolveEnding();
      await pace();
      const er = await call('gm', 'ending', () => gm.ending(engine.gmView(), ending, o.scenario.endings[ending]));
      engine.emit('ending.narrate', { text: er.text ?? '' });
      await pace();
      for (const pid of engine.activeCast()) {
        if (stop()) break;
        const r = await call(pid, 'epilogue', () => players[pid].epilogue(engine.playerView(pid)));
        engine.emit('character.epilogue', { text: r.text ?? '' }, { actor: pid });
        if (r.memory) engine.formMemory(pid, r.memory);
        await pace();
      }
      continue;
    }

    const fr = await call('gm', 'frame', () => gm.frame(engine.gmView()));
    engine.emit('scene.frame', { text: fr.text ?? '', gm_move: fr.gm_move ?? '' }, { backstage: { intent: fr.intent } });
    engine.addFacts(fr.new_facts, 'gm');
    await pace();

    // Audience pressure (capped by the engine)
    if (hooks.audience) {
      const opt = await hooks.audience(def.id, engine);
      if (opt) { engine.audienceIngress(opt, engine.activeCast()[spotlight % engine.activeCast().length]); await pace(); await handleFallouts(engine.pendingFallouts.splice(0)); }
    }

    const baseRounds = engine.rules.roundsPerScene[def.kind] ?? 1;
    const maxRounds = def.kind === 'delve' || def.kind === 'finale' ? baseRounds + 1 : baseRounds;
    for (let round = 0; round < maxRounds && !stop(); round++) {
      if (round >= baseRounds) {
        // Extra round only if the scene's central clock is unresolved
        const c = def.kind === 'delve' ? engine.state.clocks[engine.state.delveClockId] : engine.state.clocks.aperture;
        if (!c || c.done) break;
      }
      const cast = engine.activeCast();
      if (!cast.length) break;
      for (let k = 0; k < cast.length && !stop(); k++) {
        const pid = cast[(spotlight + k) % cast.length];
        if (engine.char(pid).dissolved) continue;
        const mustTheorize = def.kind === 'finale' && !engine.state.theory && round === 0 && k === 0;
        await turn(pid, round, { mustTheorize });
        if (def.kind === 'delve' && engine.state.clocks[engine.state.delveClockId]?.done) break;
        if (def.kind === 'finale' && engine.state.clocks.aperture?.done) break;
      }
      spotlight++;
      if (def.kind === 'delve' && engine.state.clocks[engine.state.delveClockId]?.done) break;
      if (def.kind === 'finale' && engine.state.clocks.aperture?.done) break;
    }

    if (def.kind === 'delve') {
      const dc = engine.state.clocks[engine.state.delveClockId];
      if (!dc.done) {
        const left = dc.size - dc.value;
        engine.emit('delve.forced', { remaining: left, text: `The party forces the last of ${dc.name}. It costs them.` });
        engine.tick('attractor', Math.max(1, Math.ceil(left / 4)), 'a forced passage');
        for (const pid of engine.activeCast()) engine.inflict(pid, 'reach', Math.max(1, Math.ceil(left / 3)), { source: 'forced delve' });
        await pace();
        await handleFallouts(engine.pendingFallouts.splice(0));
      }
    }
  }

  engine.emit('session.end', { calls, aborted });
  return { engine, session: engine.exportSession({ ...(o.meta ?? {}), calls, aborted }) };
}
