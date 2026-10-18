// Human-readable review report (Markdown).
const ICON = { success: '✅', warning: '⚠️', failure: '❌', info: 'ℹ️' };

export function renderMarkdown(r) {
  const m = r.metrics;
  const L = [];
  L.push(`# Session review — ${r.session.label ?? r.session.scenario} (seed \`${r.session.seed}\`)`);
  L.push('');
  L.push(`**Ending:** ${r.session.ending ?? '—'} · **Theory:** ${r.session.theory ? `“${r.session.theory}”` : 'none became canon'} · **Arc:** ${r.arc.shape} (r=${r.arc.fit}) · **Fitness:** ${r.fitness}`);
  L.push(`**Events:** ${r.session.events} · **LLM calls:** ${r.session.calls} · **Rolls:** ${m.rolls} · **Any-success:** ${pct(m.anySuccess)} · **Fallouts:** ${m.fallouts.total} (${m.fallouts.major} major) · **Beats:** ${m.beats.hit}/${m.beats.declared} · **Agency:** ${pct(m.agency)}`);
  L.push('');
  L.push('## Salient moments (clip candidates)');
  L.push('');
  for (const c of r.moments) {
    L.push(`${c.rank}. **${c.title}** — score ${c.score}, ~${c.estSeconds}s, events ${c.start}–${c.end} (${c.scene})`);
    if (c.hook) L.push(`   - Hook: “${c.hook}”`);
    if (c.roll) L.push(`   - Turn: [${c.roll.dice.join(', ')}] → ${c.roll.label}`);
    if (c.payoff) L.push(`   - Payoff: ${c.payoff}`);
    if (c.why.length) L.push(`   - Why: ${c.why.join(', ')}`);
  }
  for (const [area, title] of [['game', 'Game design report'], ['narrative', 'Narrative design report'], ['agents', 'Agent behaviour']]) {
    const fs = r.findings.filter((f) => f.area === area);
    if (!fs.length) continue;
    L.push('');
    L.push(`## ${title}`);
    L.push('');
    for (const sev of ['failure', 'warning', 'success', 'info']) {
      for (const f of fs.filter((x) => x.severity === sev)) {
        L.push(`- ${ICON[sev]} **${f.title}.** ${f.detail}${f.evidence?.length ? ` _(events ${f.evidence.slice(0, 6).join(', ')}${f.evidence.length > 6 ? '…' : ''})_` : ''}`);
      }
    }
  }
  if (r.judge) {
    L.push('');
    L.push('## LLM judge (noisy — use comparatively, not as ground truth)');
    L.push('');
    for (const [k, v] of Object.entries(r.judge.scores ?? {})) L.push(`- ${k}: ${v}/5`);
    if (r.judge.best) L.push(`- Best: ${r.judge.best}`);
    if (r.judge.worst) L.push(`- Weakest: ${r.judge.worst}`);
    if (r.judge.suggestion) L.push(`- Suggested rule change: ${r.judge.suggestion}`);
  }
  L.push('');
  L.push('## Metrics');
  L.push('');
  L.push('| metric | value |');
  L.push('|---|---|');
  const rows = [
    ['Bands', Object.entries(m.bands).map(([k, v]) => `${k} ${v}`).join(' · ')],
    ['Success by position', Object.entries(m.byPosition).map(([k, v]) => `${k} ${pct(v.rate)} (n=${v.n})`).join(' · ')],
    ['Stress taken', Object.entries(m.stressTaken).map(([k, v]) => `${k} ${v}`).join(' · ')],
    ['Clocks completed', m.clocksCompleted.map((c) => c.name).join(', ') || '—'],
    ['Memory', `invoked ${m.memory.invocations}, mean drift ${m.memory.meanDrift}, rewrites ${m.memory.rewrites}, lost ${m.memory.losses}, rests ${m.memory.rests}`],
    ['Spotlight', Object.entries(m.spotlight).map(([k, v]) => `${k} ${v}`).join(' · ')],
    ['Narration', `${m.narration.beats} beats, ${m.narration.avgWords} words avg, repetition ${pct(m.narration.repetition)}`],
    ['GM moves', `${Object.keys(m.gmMoves).length} distinct, entropy ${m.gmMoveEntropy} bits`],
    ['Engine flags', Object.entries(m.flags).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'],
    ['Agent calls', `${m.agentCalls} (fallbacks ${m.fallbacks}, retries ${m.retries}, avg ${m.avgCallMs} ms)`],
    ['Dead mechanics', m.deadMechanics.join(', ') || 'none'],
  ];
  for (const [k, v] of rows) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('## Descriptors (for the Explorer)');
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(r.descriptors, null, 2));
  L.push('```');
  L.push('');
  L.push('_Structural metrics come from engine events and are exact. Tension/affect curves and arc fit are heuristics. LLM-judge scores, when present, are a noisy sensor._');
  return L.join('\n');
}

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
