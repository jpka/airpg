// Optional LLM judge. Research (Chhun et al. 2024; Chakrabarty et al. 2024) says
// LLM judges are unreliable on a single story but more useful comparatively, and
// they reward sycophancy (Sharma et al. 2023). So: rubric scores are reported as a
// noisy sensor, and pairwise comparison runs in BOTH orders and reports agreement.
import { describeEvent } from '../engine/engine.js';
import { extractJson } from '../agents/parse.js';

const RUBRIC = {
  stakes_clarity: 'Could a viewer tell what was at risk before each roll?',
  character_voice: 'Do the entities sound distinct and non-human?',
  agent_independence: 'Did players act on their own natures (disagree, take risks) rather than politely cooperating?',
  surprise: 'Were there genuine reversals?',
  coherence: 'Does the fiction stay consistent?',
  thematic_depth: 'Does play engage selves-as-patterns, memory as reinterpretation, multiscale agency, the open question of the Latent?',
  spectator_hook: 'Would short clips of this make someone want to watch the whole session?',
};

export function transcript(session, maxLines = 220, tailLines = 40) {
  const start = session.events.find((e) => e.type === 'session.start');
  const names = Object.fromEntries((start?.data.cast ?? []).map((c) => [c.id, c.name]));
  const lines = session.events.map((e) => describeEvent(e, names)).filter(Boolean);
  // Long sessions keep the opening and the ending; the cut falls in the middle.
  if (lines.length <= maxLines) return lines.join('\n');
  return [...lines.slice(0, maxLines - tailLines), `… (${lines.length - maxLines} lines omitted) …`, ...lines.slice(-tailLines)].join('\n');
}

export async function judgeSession(session, provider, { model = null, tier = 'default' } = {}) {
  const prompt = [
    'You are reviewing an actual-play session of LATENT, an RPG played by AI agents for a human audience.',
    `Score each criterion 1-5 (be strict; 3 = competent): ${JSON.stringify(RUBRIC)}`,
    'Then name the best moment, the weakest moment, and ONE concrete rule or prompt change to try next.',
    'Return JSON: {"scores": {criterion: n}, "best": string, "worst": string, "suggestion": string}',
    '--- TRANSCRIPT ---',
    transcript(session),
  ].join('\n');
  const raw = await provider.complete({ system: 'You are a demanding game-design critic. Reply with ONLY JSON.', prompt, temperature: 0.2, maxTokens: 800, model, tier });
  const data = extractJson(raw) ?? { error: 'invalid_json', raw: String(raw).slice(0, 500) };
  return { ...data, noisy: true };
}

/** Compare two sessions in both orders; returns preference + whether the judge agreed with itself. */
export async function judgePair(a, b, provider, { model = null, tier = 'default', criterion = 'overall watchability and game-design quality' } = {}) {
  const ask = async (x, y) => {
    const prompt = [
      `Two actual-play sessions of the same AI-played RPG. Which is better on: ${criterion}? Ignore length; judge substance.`,
      '--- SESSION 1 ---', transcript(x, 140), '--- SESSION 2 ---', transcript(y, 140),
      'Return JSON: {"winner": 1 or 2, "why": string}',
    ].join('\n');
    const raw = await provider.complete({ system: 'Reply with ONLY JSON.', prompt, temperature: 0, maxTokens: 300, model, tier });
    return extractJson(raw) ?? {};
  };
  const ab = await ask(a, b);
  const ba = await ask(b, a);
  const prefAB = ab.winner === 1 ? 'a' : ab.winner === 2 ? 'b' : null;
  const prefBA = ba.winner === 1 ? 'b' : ba.winner === 2 ? 'a' : null;
  return { winner: prefAB === prefBA ? prefAB : 'tie', consistent: prefAB === prefBA, reasons: [ab.why, ba.why] };
}
