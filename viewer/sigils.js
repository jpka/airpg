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
