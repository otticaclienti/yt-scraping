// Parsing delle espressioni di selezione dei video.
// Grammatica identica alla versione Python (ytt/selection.py):
//   all | N | N-M | last:N | year:YYYY | date:A..B | date:A.. | date:..B | date:A
// La selezione finale e' l'UNIONE dei token separati da spazi.

export class SelectionError extends Error {}

function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new SelectionError(`data non valida '${s}' (usa YYYY-MM-DD)`);
  const [_, y, mo, d] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (
    dt.getUTCFullYear() !== +y ||
    dt.getUTCMonth() !== +mo - 1 ||
    dt.getUTCDate() !== +d
  ) {
    throw new SelectionError(`data non valida '${s}'`);
  }
  return dt;
}

function videoYear(v) {
  return v.uploadDate ? v.uploadDate.getUTCFullYear() : null;
}

function tokenIndices(token, videos) {
  const t = token.trim().toLowerCase();
  if (!t) return new Set();

  const allIdx = new Set(videos.map((v) => v.index));
  const n = videos.length;

  if (t === "all") return new Set(allIdx);

  if (t.startsWith("last:")) {
    const raw = t.slice(5);
    if (!/^\d+$/.test(raw) || +raw <= 0)
      throw new SelectionError(`'${token}': last: richiede un intero positivo`);
    const k = +raw;
    return new Set(videos.filter((v) => v.index <= k).map((v) => v.index));
  }

  if (t.startsWith("year:")) {
    const raw = t.slice(5);
    if (!/^\d{4}$/.test(raw))
      throw new SelectionError(`'${token}': year: richiede un anno a 4 cifre`);
    const y = +raw;
    return new Set(videos.filter((v) => videoYear(v) === y).map((v) => v.index));
  }

  if (t.startsWith("date:")) return dateTokenIndices(token, t.slice(5), videos);

  // Intervallo di indici N-M
  if (t.includes("-") && !t.startsWith("-")) {
    const [a, b] = t.split("-");
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
      let lo = +a, hi = +b;
      if (lo === 0 || hi === 0)
        throw new SelectionError(`'${token}': gli indici partono da 1`);
      if (lo > hi) [lo, hi] = [hi, lo];
      const out = new Set();
      for (let i = lo; i <= hi; i++) if (allIdx.has(i)) out.add(i);
      return out;
    }
  }

  // Indice singolo N
  if (/^\d+$/.test(t)) {
    const i = +t;
    if (i === 0) throw new SelectionError("gli indici partono da 1");
    if (!allIdx.has(i))
      throw new SelectionError(`indice ${i} fuori intervallo (1..${n})`);
    return new Set([i]);
  }

  throw new SelectionError(`token non riconosciuto: '${token}'`);
}

function dateTokenIndices(token, spec, videos) {
  let lo, hi;
  if (spec.includes("..")) {
    const [loS, hiS] = spec.split("..");
    lo = loS ? parseIsoDate(loS) : new Date(-8640000000000000);
    hi = hiS ? parseIsoDate(hiS) : new Date(8640000000000000);
  } else {
    lo = hi = parseIsoDate(spec);
  }
  if (lo > hi) [lo, hi] = [hi, lo];
  const out = new Set();
  for (const v of videos) {
    if (v.uploadDate && v.uploadDate >= lo && v.uploadDate <= hi) out.add(v.index);
  }
  return out;
}

export function parseSelection(expression, videos) {
  const selected = new Set();
  for (const token of expression.split(/\s+/)) {
    if (!token) continue;
    for (const i of tokenIndices(token, videos)) selected.add(i);
  }
  return [...selected].sort((a, b) => a - b);
}

export function needsDates(expression) {
  return expression
    .toLowerCase()
    .split(/\s+/)
    .some((t) => t.startsWith("year:") || t.startsWith("date:"));
}
