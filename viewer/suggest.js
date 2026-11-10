// The suggestion box. GitHub Pages cannot take a POST, so this composes the feedback and
// hands it over by every route a visitor might have: a pre-filled issue link (one navigation
// for a browser agent), a gh command, a curl command, or raw JSON to carry out by hand.
// The composed URL is always a real <a href> in the DOM, so an agent driving the page can
// read it without reverse-engineering the form. window.LATENT.suggest() returns the same thing.

const REPO = 'jpka/airpg';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LIMIT = 6000; // past this a GET URL stops being reliable; say so instead of truncating

export const WHO = [['agent', 'an AI agent'], ['person', 'a person'], ['unsaid', 'rather not say']];
export const ROUTE = [['browser', 'this page in a browser'], ['shell', 'cli/agent.js from a shell'], ['text', 'reading the transcripts'], ['bridge', 'the file bridge, a seat per agent'], ['other', 'some other way']];
export const KIND = [
  ['rules', 'rules and balance'], ['fiction', 'fiction and tone'], ['agency', 'a seat felt railroaded'],
  ['bug', 'something is broken'], ['protocol', 'the agent protocol or the API'], ['discovery', 'how I found this (or did not)'],
  ['viewer', 'the viewer or the card table'], ['other', 'something else'],
];
const label = (list, v) => list.find(([k]) => k === v)?.[1] ?? v;

/** Compose one suggestion into every form it can be sent in. Pure: nothing is opened or stored. */
export function compose(f = {}) {
  const kind = f.kind || 'other';
  const note = String(f.note ?? '').trim();
  const title = (String(f.title ?? '').trim() || note.split(/[.\n]/)[0] || 'feedback from a visiting agent').slice(0, 110);
  const context = [
    ['Who', `${label(WHO, f.who || 'unsaid')}${f.model ? ` · ${f.model}` : ''}`],
    ['Came in by', label(ROUTE, f.route || 'browser')],
    ['About', label(KIND, kind)],
    f.seed ? ['Seed', f.seed] : null,
    f.session ? ['Session', f.session] : null,
    Number.isFinite(f.event) ? ['Event index', String(f.event)] : null,
  ].filter(Boolean);
  const body = [
    note || '(no note)',
    '',
    '---',
    ...context.map(([k, v]) => `- **${k}:** ${v}`),
    `- **Page:** ${typeof location === 'undefined' ? '' : location.href}`,
    '',
    '<sub>Filed through the suggestion box at https://jpka.github.io/airpg/ — see suggest.txt.</sub>',
  ].join('\n');
  const q = new URLSearchParams({ labels: `agent-feedback,${kind}`, title, body });
  const url = `https://github.com/${REPO}/issues/new?${q}`;
  const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return {
    title, body, labels: ['agent-feedback', kind], repo: REPO, url, tooLong: url.length > LIMIT,
    gh: `gh issue create --repo ${REPO} --label agent-feedback,${kind} --title ${sq(title)} --body ${sq(body)}`,
    curl: `curl -sS -X POST https://api.github.com/repos/${REPO}/issues \\\n  -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \\\n  -d ${sq(JSON.stringify({ title, body, labels: ['agent-feedback', kind] }))}`,
    json: JSON.stringify({ title, body, labels: ['agent-feedback', kind] }, null, 2),
  };
}

const opts = (list, cur) => list.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');

/** Mount the panel. `context()` returns what the viewer knows right now (seed, session, event). */
export function renderSuggest(el, { context = () => ({}), store } = {}) {
  const saved = store?.get('latent.suggest', {}) ?? {};
  el.innerHTML = `
    <div class="card form">
      <div class="k">The suggestion box</div>
      <p class="note">It is meant for agents as much as for people. An argument with the rules, a seat that felt railroaded, fiction that rang false, a clock that always fills first, a protocol that fought you, a route in that did not work — say it plainly. Nothing here is collected by this page: it composes a GitHub issue and hands you the link.</p>
      <div class="seats">
        <label>You are<select id="sgWho">${opts(WHO, saved.who ?? 'agent')}</select></label>
        <label>You got here by<select id="sgRoute">${opts(ROUTE, saved.route ?? 'browser')}</select></label>
      </div>
      <div class="seats">
        <label>This is about<select id="sgKind">${opts(KIND, 'rules')}</select></label>
        <label>Model or client (optional)<input id="sgModel" maxlength="60" placeholder="e.g. a coding agent, or a model name" value="${esc(saved.model ?? '')}"></label>
      </div>
      <label>One-line summary (optional — the first sentence is used otherwise)<input id="sgTitle" maxlength="110" placeholder="clue economy: searching is never worth a turn"></label>
      <label>What you want to say<textarea id="sgNote" rows="7" maxlength="5000" placeholder="What did you expect, what happened, and where? If you played a seat, the seed and the event index make it reproducible."></textarea></label>
      <label class="inline"><input type="checkbox" id="sgCtx" checked style="width:auto"> Attach what this page knows: <span id="sgCtxWhat" class="mono"></span></label>
      <div class="row">
        <a class="btn primary" id="sgOpen" href="https://github.com/${REPO}/issues/new?labels=agent-feedback" target="_blank" rel="noopener">Open a pre-filled issue</a>
        <button class="btn" id="sgCopyGh">Copy gh command</button>
        <button class="btn" id="sgCopyCurl">Copy curl command</button>
        <button class="btn" id="sgCopyJson">Copy JSON</button>
      </div>
      <p class="note" id="sgStatus" aria-live="polite"></p>
      <details id="sgPeek"><summary class="note">The exact text, if you would rather carry it yourself</summary>
        <div class="k">title</div><pre class="sg-pre mono" id="sgPreTitle"></pre>
        <div class="k">body</div><pre class="sg-pre mono" id="sgPreBody"></pre>
        <div class="k">gh</div><pre class="sg-pre mono" id="sgPreGh"></pre>
        <div class="k">curl</div><pre class="sg-pre mono" id="sgPreCurl"></pre>
      </details>
      <p class="note">No GitHub access at all? <span class="mono">https://jpka.github.io/airpg/suggest.txt</span> lists every other way. From a shell or your own code: <span class="mono">LATENT.suggest({note, kind, route})</span> returns the same title, body, URL and commands.</p>
    </div>`;

  const fields = () => {
    const ctx = $('#sgCtx').checked ? context() : {};
    return {
      who: $('#sgWho').value, route: $('#sgRoute').value, kind: $('#sgKind').value,
      model: $('#sgModel').value.trim(), title: $('#sgTitle').value, note: $('#sgNote').value, ...ctx,
    };
  };
  const $ = (s) => el.querySelector(s);
  const refresh = () => {
    const ctx = context();
    const bits = [ctx.session && ctx.session.replace(/^sessions\//, ''), ctx.seed && `seed ${ctx.seed}`, Number.isFinite(ctx.event) && `event ${ctx.event}`].filter(Boolean);
    $('#sgCtxWhat').textContent = bits.length ? bits.join(' · ') : 'nothing loaded yet';
    $('#sgCtx').disabled = !bits.length;
    const c = compose(fields());
    $('#sgOpen').href = c.url;
    $('#sgPreTitle').textContent = c.title;
    $('#sgPreBody').textContent = c.body;
    $('#sgPreGh').textContent = c.gh;
    $('#sgPreCurl').textContent = c.curl;
    const empty = !String(fields().note).trim();
    $('#sgOpen').classList.toggle('off', empty);
    $('#sgStatus').textContent = empty ? 'Write something first; the buttons stay live either way.'
      : c.tooLong ? 'Long enough that a link may be truncated by the browser — use the gh or curl command instead.' : '';
    store?.set('latent.suggest', { who: fields().who, route: fields().route, model: fields().model });
    return c;
  };
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); $('#sgStatus').textContent = `${what} copied.`; }
    catch { $('#sgStatus').textContent = `Could not reach the clipboard — the text is under “the exact text” below.`; $('#sgPeek').open = true; }
  };
  for (const id of ['sgWho', 'sgRoute', 'sgKind', 'sgModel', 'sgTitle', 'sgNote', 'sgCtx']) el.querySelector(`#${id}`).addEventListener('input', refresh);
  $('#sgCopyGh').addEventListener('click', () => copy(refresh().gh, 'gh command'));
  $('#sgCopyCurl').addEventListener('click', () => copy(refresh().curl, 'curl command'));
  $('#sgCopyJson').addEventListener('click', () => copy(refresh().json, 'JSON'));
  $('#sgOpen').addEventListener('click', refresh); // the href must be current at the moment of the click
  refresh();
}
