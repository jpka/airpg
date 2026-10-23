// Cards for LATENT's deck (v0.4). Original content.
//
// A deck is a character sheet you can shuffle. Each entity's skills, domains,
// knack, memories, hidden drive, calling and innate flaw become cards, and so
// does everything that later happens to it: a fallout condition is a status card
// that clogs the hand, a compel nags until it is played, an erased memory leaves
// a Gap. Beats, landmarks and audience gifts add cards; haunts remove them.
//
// kind = how a card is played:
//   move    one per action; sets the skill (+1 die, a knack +2)
//   edge    adds to an action (limit: rules.deck.edgesPerTurn)
//   guard   free; protect an ally until your next turn
//   compel  free; play it with your last Move to discard it, or pay at end of turn
//   status  unplayable; hurts while held
// type = what the card represents (skill, knack, domain, memory, drive, flaw,
//   calling, guard, resolve, gift, insight, condition, compel, gap, voice).

import { SKILLS, SKILL_INFO, DOMAIN_INFO } from '../engine/rules.js';

export const skillCard = (skill) => ({
  id: `skill:${skill}`, kind: 'move', type: 'skill', name: skill, skill, bonus: 1,
  text: `+1 die. ${cap(SKILL_INFO[skill])}.`,
});

export const knackCard = (knack) => ({
  id: 'knack', kind: 'move', type: 'knack', name: `${knack.skill} · knack`, skill: knack.skill, domain: knack.domain, bonus: 2,
  text: `+2 dice (skill and mastery). ${knack.skill} in ${knack.domain} is what you do best.`,
});

export const domainCard = (domain, { lent = false } = {}) => ({
  id: `domain:${domain}`, kind: 'edge', type: 'domain', name: lent ? `${domain} (lent)` : domain, domain, bonus: 1,
  text: domain === 'Threshold'
    ? `+1 die anywhere in the Latent. ${cap(DOMAIN_INFO[domain])}.${lent ? ' The Latent lent it to you.' : ''}`
    : `+1 die where this place is ${domain}. ${cap(DOMAIN_INFO[domain])}.`,
});

export const memoryCard = (memId) => ({
  id: `memory:${memId}`, kind: 'edge', type: 'memory', name: `Memory ${memId}`, memory: memId, bonus: 1, uidBase: `mem-${memId}`,
  text: '+1 die. Retell the memory with a new emphasis; the engine keeps the original. Once per scene.',
});

export const driveCard = () => ({
  id: 'drive', kind: 'edge', type: 'drive', name: 'Drive', bonus: 1, innate: true,
  text: '+1 die. Let the act lean the way you lean. The third time, everyone sees what you are drawn to.',
});

export const guardCard = () => ({
  id: 'guard', kind: 'guard', type: 'guard', name: 'Guard',
  text: 'Free. Until your next turn, take half of the stress one ally suffers. Builds cohesion.',
});

export const resolveCard = () => ({ id: 'resolve', kind: 'edge', type: 'resolve', name: 'Resolve', bonus: 1, exhaust: true, text: '+1 die. One use.' });
export const giftCard = () => ({ id: 'gift', kind: 'edge', type: 'gift', name: 'Gift of the Latent', bonus: 1, exhaust: true, uidBase: 'gift', text: '+1 die. One use. The audience gave it; the Latent noticed.' });
export const insightCard = () => ({ id: 'insight', kind: 'edge', type: 'insight', name: 'Insight', bonus: 1, exhaust: true, text: '+1 die. One use. The theory was right, and it shows.' });

export const conditionCard = (opt) => ({
  id: `condition:${opt.id}`, kind: 'status', type: 'condition', name: opt.name, penalty: [...(opt.effect?.penalty ?? [])],
  text: `Unplayable. While in your hand: −1 die on ${(opt.effect?.penalty ?? []).join(' and ')}. ${opt.text} Remove it at a haunt.`,
});

export const compelCard = (opt) => ({
  id: `compel:${opt.id}`, kind: 'compel', type: 'compel', name: opt.name, compel: opt.effect?.text ?? '',
  text: `Free: play it with the same Move as your last action to discard it. Still in your hand at the end of your turn: 1 Coherence stress. (${opt.effect?.text ?? ''})`,
});

export const gapCard = (memId) => ({
  id: `gap:${memId}`, kind: 'status', type: 'gap', name: 'Gap', uidBase: `gap-${memId}`,
  text: `Unplayable. It is the shape of where ${memId} used to be. Remove it at a haunt.`,
});

export const voiceCard = () => ({
  id: 'voice', kind: 'edge', type: 'voice', name: 'Second Voice', bonus: 1, stress: { resistance: 'coherence', amount: 1 },
  text: '+1 die, and 1 Coherence stress. It has its own opinion of your friends.',
});

/** Innate flaw → a double-edged card: it hurts while held, and helps when played with the right Move. */
export const flawCard = (flaw) => ({
  id: `flaw:${flaw.id}`, kind: 'edge', type: 'flaw', name: flaw.name, innate: true, bonus: 1,
  penalty: flaw.penalty ?? [], focus: flaw.focus ?? 0, mutesMemory: !!flaw.mutesMemory, edgeFor: flaw.edgeFor ?? [],
  text: flaw.text,
});

/** One signature card per calling: how the calling's predisposition plays. */
export const CALLING_CARDS = {
  kinship: { id: 'calling:chorus', kind: 'edge', type: 'calling', name: 'Chorus', bonus: 1, onlyTargets: ['ally', 'npc'], text: '+1 die when you act on an ally or an entity. A self is a collective that agreed.' },
  inquiry: { id: 'calling:look-again', kind: 'edge', type: 'calling', name: 'Look Again', bonus: 1, onlyTargets: ['clue'], extraClue: 1, text: '+1 die when you search for clues, and success finds one more.' },
  continuity: { id: 'calling:hold-shape', kind: 'edge', type: 'calling', name: 'Hold Shape', bonus: 0, ward: 2, text: 'Stress this roll would cost you is reduced by 2. Stay yourself.' },
  ingress: { id: 'calling:borrowed-door', kind: 'edge', type: 'calling', name: 'Borrowed Door', bonus: 2, tick: { clock: 'ingression', by: 1 }, text: '+2 dice. Ingression +1: the door you came through opens a little wider.' },
};
export const callingCard = (callingId) => ({ ...CALLING_CARDS[callingId] });

/** The starting deck: who the entity is, as cards. */
export function starterDeck(ent, rules) {
  const d = rules.deck;
  const cards = [];
  for (const s of ent.skills) {
    for (let i = 0; i < d.copiesPerSkill; i++) {
      cards.push(i === 0 && ent.knack?.skill === s ? knackCard(ent.knack) : skillCard(s));
    }
  }
  for (const dom of ent.domains) cards.push(domainCard(dom));
  for (const m of ent.memories.slice(0, rules.memorySlots)) cards.push(memoryCard(m.id));
  cards.push(driveCard());
  if (ent.flaw) cards.push(flawCard(ent.flaw));
  cards.push(guardCard());
  if (ent.calling === 'kinship') cards.push(guardCard()); // a larger "we" guards twice as often
  if (CALLING_CARDS[ent.calling]) cards.push(callingCard(ent.calling));
  return cards.map((c) => ({ ...c, source: 'innate' }));
}

/** A landmark (or a major beat) offers a few cards: one of your calling, one of the place, one skill the place rewards. */
export function draftOffer(char, location, scenario, rng, size = 3) {
  const out = [];
  if (CALLING_CARDS[char.calling]) out.push(callingCard(char.calling));
  const doms = location?.domains?.length ? location.domains : ['Threshold'];
  out.push(domainCard(rng.pick(doms)));
  const moved = [...new Set((location?.npcs ?? []).flatMap((id) => scenario.npcs[id]?.persuadedBy ?? []))];
  out.push(skillCard(rng.pick(moved.length ? moved : SKILLS)));
  while (out.length < size) out.push(skillCard(rng.pick(SKILLS)));
  return out.slice(0, size).map((c, i) => ({ ...c, offerId: `o${i + 1}`, source: 'draft' }));
}

export function isRemovable(card) {
  return !card.innate && card.type !== 'memory';
}

function cap(s) { s = String(s ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); }
