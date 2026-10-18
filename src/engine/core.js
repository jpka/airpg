// LATENT engine primitives: seeded RNG, dice, clocks, small text utils.
// Everything here is deterministic given a seed. No LLM ever touches these.

/** mulberry32 — tiny, fast, good-enough PRNG. State is a single uint32. */
export function createRng(seed) {
  let s = hashSeed(seed) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    die: (sides) => 1 + Math.floor(next() * sides),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    get state() { return s; },
    set state(v) { s = v >>> 0; },
  };
}

export function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  const str = String(seed ?? 'latent');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Clocks (Blades-style progress clocks) ----------

/**
 * @typedef {Object} Clock
 * @property {string} id
 * @property {string} name
 * @property {'delve'|'threat'|'progress'|'cosmic'} kind
 * @property {number} size      segments
 * @property {number} value     filled segments
 * @property {number} scale     1 local, 2 regional, 3 cosmic — light-cone visibility
 * @property {string} onComplete   what happens when it fills (visible with enough Horizon)
 * @property {boolean} done
 */
export function makeClock(def) {
  return {
    id: def.id,
    name: def.name,
    kind: def.kind ?? 'progress',
    size: def.size ?? 6,
    value: def.value ?? 0,
    scale: def.scale ?? 1,
    onComplete: def.onComplete ?? '',
    done: false,
  };
}

export function tickClock(clock, by) {
  const before = clock.value;
  clock.value = Math.max(0, Math.min(clock.size, clock.value + by));
  const completed = !clock.done && clock.value >= clock.size;
  if (completed) clock.done = true;
  return { before, after: clock.value, completed, delta: clock.value - before };
}

// ---------- Text utils used by engine + reviewer ----------

export function words(text) {
  return String(text ?? '').toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function jaccard(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export const deepClone = (o) => JSON.parse(JSON.stringify(o));
