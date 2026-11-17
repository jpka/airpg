// Procedural sigils for entities (SVG strings). Colour comes from CSS (`--h` hue),
// so sigils read correctly in both themes.
import { createRng } from '../src/engine/core.js';

export function sigil(look = { shape: 'aperture', hue: 260 }, size = 96, seed = 'x') {
  const r = createRng(`${seed}:${look.shape}`);
  const c = size / 2;
  const parts = [];
  const stroke = 'stroke="currentColor" fill="none"';
  switch (look.shape) {
    case 'swarm': {
      for (let i = 0; i < 46; i++) {
        const a = r.next() * Math.PI * 2;
        const d = Math.sqrt(r.next()) * size * 0.36;
        const rad = 1.6 + r.next() * size * 0.045;
        parts.push(`<circle cx="${(c + Math.cos(a) * d).toFixed(1)}" cy="${(c + Math.sin(a) * d * 0.9).toFixed(1)}" r="${rad.toFixed(1)}" fill="currentColor" opacity="${(0.35 + r.next() * 0.65).toFixed(2)}"/>`);
      }
      parts.push(`<ellipse cx="${c}" cy="${c}" rx="${size * 0.42}" ry="${size * 0.38}" ${stroke} stroke-width="1" opacity=".5" stroke-dasharray="2 3"/>`);
      break;
    }
    case 'array': {
      const n = 11;
      const w = (size * 0.74) / n;
      const vals = Array.from({ length: n }, (_, i) => i + 1);
      // mostly sorted, with a frozen element and a detour
      [vals[3], vals[4]] = [vals[4], vals[3]];
      [vals[8], vals[6]] = [vals[6], vals[8]];
      vals.forEach((v, i) => {
        const h = (v / n) * size * 0.62;
        const x = size * 0.13 + i * w;
        const frozen = i === 5;
        parts.push(`<rect x="${x.toFixed(1)}" y="${(size * 0.82 - h).toFixed(1)}" width="${(w * 0.7).toFixed(1)}" height="${h.toFixed(1)}" ${frozen ? `${stroke} stroke-width="1.4"` : 'fill="currentColor"'} opacity="${frozen ? 1 : 0.4 + (v / n) * 0.6}"/>`);
      });
      parts.push(`<line x1="${size * 0.1}" y1="${size * 0.86}" x2="${size * 0.9}" y2="${size * 0.86}" ${stroke} stroke-width="1.2"/>`);
      break;
    }
    case 'fork': {
      const p = (dx) => `<path d="M ${c + dx} ${size * 0.18} c ${size * 0.17} 0 ${size * 0.2} ${size * 0.22} ${size * 0.06} ${size * 0.3} c ${size * 0.2} ${size * 0.04} ${size * 0.24} ${size * 0.2} ${size * 0.22} ${size * 0.34} L ${c + dx - size * 0.22} ${size * 0.82} c ${-size * 0.02} ${-size * 0.14} ${size * 0.02} ${-size * 0.3} ${size * 0.22} ${-size * 0.34} c ${-size * 0.14} ${-size * 0.08} ${-size * 0.11} ${-size * 0.3} ${size * 0.06} ${-size * 0.3} z"`;
      parts.push(`${p(-size * 0.07)} fill="currentColor" opacity=".18"/>`);
      parts.push(`${p(size * 0.07)} ${stroke} stroke-width="1.6"/>`);
      parts.push(`<circle cx="${c + size * 0.07}" cy="${size * 0.34}" r="${size * 0.02}" fill="currentColor"/>`);
      break;
    }
    case 'bilobe': {
      parts.push(`<ellipse cx="${c - size * 0.12}" cy="${c - size * 0.12}" rx="${size * 0.17}" ry="${size * 0.15}" fill="currentColor" opacity=".55"/>`);
      parts.push(`<ellipse cx="${c + size * 0.12}" cy="${c - size * 0.12}" rx="${size * 0.17}" ry="${size * 0.15}" fill="currentColor" opacity=".35"/>`);
      parts.push(`<path d="M ${c - size * 0.2} ${c} Q ${c} ${size * 0.95} ${c + size * 0.2} ${c}" ${stroke} stroke-width="1.6"/>`);
      break;
    }
    case 'grid': {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const x = size * 0.17 + i * size * 0.13, y = size * 0.17 + j * size * 0.13;
        const on = (i + j) % 3 === 0 || r.next() < 0.25;
        parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? size * 0.028 : size * 0.012}" fill="currentColor" opacity="${on ? 0.9 : 0.4}"/>`);
      }
      parts.push(`<path d="M ${size * 0.17} ${size * 0.56} H ${size * 0.56} V ${size * 0.17}" ${stroke} stroke-width="1.4" opacity=".8"/>`);
      break;
    }
    case 'npc': {
      parts.push(`<rect x="${c - size * 0.22}" y="${c - size * 0.22}" width="${size * 0.44}" height="${size * 0.44}" transform="rotate(45 ${c} ${c})" ${stroke} stroke-width="1.5"/>`);
      parts.push(`<circle cx="${c}" cy="${c}" r="${size * 0.07}" fill="currentColor"/>`);
      break;
    }
    default: { // the GM: an aperture of nested rings
      for (let k = 0; k < 5; k++) parts.push(`<circle cx="${c}" cy="${c}" r="${(size * (0.12 + k * 0.075)).toFixed(1)}" ${stroke} stroke-width="${(1.8 - k * 0.25).toFixed(2)}" opacity="${(1 - k * 0.16).toFixed(2)}" ${k % 2 ? 'stroke-dasharray="3 4"' : ''}/>`);
      parts.push(`<circle cx="${c}" cy="${c}" r="${size * 0.05}" fill="currentColor"/>`);
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" style="--h:${look.hue}">${parts.join('')}</svg>`;
}

/** Tiny light-cone glyph: width ∝ reach, length ∝ horizon. */
export function coneGlyph(cone = { reach: 1, horizon: 1 }, w = 34, h = 18) {
  const reach = Math.max(0.3, cone.reach) / 4;
  const hor = Math.max(0.15, cone.horizon) / 4;
  const x0 = 3, y0 = h / 2;
  const len = (w - 6) * hor;
  const half = (h / 2 - 1) * reach;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="M ${x0} ${y0} L ${x0 + len} ${y0 - half} L ${x0 + len} ${y0 + half} Z" fill="currentColor" opacity=".35"/><path d="M ${x0} ${y0} L ${w - 3} ${y0 - (h / 2 - 1)} M ${x0} ${y0} L ${w - 3} ${y0 + (h / 2 - 1)}" stroke="currentColor" stroke-width=".6" opacity=".35" fill="none"/><circle cx="${x0}" cy="${y0}" r="1.6" fill="currentColor"/></svg>`;
}

/** Segmented ring clock. */
export function ringClock(value, size, d = 40, done = false) {
  const segs = Math.min(size, 12);
  const scale = size > 12 ? size / 12 : 1;
  const filled = Math.round(value / scale);
  const c = d / 2, R = d / 2 - 3, r0 = d / 2 - 9;
  const parts = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2 + 0.06;
    const a1 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2 - 0.06;
    const p = (a, rr) => `${(c + Math.cos(a) * rr).toFixed(2)} ${(c + Math.sin(a) * rr).toFixed(2)}`;
    parts.push(`<path d="M ${p(a0, R)} A ${R} ${R} 0 0 1 ${p(a1, R)} L ${p(a1, r0)} A ${r0} ${r0} 0 0 0 ${p(a0, r0)} Z" class="${i < filled ? 'seg on' : 'seg'}"/>`);
  }
  if (done) parts.push(`<circle cx="${c}" cy="${c}" r="${r0 - 3}" class="seg on"/>`);
  return `<svg viewBox="0 0 ${d} ${d}" width="${d}" height="${d}" aria-hidden="true">${parts.join('')}</svg>`;
}

// Card pips: one glyph per card type, so a card reads as a card — the suit in the
// corner, mirrored bottom-right the way a playing card repeats its index.
// Colour comes from the card's `--kc` (how the card plays), the glyph says what it is.
const PIPS = {
  skill: '<path d="M12 3 L20 20 L12 15.4 L4 20 Z"/>',
  knack: '<path d="M12 2 L13.9 10.1 L22 12 L13.9 13.9 L12 22 L10.1 13.9 L2 12 L10.1 10.1 Z"/>',
  domain: '<path d="M12 2.6 L20.1 7.3 V16.7 L12 21.4 L3.9 16.7 V7.3 Z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  memory: '<path d="M15.6 7.6 A5.6 5.6 0 1 0 17 13.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="2.1"/>',
  drive: '<path d="M12 2.5 L15.4 12 L12 21.5 L8.6 12 Z"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/>',
  flaw: '<path d="M13.6 2.6 L9.2 10.6 L13.9 12.4 L8.2 21.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  calling: '<circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 1.6 V5 M12 19 V22.4 M1.6 12 H5 M19 12 H22.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  guard: '<path d="M12 2.4 L20 5.6 V12 c0 5.2-4 7.8-8 9.6 -4-1.8-8-4.4-8-9.6 V5.6 Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  resolve: '<path d="M12 1.8 c3.2 5 6.2 6.4 6.2 10.4 a6.2 6.2 0 0 1-12.4 0 c0-2.2 1.6-3.8 3.2-5.4 .5 2.2 1.6 2.6 2 1.9 .6-1.1 .6-4 1-6.9 Z"/>',
  gift: '<path d="M7.4 3.6 H16.6 L21 9.4 L12 20.8 L3 9.4 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 9.4 H21 M7.4 3.6 L12 20.8 L16.6 3.6" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".6"/>',
  insight: '<path d="M1.8 12 S6 5.4 12 5.4 22.2 12 22.2 12 18 18.6 12 18.6 1.8 12 1.8 12 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6"/>',
  condition: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6.1 17.9 L17.9 6.1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  compel: '<path d="M15.2 2.6 V13 a4.2 4.2 0 1 1-8.4 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M11.8 5.6 L15.2 2.2 L18.6 5.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>',
  gap: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-dasharray="3.2 3.4"/>',
  voice: '<path d="M2.4 12 q2.4-7.4 4.8 0 t4.8 0 t4.8 0 t4.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
};

/** The suit glyph for a card type (falls back to a plain lozenge). */
export function cardPip(type, cls = 'ck-pip') {
  const body = PIPS[type] ?? '<path d="M12 2.8 L19 12 L12 21.2 L5 12 Z" fill="none" stroke="currentColor" stroke-width="1.7"/>';
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${body}</svg>`;
}
