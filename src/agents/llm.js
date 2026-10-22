// LLM providers. Every provider implements:
//   complete({ system, prompt, temperature, maxTokens, model, tag }) → Promise<string>
// Providers are plain objects so they work in Node and in the browser.

/** Anthropic Messages API (fetch, no SDK). */
export function anthropicProvider({ apiKey, baseUrl = 'https://api.anthropic.com', defaultModel = 'claude-sonnet-5-5', version = '2023-06-01' } = {}) {
  if (!apiKey) throw new Error('anthropic provider needs an apiKey (set ANTHROPIC_API_KEY)');
  return {
    name: 'anthropic',
    async complete({ system, prompt, temperature = 0.9, maxTokens = 1200, model }) {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': version },
        body: JSON.stringify({
          model: model || defaultModel,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = await res.json();
      return (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    },
  };
}

/** Any OpenAI-compatible /chat/completions endpoint (OpenAI, OpenRouter, Ollama, LM Studio, vLLM…). */
export function openaiProvider({ apiKey = null, baseUrl = 'https://api.openai.com/v1', defaultModel = 'gpt-4o-mini' } = {}) {
  return {
    name: 'openai',
    async complete({ system, prompt, temperature = 0.9, maxTokens = 1200, model }) {
      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || defaultModel,
          temperature,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 400)}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

/**
 * Claude via a published claude.ai Artifact's `sample` capability (browser only).
 * Spends the *viewer's* Claude usage. `sampleFn` is the resolved `await claude.use("sample")`.
 */
export function sampleProvider({ sampleFn, modelTier = 'quick', signal = null } = {}) {
  if (!sampleFn) throw new Error('sample provider needs the resolved sample function');
  return {
    name: 'sample',
    async complete({ system, prompt, model, tier }) {
      const input = `${system}\n\n---\n\n${prompt}`;
      const opts = { modelTier: tier || modelTier, cache: false };
      if (model) opts.model = model;
      if (signal) opts.signal = signal;
      const { text } = await sampleFn(input, opts);
      return text;
    },
  };
}

/**
 * File bridge (Node only): writes each request to <dir>/req-<n>.json and waits for
 * <dir>/res-<n>.txt. Lets any external agent (a coding agent, a human, another
 * runtime) play a seat. The request file carries the full system + prompt.
 */
export function bridgeProvider({ dir = 'bridge', pollMs = 400, timeoutMs = 30 * 60 * 1000, seat = 'seat' } = {}) {
  let n = 0;
  return {
    name: 'bridge',
    async complete({ system, prompt, tag }) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.mkdir(dir, { recursive: true });
      const id = String(++n).padStart(4, '0');
      const reqFile = path.join(dir, `req-${seat}-${id}.json`);
      const resFile = path.join(dir, `res-${seat}-${id}.txt`);
      await fs.writeFile(reqFile, JSON.stringify({ seat, tag, system, prompt }, null, 2));
      const t0 = Date.now();
      for (;;) {
        try {
          const txt = await fs.readFile(resFile, 'utf8');
          if (txt.trim()) { await fs.rename(reqFile, reqFile.replace('req-', 'done-')).catch(() => {}); return txt; }
        } catch { /* not yet */ }
        if (Date.now() - t0 > timeoutMs) throw new Error(`bridge timeout waiting for ${resFile}`);
        await new Promise((r) => setTimeout(r, pollMs));
      }
    },
  };
}

/** Build a provider from a config entry. `env` is process.env in Node or {} in browser. */
export function providerFromConfig(cfg, env = {}, extras = {}) {
  switch (cfg.type) {
    case 'anthropic':
      return anthropicProvider({ apiKey: cfg.apiKey ?? env[cfg.apiKeyEnv ?? 'ANTHROPIC_API_KEY'], baseUrl: cfg.baseUrl, defaultModel: cfg.model });
    case 'openai':
      return openaiProvider({ apiKey: cfg.apiKey ?? (cfg.apiKeyEnv ? env[cfg.apiKeyEnv] : null), baseUrl: cfg.baseUrl, defaultModel: cfg.model });
    case 'sample':
      return sampleProvider({ sampleFn: extras.sampleFn, modelTier: cfg.modelTier, signal: extras.signal });
    case 'bridge':
      return bridgeProvider({ dir: cfg.dir, seat: cfg.seat ?? extras.seat });
    case 'mock':
      return null; // handled by MockAgent
    case 'human':
      return null; // a seat, not a model: see agents/human.js
    default:
      throw new Error(`unknown provider type ${cfg.type}`);
  }
}
