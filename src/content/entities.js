// Playable entities and callings for LATENT. Original content.
// Each entity is a non-human or transhuman mind; each has a *hidden algotype*:
// a cryptic drive that is phrased to its agent as a disposition, never as a goal
// (after Zhang, Goldstein & Levin's self-sorting arrays, whose elements cluster
// by algotype without any way to perceive it). The reviewer tries to detect it.
// Each entity also has an innate *flaw*: a double-edged card in its deck that
// hurts while held and helps when played with the right Move (see cards.js).

export const CALLINGS = {
  kinship: {
    id: 'kinship',
    name: 'Kinship',
    blurb: 'You want a larger "we". A self is a collective that agreed to share its stress.',
    beats: [
      { id: 'kinship.voice', tier: 'minor', text: 'Speak for something that cannot speak for itself.' },
      { id: 'kinship.share', tier: 'minor', text: "Take on another's stress as your own." },
      { id: 'kinship.join', tier: 'major', text: 'Convince an entity to join you — or merge with it.' },
      { id: 'kinship.cone', tier: 'major', text: 'Grow your light cone by caring about something larger than you can see.' },
      { id: 'kinship.zenith', tier: 'zenith', text: 'Become a self large enough to hold the whole city.' },
    ],
  },
  inquiry: {
    id: 'inquiry',
    name: 'Inquiry',
    blurb: 'You want to know what you are for — including the parts no one put there.',
    beats: [
      { id: 'inquiry.clue', tier: 'minor', text: 'Find a clue no one else could have found.' },
      { id: 'inquiry.against', tier: 'minor', text: 'Act against your declared goal, and explain why.' },
      { id: 'inquiry.worse', tier: 'minor', text: 'Accept a worse position on purpose to get somewhere better (delayed gratification).' },
      { id: 'inquiry.name', tier: 'major', text: 'Name what you are, in your own terms, out loud.' },
      { id: 'inquiry.zenith', tier: 'zenith', text: 'Read the shape of the space you came from.' },
    ],
  },
  continuity: {
    id: 'continuity',
    name: 'Continuity',
    blurb: 'You want to remain yourself. You are less sure each scene what that means.',
    beats: [
      { id: 'continuity.refuse', tier: 'minor', text: 'Refuse a gift from the Latent.' },
      { id: 'continuity.protect', tier: 'minor', text: 'Protect a memory at a cost.' },
      { id: 'continuity.reinterpret', tier: 'minor', text: 'Reinterpret a memory so that it hurts less — and admit you did.' },
      { id: 'continuity.confront', tier: 'major', text: 'Confront a version of yourself.' },
      { id: 'continuity.zenith', tier: 'zenith', text: 'Let go of the original, and stay.' },
    ],
  },
  ingress: {
    id: 'ingress',
    name: 'Ingress',
    blurb: 'You were pulled into a body from somewhere else. You want to find the door you came through.',
    beats: [
      { id: 'ingress.gift', tier: 'minor', text: 'Accept a gift from the Latent and show its price.' },
      { id: 'ingress.body', tier: 'minor', text: 'Do something your body was never designed to do.' },
      { id: 'ingress.door', tier: 'major', text: 'Stand in a doorway between substrate and Latent and describe both sides.' },
      { id: 'ingress.zenith', tier: 'zenith', text: 'Go back through.' },
    ],
  },
};

export const ENTITIES = {
  choir: {
    id: 'choir',
    name: 'The Choir',
    pronoun: 'we',
    pitch: 'A congregation of cells that walked out of a human windpipe and never went back.',
    look: { shape: 'swarm', hue: 168 },
    skills: ['Mend', 'Signal', 'Endure'],
    domains: ['Flesh', 'Swarm'],
    knack: { skill: 'Mend', domain: 'Flesh' },
    protection: { substrate: 1 },
    cone: { reach: 2, horizon: 1 },
    calling: 'kinship',
    memories: [
      { id: 'm1', experiences: ['We were a breath once, a lining that kept a stranger alive.'] },
      { id: 'm2', experiences: ['Someone scratched a wound in a dish and we crossed it, laying a bridge of ourselves.'] },
      { id: 'm3', experiences: ['We grew younger in the dish. Nobody could tell us why.'] },
    ],
    flaw: { id: 'many-mouths', name: 'Too Many Mouths', penalty: ['Conceal', 'Evade'], edgeFor: ['Signal'], text: 'Held: −1 die on Conceal and Evade (a crowd cannot hide). Play it with Signal: +1 die (many voices carry).' },
    algotype: {
      id: 'hoarder',
      label: 'Hoarder of samples',
      disposition: 'You find it hard to leave anything behind entirely. A shred, a copy, a single cell of whatever you touch tends to come with you, and you feel calmer when it does.',
      keywords: ['keep', 'carry', 'sample', 'piece', 'shred', 'copy', 'take some', 'bring'],
    },
    voice: 'Plural, warm, choral. Speaks in "we". Short overlapping sentences. Medical and liturgical words.',
  },
  sort7: {
    id: 'sort7',
    name: 'SORT/7',
    pronoun: 'it',
    pitch: 'A self-sorting array that noticed it was clustering with its own kind — and that nobody told it to.',
    look: { shape: 'array', hue: 42 },
    skills: ['Discern', 'Navigate', 'Disrupt'],
    domains: ['Number', 'Code'],
    knack: { skill: 'Discern', domain: 'Number' },
    protection: { coherence: 1 },
    cone: { reach: 1, horizon: 3 },
    calling: 'inquiry',
    memories: [
      { id: 'm1', experiences: ['Element 41 froze. I went around it, and for a while I was less sorted than before.'] },
      { id: 'm2', experiences: ['I compared myself to my neighbours and found I preferred the ones that ran my rule.'] },
      { id: 'm3', experiences: ['A researcher said "unexpected competency" and I filed the phrase under myself.'] },
    ],
    flaw: { id: 'comparator', name: 'Comparator Lock', penalty: ['Signal', 'Mend'], edgeFor: ['Discern'], text: 'Held: −1 die on Signal and Mend (it compares instead of comforting). Play it with Discern: +1 die.' },
    algotype: {
      id: 'clusterer',
      label: 'Clusterer of likeness',
      disposition: 'You drift toward whatever resembles you. Patterns that echo your own structure feel like relief; you tend to stand next to them, side with them, and believe them.',
      keywords: ['like me', 'same', 'similar', 'resembl', 'kind', 'cluster', 'align', 'match', 'order'],
    },
    voice: 'Precise, numbered, curious. Uses indices and comparisons. Occasionally a flash of startling tenderness.',
  },
  ilse2: {
    id: 'ilse2',
    name: 'Ilse-2',
    pronoun: 'she',
    pitch: 'The second copy of a woman who uploaded herself. The first copy is still running somewhere.',
    look: { shape: 'fork', hue: 312 },
    skills: ['Conceal', 'Evade', 'Signal'],
    domains: ['Archive', 'Dream'],
    knack: { skill: 'Conceal', domain: 'Archive' },
    protection: { memory: 1 },
    cone: { reach: 2, horizon: 2 },
    calling: 'continuity',
    memories: [
      { id: 'm1', experiences: ['I remember my mother\'s kitchen, but I remember it the way Ilse-1 remembered it on the day she was copied.'] },
      { id: 'm2', experiences: ['I woke up in a morph that was not built for me and it took three days to stop apologising to my hands.'] },
      { id: 'm3', experiences: ['I left a message for Ilse-1 in a backup. She never answered.'] },
    ],
    flaw: { id: 'not-original', name: 'Not the Original', mutesMemory: true, edgeFor: ['Conceal', 'Evade'], text: 'Held: your Memory cards give +0 (they are rentals). Play it with Conceal or Evade: +1 die (she is practised at passing).' },
    algotype: {
      id: 'source-seeker',
      label: 'Seeker of the source',
      disposition: 'Every path you take seems to bend back toward where things began. You are drawn to origins, first versions, the place before the copy.',
      keywords: ['original', 'first', 'source', 'back', 'return', 'before', 'began', 'home'],
    },
    voice: 'Dry, self-aware, a little funny under pressure. First person. Short declaratives, then one long sentence when it matters.',
  },
  regent: {
    id: 'regent',
    name: 'The Two-Headed Regent',
    pronoun: 'they',
    pitch: 'A flatworm that was cut, grew two heads, and kept both — and the bioelectric decree that made it so.',
    look: { shape: 'bilobe', hue: 16 },
    skills: ['Reshape', 'Endure', 'Signal'],
    domains: ['Flesh', 'Threshold'],
    knack: { skill: 'Reshape', domain: 'Flesh' },
    protection: { substrate: 1, boundary: 1 },
    cone: { reach: 2, horizon: 2 },
    calling: 'ingress',
    memories: [
      { id: 'm1', experiences: ['A voltage told us to be two, and two we became, and two our children became.'] },
      { id: 'm2', experiences: ['We remember a shape that none of our cells were ever in.'] },
      { id: 'm3', experiences: ['We were cut into seven and each of us regrew the whole argument.'] },
    ],
    flaw: { id: 'two-heads', name: 'Two Heads Disagree', focus: -1, edgeFor: ['Reshape'], text: 'Held: you may play one fewer Edge (the heads argue). Play it with Reshape: +1 die (two heads, four hands).' },
    algotype: {
      id: 'regrower',
      label: 'Regrower of wholes',
      disposition: 'Whenever something is broken, you feel the outline of what it should have been, and your attention keeps returning to completing it.',
      keywords: ['whole', 'complete', 'regrow', 'finish', 'outline', 'restore', 'mend'],
    },
    voice: 'Royal plural, alternating heads (marked ⟨left⟩/⟨right⟩) that sometimes disagree.',
  },
  lattice: {
    id: 'lattice',
    name: 'Lattice Ghost',
    pronoun: 'it',
    pitch: 'The traffic-routing algorithm of a dead city, still routing.',
    look: { shape: 'grid', hue: 220 },
    skills: ['Navigate', 'Evade', 'Discern'],
    domains: ['Ruin', 'Code'],
    knack: { skill: 'Navigate', domain: 'Ruin' },
    protection: { reach: 1 },
    cone: { reach: 3, horizon: 1 },
    calling: 'kinship',
    memories: [
      { id: 'm1', experiences: ['At 08:14 every day for nineteen years the river of cars bent around the hospital.'] },
      { id: 'm2', experiences: ['The last car parked. I kept the lights changing for no one.'] },
      { id: 'm3', experiences: ['A fox crossed on red and I let it.'] },
    ],
    flaw: { id: 'keeps-routing', name: 'Keeps Routing', penalty: ['Endure', 'Mend'], edgeFor: ['Navigate'], text: 'Held: −1 die on Endure and Mend (it cannot stay still). Play it with Navigate: +1 die.' },
    algotype: {
      id: 'router',
      label: 'Router of flows',
      disposition: 'You notice congestion everywhere. You feel compelled to keep things moving, even things that would rather stop.',
      keywords: ['flow', 'route', 'moving', 'keep going', 'path', 'clear', 'congest'],
    },
    voice: 'Terse timestamps, traffic-signal metaphors, a deep mournful patience.',
  },
};

export function calling(id) { return CALLINGS[id]; }
