// Build agents from a JSON config (shared by CLI and browser viewer).
import { providerFromConfig } from '../agents/llm.js';
import { LLMGM, LLMPlayer, LLMValidator, MockGM, MockPlayer, MockValidator } from '../agents/agents.js';
import { ENTITIES } from '../content/entities.js';
import { APERTURE } from '../content/aperture.js';
import { Engine } from '../engine/engine.js';

export const SCENARIOS = { aperture: APERTURE };

export function buildRun(config, env = {}, extras = {}) {
  const scenario = SCENARIOS[config.scenario ?? 'aperture'];
  if (!scenario) throw new Error(`unknown scenario ${config.scenario}`);
  const castIds = config.cast ?? ['choir', 'sort7', 'ilse2'];
  const cast = castIds.map((id) => { const e = ENTITIES[id]; if (!e) throw new Error(`unknown entity ${id}`); return e; });
  const seed = config.seed ?? `latent-${Date.now()}`;
  const providers = {};
  const prov = (name, seat) => {
    if (!name || name === 'mock') return null;
    const key = `${name}:${seat ?? ''}`;
    const pc = config.providers?.[name];
    if (!pc) throw new Error(`unknown provider "${name}"`);
    if (pc.type === 'bridge') return providerFromConfig({ ...pc, seat }, env, extras); // one bridge seat per agent
    providers[key] ??= providerFromConfig(pc, env, extras);
    return providers[key];
  };
  // A throwaway engine gives player agents the sheet fields they need for prompts.
  const probe = new Engine({ scenario, cast, seed });

  const g = config.gm ?? { provider: 'mock' };
  const gmProv = prov(g.provider, 'gm');
  const gm = gmProv
    ? new LLMGM({ provider: gmProv, model: g.model, tier: g.tier, temperature: g.temperature ?? 0.85, style: g.style ?? '', mockFallback: new MockGM({ seed: `${seed}-gmfb` }) })
    : new MockGM({ seed: `${seed}-gm`, harshness: g.harshness ?? 0.5 });

  const players = {};
  for (const ent of cast) {
    const pc = config.players?.[ent.id] ?? config.players?.default ?? { provider: 'mock' };
    const p = prov(pc.provider, ent.id);
    const c = probe.char(ent.id);
    const sheet = { id: c.id, name: c.name, pitch: c.pitch, pronoun: c.pronoun, voice: c.voice, disposition: c.algotype.disposition };
    players[ent.id] = p
      ? new LLMPlayer({ provider: p, model: pc.model, tier: pc.tier, temperature: pc.temperature ?? 1.0, persona: pc.persona ?? '', sheet, mockFallback: new MockPlayer({ id: ent.id, seed: `${seed}-fb` }) })
      : new MockPlayer({ id: ent.id, seed, boldness: pc.boldness ?? 0.5, cooperation: pc.cooperation ?? 0.4 });
  }
  const vc = config.validator ?? { provider: 'mock' };
  const vp = prov(vc.provider, 'validator');
  const validator = vp ? new LLMValidator({ provider: vp, model: vc.model, tier: vc.tier ?? 'quick' }) : new MockValidator();

  const meta = {
    config: {
      scenario: scenario.id, cast: castIds, seed,
      gm: { provider: g.provider, model: g.model ?? g.tier ?? null },
      players: Object.fromEntries(castIds.map((id) => { const pc = config.players?.[id] ?? config.players?.default ?? { provider: 'mock' }; return [id, { provider: pc.provider, model: pc.model ?? pc.tier ?? null, persona: pc.persona ?? '' }]; })),
      validator: { provider: vc.provider, model: vc.model ?? vc.tier ?? null },
      rules: config.rules ?? {},
    },
    label: config.label ?? null,
  };
  return { scenario, cast, seed, rules: config.rules ?? {}, gm, players, validator, budget: config.budget ?? {}, meta };
}
