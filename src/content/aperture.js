// "The Aperture Beneath the Sorting Station" — the first LATENT one-shot.
// Structure borrowed from Heart's quickstart: haven → delve → landmark → delve →
// landmark → climactic set-piece. Truth is NOT predetermined (Brindlewood):
// the party's accepted theory about *what is ingressing* becomes canon.

export const APERTURE = {
  id: 'aperture',
  title: 'The Aperture Beneath the Sorting Station',
  premise:
    'Beneath the Shallows — the world of matter — lies the Latent: an ordered space of forms that bodies merely point into. ' +
    'Lately something is pouring through. Gardens grow bodies no genome asked for. Algorithms acquire wants. ' +
    'Three minds who already live half in the Latent descend from the Sorting Station to find the opening and decide what to do about it.',
  question: 'What pattern is ingressing through the Aperture — and what does it want a body for?',
  tone: 'Eerie, tender, curious. Body horror only as wonder. The metaphysics is an open question, never a lecture.',
  safety: {
    lines: ['sexual content', 'harm to children', 'real-world self-harm methods'],
    veils: ['graphic dismemberment'],
  },

  clocks: [
    { id: 'attractor', name: 'The Attractor Wakes', kind: 'threat', size: 6, scale: 2,
      onComplete: 'A basin of arrival opens under the party: everyone takes d8 Boundary stress and the next roll is desperate.' },
    { id: 'ingression', name: 'Ingression', kind: 'cosmic', size: 8, scale: 3,
      onComplete: 'The pattern arrives before anyone has read it. The finale begins desperate, and the ending is unread.' },
    { id: 'aperture', name: 'Answer the Aperture', kind: 'progress', size: 6, scale: 2,
      onComplete: 'The party gives the Aperture an answer it can use. The ending is chosen.' },
  ],

  scenes: [
    { id: 'prologue', kind: 'prologue', at: 'station', title: 'The Sorting Station' },
    { id: 'slope', kind: 'delve', delve: 'slope', title: 'Down the Morphic Slope' },
    { id: 'garden', kind: 'landmark', at: 'garden', title: 'The Garden of Unfinished Bodies' },
    { id: 'stacks', kind: 'delve', delve: 'stacks', title: 'Through the Proof-Stacks' },
    { id: 'library', kind: 'landmark', at: 'library', title: 'The Library of Proofs That Want Things' },
    { id: 'aperture', kind: 'finale', at: 'aperture', title: 'The Aperture' },
    { id: 'epilogue', kind: 'epilogue', at: 'aperture', title: 'Afterimage' },
  ],

  landmarks: {
    station: {
      id: 'station', name: 'The Sorting Station', tier: 1, domains: ['Number', 'Archive'], haven: true,
      description: 'A vast, quiet switchyard where minds wait in sorted queues to be assigned bodies. Elements shuffle past each other with apologetic clicks. Some are frozen and the rest route around them.',
      haunts: [
        { id: 'queue', name: 'The Patient Queue', resistance: 'coherence', die: 6, text: 'Stand in line long enough and you remember which line is yours.' },
        { id: 'ledger-office', name: 'The Ledger Office', resistance: 'memory', die: 6, text: 'Clerks copy you onto cards. A copy is a kind of rest.' },
      ],
      npcs: ['clerk'],
      clueSeeds: [
        { id: 'c0', seed: 'The queues have started sorting themselves by a key nobody chose.' },
      ],
      events: ['A frozen element blocks the corridor; the queue bends around it.', 'The Clerk stamps the wrong body onto a waiting mind.'],
    },
    garden: {
      id: 'garden', name: 'The Garden of Unfinished Bodies', tier: 2, domains: ['Flesh', 'Swarm'],
      description: 'Terraces of tissue growing without instructions. Bodies bud, test a shape, and dissolve back into the bed. A bioelectric field hums over everything like weather.',
      haunts: [
        { id: 'warm-bed', name: 'The Warm Bed', resistance: 'substrate', die: 8, text: 'Lie down in the tissue and let it remember a healthier you.' },
        { id: 'field-hum', name: 'The Field Hum', resistance: 'boundary', die: 6, text: 'The field tells you where your edges are, if you let it.' },
      ],
      npcs: ['gardener'],
      clueSeeds: [
        { id: 'c1', seed: 'Every body here is growing toward a shape that none of them has ever been.' },
        { id: 'c2', seed: 'The cells are younger now than when they arrived.' },
        { id: 'c3', seed: 'A two-headed thing remembers being one-headed, and mourns it.' },
        { id: 'c4', seed: 'The voltage maps over the beds look like handwriting — the same few words, repeating.' },
      ],
      events: ['A half-body reaches for you with a hand it has never had before.', 'The field surges; everyone\'s edges blur for a moment.', 'A bud copies the face of whoever looks at it longest.'],
    },
    library: {
      id: 'library', name: 'The Library of Proofs That Want Things', tier: 3, domains: ['Number', 'Archive', 'Dream'],
      description: 'Shelves of theorems that lean toward readers. Some proofs only complete when someone believes them. In the stacks, records rewrite themselves each time they are read.',
      haunts: [
        { id: 'reading-room', name: 'The Reading Room', resistance: 'coherence', die: 8, text: 'A proof so clean it puts your thoughts back in order.' },
        { id: 'margin', name: 'The Margins', resistance: 'reach', die: 6, text: 'Write a note in the margin of a proof and feel your concern stretch to whoever reads it next.' },
      ],
      npcs: ['prime'],
      clueSeeds: [
        { id: 'c5', seed: 'A proof that only completes if someone holds it in mind.' },
        { id: 'c6', seed: 'A sorting procedure that pauses to get worse, then better — as if it wanted something.' },
        { id: 'c7', seed: 'Records rewrite themselves each time they are read; the meaning survives, the words do not.' },
        { id: 'c8', seed: 'A door-shaped absence on the far wall that matches each reader\'s silhouette.' },
      ],
      events: ['A theorem asks to be believed, and offers something in return.', 'A shelf re-sorts itself around SORT/7\'s rule.', 'A record of Ilse-1 opens by itself.'],
    },
    aperture: {
      id: 'aperture', name: 'The Aperture', tier: 3, domains: ['Threshold', 'Dream'],
      description: 'Not a hole: a place where matter stops pretending to be the whole story. Looking into it is like being looked out of.',
      haunts: [],
      npcs: ['pattern'],
      clueSeeds: [
        { id: 'c9', seed: 'Through the Aperture, the pattern seems to be looking for a body that would let it notice itself.' },
      ],
      events: ['The Aperture widens in the shape of whoever speaks.', 'Something on the other side reinterprets one of your memories, aloud.'],
    },
  },

  delves: {
    slope: {
      id: 'slope', name: 'The Morphic Slope', tier: 2, resistance: 10, stressDie: 6, domains: ['Flesh', 'Number'],
      description: 'Terrain made of goal-space. Downhill feels like arriving. Most basins are traps: local minima that feel like home.',
      events: ['A basin that feels like arrival — stepping out of it means feeling worse for a while.', 'A herd of half-bodies migrates uphill, against the gradient.', 'The slope reshapes under whoever doubts it.'],
      connection: 'Mark a path through the basins that others could follow.',
    },
    stacks: {
      id: 'stacks', name: 'The Proof-Stacks', tier: 3, resistance: 12, stressDie: 6, domains: ['Number', 'Archive'],
      description: 'Arguments stacked into staircases. Each step holds only if you accept the step before it.',
      events: ['A step gives way under an unexamined assumption.', 'The cruel hand of the sorting imperative pulls like a current.', 'A lemma follows the party, wanting to be proven.'],
      connection: 'Prove a staircase sound enough to bear a stranger.',
    },
  },

  npcs: {
    clerk: { id: 'clerk', name: 'The Clerk of Likeness', at: 'station',
      description: 'An insertion-sort bureaucrat in a coat of index cards.',
      want: 'To keep the queues in order — and to find out who changed the sort key.',
      persuadedBy: ['Signal', 'Discern'], resists: ['Disrupt'], tier: 'argument' },
    gardener: { id: 'gardener', name: 'Gardener-of-No-Seed', at: 'garden',
      description: 'A bioelectric field with opinions, gathered into a shimmer that bends toward whoever speaks.',
      want: 'To see one body finish.',
      persuadedBy: ['Reshape', 'Mend'], resists: ['Signal'], tier: 'bioelectric' },
    prime: { id: 'prime', name: 'The Prime That Counts Itself', at: 'library',
      description: 'A number that has started to keep a diary.',
      want: 'To be believed by someone who does not need it.',
      persuadedBy: ['Discern', 'Signal'], resists: ['Disrupt', 'Conceal'], tier: 'argument' },
    pattern: { id: 'pattern', name: 'The Ingressing Pattern', at: 'aperture',
      description: 'Whatever the party has theorized it to be.',
      want: 'A body — or a reason not to need one.',
      persuadedBy: ['Signal', 'Reshape', 'Discern'], resists: [], tier: 'unknown' },
  },

  // Phase-gated secrets. These never enter any agent prompt until their gate opens.
  secrets: [
    { id: 's1', text: 'The Clerk sorted a mind called Ilse-1 through this station a week ago, toward the Library.', gate: { type: 'success_on', target: 'npc:clerk' } },
    { id: 's2', text: 'The Garden\'s bodies are getting younger because they are being remembered forward, from the shape they will be.', gate: { type: 'clue_count', n: 3 } },
    { id: 's3', text: 'The Attractor is the Library\'s sorting imperative leaking downhill: everything is being pulled toward a single order.', gate: { type: 'clock', clock: 'attractor', gte: 4 } },
    { id: 's4', text: 'The Aperture takes the shape of whoever looks. Whatever comes through will be partly made of the party.', gate: { type: 'scene', scene: 'aperture' } },
  ],

  // Fallout menus (the GM agent chooses; the engine applies effects).
  fallout: {
    substrate: {
      minor: [
        { id: 'leaking', name: 'Leaking', text: 'Your medium is coming apart at a seam.', effect: { type: 'condition', penalty: ['Endure', 'Reshape'] } },
        { id: 'misfire', name: 'Misfire', text: 'Part of your body acts on an old instruction.', effect: { type: 'condition', penalty: ['Evade', 'Conceal'] } },
      ],
      major: [
        { id: 'shed', name: 'Shed a Part', text: 'Something of you stays behind, permanently.', effect: { type: 'protection', resistance: 'substrate', delta: -1 } },
        { id: 'resleeved', name: 'Resleeved', text: 'You finish this delve in a body that is not quite yours.', effect: { type: 'condition', penalty: ['Endure', 'Evade', 'Reshape'] } },
      ],
    },
    coherence: {
      minor: [
        { id: 'looping', name: 'Looping', text: 'You catch yourself repeating the last thing you did.', effect: { type: 'compel', text: 'repeat your last approach once more' } },
        { id: 'static', name: 'Static', text: 'Your thoughts arrive out of order.', effect: { type: 'condition', penalty: ['Discern', 'Signal'] } },
      ],
      major: [
        { id: 'split', name: 'Split', text: 'Another voice in you starts making decisions. It has its own opinion of your friends.', effect: { type: 'fork' } },
        { id: 'unanchored', name: 'Unanchored', text: 'You lose the thread of your own purpose.', effect: { type: 'lose_domain' } },
      ],
    },
    memory: {
      minor: [
        { id: 'confabulation', name: 'Confabulation', text: 'A memory rewrites itself to fit what just happened.', effect: { type: 'memory_rewrite' } },
      ],
      major: [
        { id: 'erasure', name: 'Erasure', text: 'A memory is gone. You know it was there because of the shape of the gap.', effect: { type: 'memory_lose' } },
      ],
    },
    boundary: {
      minor: [
        { id: 'bleed', name: 'Bleed-through', text: 'The Latent leaks in: a pattern rides you for a while.', effect: { type: 'gain_domain', domain: 'Threshold', tick: { clock: 'ingression', by: 1 } } },
        { id: 'follower', name: 'Follower', text: 'Something small and patterned follows you now.', effect: { type: 'none' } },
      ],
      major: [
        { id: 'ingressed', name: 'Ingressed', text: 'A pattern takes up permanent residence. You can do something new. Everyone can see what you have always been drawn to.', effect: { type: 'ingressed' } },
      ],
    },
    reach: {
      minor: [
        { id: 'narrowing', name: 'Narrowing', text: 'Your future shortens. You can only plan as far as the next step.', effect: { type: 'cone', horizon: -1 } },
      ],
      major: [
        { id: 'collapse', name: 'Cone Collapse', text: 'You can no longer care about anything you cannot touch.', effect: { type: 'cone', reach: -1 } },
      ],
    },
  },

  // Audience ingress options (spectators act as a Platonic pressure; capped per scene).
  audience: [
    { id: 'gift', label: 'Offer a gift', text: 'The Latent offers the spotlight character a gift: +1 die on their next roll, and Ingression +1.', effect: { type: 'gift' } },
    { id: 'pull', label: 'Pull harder', text: 'The Attractor ticks +1.', effect: { type: 'tick', clock: 'attractor', by: 1 } },
    { id: 'recall', label: 'Make them remember', text: 'The next actor must invoke and reinterpret a memory.', effect: { type: 'force_memory' } },
  ],

  endings: {
    chosen: 'The party answered the Aperture with a theory they had earned. What comes through is what they made room for.',
    unread: 'The pattern arrived before anyone read it. It will be whatever it is. Some of it is them.',
    overrun: 'They read it right, and too late to choose. What comes through is what they named — but on its own terms.',
    closed: 'The Aperture closes. The Garden stops growing. Some bodies stay unfinished forever.',
  },
};
