// Pulizia del testo delle trascrizioni e nomi file.
// Speculare a ytt/textutil.py.

const CUE_RE =
  /^\s*[\[(](?:musica|music|applausi|applause|risate|laughter|rumore|noise|silenzio|silence|[^\])]{0,30})[\])]\s*$/i;
const INLINE_CUE_RE =
  /[\[(](?:musica|music|applausi|applause|risate|laughter)[\])]/gi;

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlUnescape(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isNaN(num) ? m : String.fromCodePoint(num);
    }
    const key = code.toLowerCase();
    return key in NAMED ? NAMED[key] : m;
  });
}

function splitSentences(text) {
  if (!text) return "";
  let out = text.replace(
    /([.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"])/g,
    "$1\n"
  );
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim() + "\n";
}

export function cleanSnippets(snippets) {
  const lines = [];
  for (let raw of snippets) {
    if (raw == null) continue;
    let text = htmlUnescape(String(raw)).replace(/\n/g, " ");
    if (CUE_RE.test(text)) continue;
    text = text.replace(INLINE_CUE_RE, " ").replace(/[ \t ]+/g, " ").trim();
    if (text) lines.push(text);
  }
  const joined = lines.join(" ").replace(/[ \t ]+/g, " ").trim();
  return splitSentences(joined);
}

export function slugify(text, maxLen = 60) {
  let norm = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // rimuovi diacritici
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (norm.length > maxLen) norm = norm.slice(0, maxLen).replace(/-+$/, "");
  return norm || "video";
}

export function transcriptFilename(video, lang) {
  const datePart = video.uploadDate
    ? video.uploadDate.toISOString().slice(0, 10)
    : "0000-00-00";
  const langPart = lang ? `.${lang}` : "";
  return `${datePart}_${slugify(video.title)}_${video.videoId}${langPart}.txt`;
}
