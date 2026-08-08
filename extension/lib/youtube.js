// Accesso ai dati di YouTube dal contesto dell'estensione.
// Grazie a host_permissions su youtube.com, questi fetch sono cross-origin
// consentiti e includono i cookie della tua sessione (meno blocchi).

// ---- utilita' di parsing -------------------------------------------------

// Estrae un oggetto JSON che segue un marcatore, bilanciando le graffe.
function extractJsonAfter(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  let i = html.indexOf("{", start);
  if (i === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text).join("");
  return "";
}

// Raccoglie ricorsivamente i video (robusto ai cambi di layout di YouTube).
function collectVideos(obj, acc, seen) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectVideos(x, acc, seen);
    return;
  }
  if (obj.videoId && (obj.title || obj.headline)) {
    const id = obj.videoId;
    if (!seen.has(id)) {
      seen.add(id);
      acc.push({
        videoId: id,
        title: textOf(obj.title) || textOf(obj.headline) || "(senza titolo)",
        publishedTimeText: textOf(obj.publishedTimeText),
        lengthText: textOf(obj.lengthText),
      });
    }
  }
  for (const k in obj) collectVideos(obj[k], acc, seen);
}

function findContinuation(obj) {
  let found = null;
  (function walk(o) {
    if (found || !o || typeof o !== "object") return;
    if (o.continuationCommand && o.continuationCommand.token) {
      found = o.continuationCommand.token;
      return;
    }
    for (const k in o) walk(o[k]);
  })(obj);
  return found;
}

// ---- elenco video del canale --------------------------------------------

function normalizeChannelUrl(url) {
  let u = url.trim().replace(/\/+$/, "");
  const low = u.toLowerCase();
  if (/\/videos$|\/streams$|watch\?v=/.test(low)) return u;
  if (low.includes("playlist?list=") || low.includes("/playlist")) return u;
  return u + "/videos";
}

export async function fetchChannelVideos(channelUrl, onProgress) {
  const url = normalizeChannelUrl(channelUrl);
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Canale non raggiungibile (HTTP ${res.status})`);
  const html = await res.text();

  const initial = extractJsonAfter(html, "var ytInitialData");
  if (!initial)
    throw new Error(
      "Impossibile leggere l'elenco del canale (pagina non riconosciuta)."
    );

  const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const clientVersion =
    (html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || [])[1] ||
    (html.match(/"clientVersion":"([\d.]+)"/) || [])[1] ||
    "2.20240101.00.00";

  const acc = [];
  const seen = new Set();
  collectVideos(initial, acc, seen);
  if (onProgress) onProgress(acc.length);

  let token = findContinuation(initial);
  const context = {
    client: { hl: "it", gl: "IT", clientName: "WEB", clientVersion },
  };

  // Pagina i risultati successivi finche' ci sono continuation token.
  let guard = 0;
  while (token && apiKey && guard < 200) {
    guard++;
    const body = { context, continuation: token };
    const r = await fetch(
      `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!r.ok) break;
    const data = await r.json();
    const before = acc.length;
    collectVideos(data, acc, seen);
    if (onProgress) onProgress(acc.length);
    token = findContinuation(data);
    if (acc.length === before) break; // niente di nuovo: evita loop
  }

  return acc.map((v, i) => ({
    index: i + 1,
    videoId: v.videoId,
    title: v.title,
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    publishedTimeText: v.publishedTimeText,
    lengthText: v.lengthText,
    uploadDate: null, // risolta su richiesta (filtri anno/data)
  }));
}

// ---- data di pubblicazione esatta ---------------------------------------

function playerResponseFromWatch(html) {
  return (
    extractJsonAfter(html, "ytInitialPlayerResponse =") ||
    extractJsonAfter(html, "var ytInitialPlayerResponse")
  );
}

async function fetchWatchHtml(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parsePublishDate(player) {
  const d =
    player &&
    player.microformat &&
    player.microformat.playerMicroformatRenderer &&
    (player.microformat.playerMicroformatRenderer.publishDate ||
      player.microformat.playerMicroformatRenderer.uploadDate);
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Risolve le date in parallelo (concorrenza limitata), aggiornando i video.
export async function resolveDates(videos, onProgress, concurrency = 6) {
  const todo = videos.filter((v) => v.uploadDate == null);
  let done = 0;
  let idx = 0;

  async function worker() {
    while (idx < todo.length) {
      const v = todo[idx++];
      try {
        const html = await fetchWatchHtml(v.videoId);
        v.uploadDate = parsePublishDate(playerResponseFromWatch(html));
      } catch {
        v.uploadDate = null;
      }
      done++;
      if (onProgress) onProgress(done, todo.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, todo.length) }, worker)
  );
}

// ---- trascrizione di un singolo video -----------------------------------

function pickCaptionTrack(tracks, langs) {
  const byLang = (code, asr) =>
    tracks.find(
      (t) =>
        (t.languageCode || "").toLowerCase().startsWith(code) &&
        (asr ? t.kind === "asr" : t.kind !== "asr")
    );
  for (const l of langs) {
    const manual = byLang(l, false);
    if (manual) return manual;
    const auto = byLang(l, true);
    if (auto) return auto;
  }
  // fallback: prima manuale, poi prima auto
  return (
    tracks.find((t) => t.kind !== "asr") || tracks.find((t) => t.kind === "asr")
  );
}

// Restituisce { snippets:[...], language, isGenerated } oppure lancia un errore
// con .skip=true se il video non ha trascrizione utilizzabile.
export async function fetchTranscript(videoId, langs = ["it"]) {
  let html;
  try {
    html = await fetchWatchHtml(videoId);
  } catch (e) {
    const err = new Error(`video non disponibile (${e.message})`);
    err.skip = true;
    throw err;
  }
  const player = playerResponseFromWatch(html);
  const tracks =
    player &&
    player.captions &&
    player.captions.playerCaptionsTracklistRenderer &&
    player.captions.playerCaptionsTracklistRenderer.captionTracks;

  if (!tracks || tracks.length === 0) {
    const err = new Error("nessuna trascrizione disponibile");
    err.skip = true;
    throw err;
  }

  const track = pickCaptionTrack(tracks, langs);
  if (!track) {
    const err = new Error(`nessuna trascrizione nelle lingue ${langs.join(",")}`);
    err.skip = true;
    throw err;
  }

  const url = track.baseUrl + (track.baseUrl.includes("fmt=") ? "" : "&fmt=json3");
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(`errore nel download della trascrizione (HTTP ${res.status})`);
    err.skip = true;
    throw err;
  }
  const data = await res.json();
  const snippets = [];
  for (const ev of data.events || []) {
    if (!ev.segs) continue;
    const line = ev.segs.map((s) => s.utf8 || "").join("");
    if (line) snippets.push(line);
  }
  if (snippets.length === 0) {
    const err = new Error("trascrizione vuota");
    err.skip = true;
    throw err;
  }

  return {
    snippets,
    language: track.languageCode || "??",
    isGenerated: track.kind === "asr",
    publishDate: parsePublishDate(player),
  };
}
