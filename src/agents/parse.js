// Tolerant JSON extraction for agent replies.

export function extractJson(text) {
  if (text == null) return null;
  if (typeof text === 'object') return text;
  const s = String(text).trim();
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fallthrough */ } }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const body = s.slice(first, last + 1);
    try { return JSON.parse(body); } catch { /* try light repair */ }
    try { return JSON.parse(repair(body)); } catch { /* give up */ }
  }
  return null;
}

function repair(s) {
  return s
    .replace(/,\s*([}\]])/g, '$1')          // trailing commas
    .replace(/[“”]/g, '"')         // smart quotes
    .replace(/[‘’]/g, "'")
    .replace(/\n/g, ' ');
}
