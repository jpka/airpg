// Deck mechanics: zones, draws, shuffles. Pure data operations; the engine owns
// the RNG and emits the events. A deck is { draw, hand, discard, exhaust, removed }
// plus bookkeeping (the draft offer on the table and any queued behind it, last Move played, Drive plays).

export function makeDeck() {
  return { draw: [], hand: [], discard: [], exhaust: [], removed: [], uids: [], offer: null, offers: [], lastMove: null, drivePlays: 0 };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';

/** Add a card. zone: 'draw' (shuffled in), 'top' (next draw), 'hand', 'discard'. */
export function addCard(deck, def, zone, rng) {
  const base = slug(def.uidBase ?? def.name);
  let uid = base;
  for (let n = 2; deck.uids.includes(uid); n++) uid = `${base}-${n}`;
  deck.uids.push(uid);
  const card = { ...def, uid };
  delete card.offerId;
  if (zone === 'draw' && rng && deck.draw.length) deck.draw.splice(rng.int(0, deck.draw.length), 0, card);
  else if (zone === 'top' || zone === 'draw') deck.draw.unshift(card);
  else deck[zone].push(card);
  return card;
}

export function shuffleInto(deck, rng) {
  deck.draw = rng.shuffle(deck.draw);
}

/** Draw up to n cards; reshuffles the discard pile when the draw pile runs out. */
export function drawUpTo(deck, n, rng) {
  let reshuffled = false;
  const drawn = [];
  while (deck.hand.length < n) {
    if (!deck.draw.length) {
      if (!deck.discard.length) break;
      deck.draw = rng.shuffle(deck.discard);
      deck.discard = [];
      reshuffled = true;
    }
    const c = deck.draw.shift();
    deck.hand.push(c);
    drawn.push(c);
  }
  return { drawn, reshuffled };
}

export function discardHand(deck) {
  const out = deck.hand.filter((c) => !c.retain);
  deck.hand = deck.hand.filter((c) => c.retain);
  deck.discard.push(...out);
  return out;
}

const ZONES = ['hand', 'draw', 'discard'];

export function findCard(deck, uid, zones = ZONES) {
  for (const z of zones) {
    const c = deck[z].find((k) => k.uid === uid);
    if (c) return { card: c, zone: z };
  }
  return null;
}

/** Move a card out of its zone into `to` ('discard', 'exhaust', 'removed', …). */
export function moveCard(deck, uid, to) {
  for (const z of ZONES) {
    const i = deck[z].findIndex((k) => k.uid === uid);
    if (i >= 0) { const [c] = deck[z].splice(i, 1); deck[to].push(c); return c; }
  }
  return null;
}

export function cardsInPlay(deck) {
  return [...deck.hand, ...deck.draw, ...deck.discard];
}

/** Effects of cards that sit in your hand without being played (flaws, conditions). */
export function heldEffects(cards) {
  const penalty = {};
  let focus = 0, mutesMemory = false;
  for (const c of cards) {
    for (const s of c.penalty ?? []) penalty[s] = (penalty[s] ?? 0) + 1;
    focus += c.focus ?? 0;
    if (c.mutesMemory) mutesMemory = true;
  }
  return { penalty, focus, mutesMemory };
}

/** The public face of a card, as events and views carry it. */
export function pubCard(c) {
  if (!c) return null;
  const out = { uid: c.uid, id: c.id, name: c.name, kind: c.kind, type: c.type, text: c.text };
  for (const k of ['bonus', 'skill', 'domain', 'memory', 'penalty', 'edgeFor', 'exhaust', 'innate', 'source', 'onlyTargets', 'ward', 'focus', 'mutesMemory']) {
    if (c[k] !== undefined && !(Array.isArray(c[k]) && !c[k].length) && c[k] !== 0 && c[k] !== false) out[k] = c[k];
  }
  if (c.offerId) out.offerId = c.offerId;
  return out;
}
