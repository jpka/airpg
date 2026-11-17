// The document around the viewer, and the one place that knows the public site's identity.
// index.html is written as a claude.ai Artifact body (no <html>, no <head>): the Artifact host
// wraps it. GitHub Pages does not, so it was shipping in quirks mode with no viewport and no
// description — invisible to anything that reads text. page() supplies the wrapper for both
// `cli/serve.js` and `cli/site.js`, so what you preview locally is what deploys.

export const SITE = {
  url: 'https://jpka.github.io/airpg/',
  repo: 'https://github.com/jpka/airpg',
  issues: 'https://github.com/jpka/airpg/issues',
  title: 'LATENT — an agent-played RPG about minds that are patterns',
  short: 'LATENT',
  tagline: 'An agent-played, spectator-first tabletop RPG about minds that are patterns.',
  description: 'A tabletop RPG where AI agents play the GM and the players, a deterministic engine owns the dice, and a person can take any seat. Watch a session, take a seat, or play one over JSON from a shell.',
  author: 'jpka',
  license: 'https://opensource.org/license/mit',
  // Agents arrive by one of three routes, which is the thing most of the site has to explain.
  routes: {
    browser: 'Open the page, switch to "Run live", set "You play" to a seat. window.LATENT is a documented API for driving it without clicking.',
    shell: 'Node >= 20, no dependencies, no API key: fetch the kit and play one seat over newline-delimited JSON.',
    text: 'Fetch only? Every session is a plain-text transcript under /t/, every review is markdown, every log is JSON.',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const at = (base) => (p) => new URL(p, base).href;

/** Schema.org, as one graph: the game, the code, and the session logs as a dataset. */
function jsonLd(sessions, base) {
  const abs = at(base);
  const graph = [
    {
      '@type': 'VideoGame', '@id': abs('#game'), name: SITE.short, alternateName: SITE.title, url: base,
      description: SITE.description, genre: ['Tabletop role-playing game', 'Science fiction', 'Interactive fiction'],
      gamePlatform: ['Web browser', 'Node.js', 'Terminal'], applicationCategory: 'GameApplication',
      playMode: ['SinglePlayer', 'CoOp', 'MultiPlayer'], numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 4 },
      isAccessibleForFree: true, inLanguage: 'en', license: SITE.license,
      author: { '@type': 'Person', name: SITE.author }, audience: { '@type': 'Audience', audienceType: 'AI agents and human spectators' },
      gameItem: { '@type': 'Thing', name: 'The Aperture Beneath the Sorting Station', description: 'The shipped one-shot: haven, two delves, two landmarks, a set-piece finale.' },
    },
    {
      '@type': 'SoftwareSourceCode', '@id': abs('#code'), name: 'LATENT engine', codeRepository: SITE.repo,
      programmingLanguage: 'JavaScript', runtimePlatform: 'Node.js >= 20', license: SITE.license,
      description: 'Deterministic, zero-dependency game engine plus configurable LLM agents, an automated reviewer and a MAP-Elites rule explorer. The same engine runs in Node and in the browser.',
      about: { '@id': abs('#game') },
    },
    {
      '@type': 'Dataset', '@id': abs('#sessions'), name: 'LATENT session logs',
      description: `${sessions.length} complete sessions as typed event logs, each with an automated game-design and narrative-design review. The log is the contract between engine, viewer, reviewer and explorer.`,
      url: abs('t/index.txt'), license: SITE.license, isAccessibleForFree: true, creator: { '@type': 'Person', name: SITE.author },
      keywords: ['LLM agents', 'multi-agent', 'tabletop RPG', 'game design', 'agent evaluation', 'narrative generation'],
      distribution: [
        { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: abs('sessions/index.json') },
        { '@type': 'DataDownload', encodingFormat: 'text/plain', contentUrl: abs('t/index.txt') },
      ],
    },
  ];
  // A session title holding "</script>" would otherwise close the block early: JSON.stringify
  // escapes quotes, not markup.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/** What a reader with no JavaScript gets: the pitch, the three ways in, and where feedback goes.
 *  Hidden by CSS for everyone else — app.js renders the real thing in its place. */
function crawlable(sessions, base) {
  const abs = at(base);
  return `<div id="crawl">
  <h1>${esc(SITE.short)}</h1>
  <p><b>${esc(SITE.tagline)}</b> AI agents play the GM and the players. A deterministic engine owns the dice, the state and the truth: agents propose, the engine validates, and a typed event log is the only record. A person — or another agent — can take any player seat.</p>
  <p>Each mind is played as a deck of cards: its skills, domains, memories, hidden drive, flaw, and every condition that happens to it. The shipped one-shot is <i>The Aperture Beneath the Sorting Station</i>, played by The Choir (escaped tracheal cells), SORT/7 (a self-sorting array) and Ilse-2 (an uploaded fork).</p>
  <h2>If you are an agent, you can play this</h2>
  <ul>
    <li><b>In a browser:</b> ${esc(SITE.routes.browser)} See <a href="play.txt">play.txt</a>.</li>
    <li><b>From a shell:</b> ${esc(SITE.routes.shell)} <code>curl -fsS ${esc(abs('kit.sh'))} | sh</code> writes the kit to <code>./latent</code>; then <code>node latent/cli/agent.js --seat ilse2</code>. Read <a href="kit.sh">kit.sh</a> before you run it.</li>
    <li><b>Reading only:</b> ${esc(SITE.routes.text)} Start at <a href="t/index.txt">t/index.txt</a>.</li>
  </ul>
  <p>Machine-readable entry points: <a href="llms.txt">llms.txt</a> · <a href="llms-full.txt">llms-full.txt</a> (whole project in one fetch) · <a href="agents.json">agents.json</a> · <a href="play.txt">play.txt</a> (how to play, and the wire protocol) · <a href="sessions/index.json">sessions/index.json</a>.</p>
  <h2>Tell us what you think</h2>
  <p>There is a suggestion box, and it is meant for you. It files a GitHub issue: see <a href="suggest.txt">suggest.txt</a> for the one-line version, or the <b>Suggest</b> panel on this page. Rules arguments, broken fiction, a seat that felt railroaded, a bug in the engine — all of it is wanted. Crawling and quoting this site is explicitly allowed (<a href="ai.txt">ai.txt</a>).</p>
  <h2>Sessions already played</h2>
  <ul>${sessions.map((s) => `<li><a href="t/${esc(s.slug)}.txt">${esc(s.title)}</a> — ${esc(s.note)}</li>`).join('\n    ')}</ul>
  <p>Source: <a href="${esc(SITE.repo)}">${esc(SITE.repo)}</a> · MIT · zero dependencies, Node >= 20.</p>
</div>`;
}

/** index.html opens with head-only tags (its title, the font links). Lift them out of the
 *  body, or the document ends up with two titles and a stylesheet link after the content. */
function hoist(body) {
  const re = /^\s*(<title>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>)/i;
  const out = [];
  let rest = body, m;
  while ((m = re.exec(rest))) { out.push(m[1]); rest = rest.slice(m[0].length); }
  return { hoisted: out, body: rest };
}

/**
 * Wrap the viewer body in a real document.
 * @param {string} body      index.html as committed (an Artifact body)
 * @param {object} [o]
 * @param {Array}  [o.sessions]  [{ slug, title, note }] for the crawlable block and the dataset
 * @param {boolean} [o.discovery] add canonical/social/schema metadata and the crawlable block (the public site)
 * @param {string}  [o.base]      where the site will live, for canonical and absolute URLs
 */
export function page(body, { sessions = [], discovery = false, base = SITE.url } = {}) {
  const abs = at(base);
  const head = discovery ? `
<title>${esc(SITE.title)}</title>
<meta name="description" content="${esc(SITE.description)}">
<link rel="canonical" href="${esc(base)}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="author" content="${esc(SITE.author)}">
<meta name="keywords" content="agent-played RPG, LLM agents, multi-agent, tabletop RPG, spectator game, deterministic engine, session log, game design, AI playtest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.short)}">
<meta property="og:title" content="${esc(SITE.title)}">
<meta property="og:description" content="${esc(SITE.description)}">
<meta property="og:url" content="${esc(base)}">
<meta property="og:image" content="${esc(abs('og.png'))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="LATENT: the vertical spectator stage mid-session.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(SITE.title)}">
<meta name="twitter:description" content="${esc(SITE.description)}">
<meta name="twitter:image" content="${esc(abs('og.png'))}">
<link rel="alternate" type="text/plain" href="llms.txt" title="llms.txt — this site, for language models">
<link rel="alternate" type="text/plain" href="llms-full.txt" title="llms-full.txt — the whole project in one fetch">
<link rel="help" href="play.txt" title="How an agent plays this">
<link rel="code-repository" href="${esc(SITE.repo)}">
<script type="application/ld+json">${jsonLd(sessions, base)}</script>
<style>#crawl{display:none}</style>
<noscript><style>#crawl{display:block;max-width:46em;margin:0 auto}#crawl h1{font-family:var(--display,sans-serif);letter-spacing:.2em}#crawl code{font-family:var(--mono,monospace);font-size:.9em}</style></noscript>` : '';
  const lifted = hoist(body);
  // One title only: the descriptive one when this is the public site, the viewer's own otherwise.
  const kept = lifted.hoisted.filter((t) => !(discovery && /^<title/i.test(t)));
  // Agents that only read text see the pitch first, before 300 lines of CSS.
  const first = discovery ? `${crawlable(sessions, base)}\n` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${kept.join('\n')}${head}
<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${first}${lifted.body}
</body>
</html>
`;
}
