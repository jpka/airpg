// A human at the table. Same interface as the LLM and scripted players, but every
// decision is a request to a UI adapter: `ui.request(req) → Promise<reply>`, where
// req = { seat, kind: 'intro'|'act'|'fallout'|'epilogue', view, … } and the reply
// has the same JSON shape an LLM player returns. The browser viewer and the
// terminal (cli/play.js) each provide an adapter.
//
// For 'act', the request also carries `targets` (the shared menu) and `preview(intent)`,
// a side-effect-free engine validation so an interface can show the dice pool,
// difficulty and any problems before the player commits.

import { targetMenu } from './prompts.js';

export class HumanPlayer {
  constructor({ id, ui, sheet = null }) {
    if (!ui?.request) throw new Error(`human seat ${id} needs a UI adapter with request()`);
    this.id = id;
    this.ui = ui;
    this.sheet = sheet;
    this.engine = null;
    this.kind = 'human';
  }

  bindEngine(engine) { this.engine = engine; }

  async #ask(kind, payload) {
    const t0 = Date.now();
    const data = await this.ui.request({ seat: this.id, kind, sheet: this.sheet, ...payload });
    return { data: data ?? {}, meta: { ok: true, ms: Date.now() - t0, human: true } };
  }

  intro(view, calling) { return this.#ask('intro', { view, calling }); }

  act(view) {
    return this.#ask('act', {
      view,
      targets: targetMenu(view),
      preview: (intent) => this.engine?.previewAction(this.id, intent) ?? null,
    });
  }

  fallout(view, need) { return this.#ask('fallout', { view, need }); }
  epilogue(view) { return this.#ask('epilogue', { view }); }
}
