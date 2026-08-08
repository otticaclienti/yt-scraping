/*
 * Bookmarklet "Trascrizioni YouTube".
 * Gira DENTRO la pagina youtube.com (stesso dominio -> nessun problema di CORS,
 * usa la tua sessione). Non installa nulla: e' solo un segnalibro.
 *
 * Questo file e' la sorgente leggibile. La versione da mettere nel segnalibro
 * e' quella minificata (bookmarklet/bookmarklet.txt), generata con build.mjs.
 */
(function () {
  "use strict";

  // Diagnostica: scrive nel riquadro dove siamo arrivati (utile se si blocca).
  var __statusEl = null;
  function dbg(m) { if (__statusEl) { try { __statusEl.textContent = m; } catch (e) {} } }

  if (!location.hostname.endsWith("youtube.com")) {
    alert("Apri prima un canale YouTube (es. youtube.com/@nomecanale), poi clicca questo preferito.");
    return;
  }
  if (window.__yttPanel) {
    window.__yttPanel.remove();
    window.__yttPanel = null;
  }

  // ---------------------------------------------------------------- utils --
  var enc = new TextEncoder();

  function extractJsonAfter(html, marker) {
    var start = html.indexOf(marker);
    if (start === -1) return null;
    var i = html.indexOf("{", start);
    if (i === -1) return null;
    var depth = 0, inStr = false, esc = false;
    for (var j = i; j < html.length; j++) {
      var ch = html[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { try { return JSON.parse(html.slice(i, j + 1)); } catch (e) { return null; } }
      }
    }
    return null;
  }

  function textOf(node) {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (node.simpleText) return node.simpleText;
    if (Array.isArray(node.runs)) return node.runs.map(function (r) { return r.text; }).join("");
    return "";
  }

  function pushVid(acc, seen, id, title, pub, len) {
    if (!id || seen[id]) return;
    seen[id] = 1;
    acc.push({ videoId: id, title: title || "(senza titolo)", publishedTimeText: pub || "", lengthText: len || "" });
  }
  // Titolo nel nuovo formato lockupViewModel.
  function lockupTitle(o) {
    try {
      var t = o.metadata.lockupMetadataViewModel.title;
      return typeof t === "string" ? t : (t && t.content) || "";
    } catch (e) { return ""; }
  }
  // Data relativa ("3 settimane fa") nel nuovo formato.
  function lockupRelTime(o) {
    var found = "";
    (function w(x) {
      if (found || !x || typeof x !== "object") return;
      if (typeof x.content === "string" && /\b(fa|ago)\b/i.test(x.content)) { found = x.content; return; }
      for (var k in x) w(x[k]);
    })(o.metadata || o);
    return found;
  }

  function collectVideos(obj, acc, seen) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) collectVideos(obj[i], acc, seen); return; }
    // Formato classico: videoRenderer / gridVideoRenderer (campo videoId).
    if (typeof obj.videoId === "string" && (obj.title || obj.headline || obj.lengthText)) {
      pushVid(acc, seen, obj.videoId, textOf(obj.title) || textOf(obj.headline), textOf(obj.publishedTimeText), textOf(obj.lengthText));
    }
    // Formato nuovo: lockupViewModel (campo contentId, solo i video).
    else if (typeof obj.contentId === "string" && obj.contentId.length === 11 &&
             obj.metadata && (!obj.contentType || /VIDEO/.test(obj.contentType))) {
      pushVid(acc, seen, obj.contentId, lockupTitle(obj), lockupRelTime(obj), "");
    }
    for (var k in obj) collectVideos(obj[k], acc, seen);
  }

  function findContinuation(obj) {
    var found = null;
    (function walk(o) {
      if (found || !o || typeof o !== "object") return;
      if (o.continuationCommand && o.continuationCommand.token) { found = o.continuationCommand.token; return; }
      for (var k in o) walk(o[k]);
    })(obj);
    return found;
  }

  // -------------------------------------------------------------- selezione --
  function parseIsoDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error("data non valida '" + s + "' (usa AAAA-MM-GG)");
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3])
      throw new Error("data non valida '" + s + "'");
    return dt;
  }
  function vYear(v) { return v.uploadDate ? v.uploadDate.getUTCFullYear() : null; }

  function tokenIndices(token, videos) {
    var t = token.trim().toLowerCase();
    if (!t) return {};
    var out = {};
    var i, v;
    if (t === "all") { for (i = 0; i < videos.length; i++) out[videos[i].index] = 1; return out; }
    if (t.indexOf("last:") === 0) {
      var raw = t.slice(5);
      if (!/^\d+$/.test(raw) || +raw <= 0) throw new Error("'" + token + "': last: richiede un numero");
      for (i = 0; i < videos.length; i++) if (videos[i].index <= +raw) out[videos[i].index] = 1;
      return out;
    }
    if (t.indexOf("year:") === 0) {
      var y = t.slice(5);
      if (!/^\d{4}$/.test(y)) throw new Error("'" + token + "': year: richiede un anno a 4 cifre");
      for (i = 0; i < videos.length; i++) if (vYear(videos[i]) === +y) out[videos[i].index] = 1;
      return out;
    }
    if (t.indexOf("date:") === 0) {
      var spec = t.slice(5), lo, hi;
      if (spec.indexOf("..") !== -1) {
        var p = spec.split("..");
        lo = p[0] ? parseIsoDate(p[0]) : new Date(-8640000000000000);
        hi = p[1] ? parseIsoDate(p[1]) : new Date(8640000000000000);
      } else { lo = hi = parseIsoDate(spec); }
      if (lo > hi) { var tmp = lo; lo = hi; hi = tmp; }
      for (i = 0; i < videos.length; i++) { v = videos[i]; if (v.uploadDate && v.uploadDate >= lo && v.uploadDate <= hi) out[v.index] = 1; }
      return out;
    }
    if (t.indexOf("-") > 0) {
      var pr = t.split("-");
      if (/^\d+$/.test(pr[0]) && /^\d+$/.test(pr[1])) {
        var a = +pr[0], b = +pr[1]; if (a > b) { var s = a; a = b; b = s; }
        for (i = a; i <= b; i++) if (i >= 1 && i <= videos.length) out[i] = 1;
        return out;
      }
    }
    if (/^\d+$/.test(t)) {
      var n = +t; if (n < 1 || n > videos.length) throw new Error("indice " + n + " fuori intervallo (1.." + videos.length + ")");
      out[n] = 1; return out;
    }
    throw new Error("non capisco: '" + token + "'");
  }

  function parseSelection(expr, videos) {
    var sel = {}, toks = expr.split(/\s+/);
    for (var i = 0; i < toks.length; i++) {
      if (!toks[i]) continue;
      var r = tokenIndices(toks[i], videos);
      for (var k in r) sel[k] = 1;
    }
    return Object.keys(sel).map(Number).sort(function (a, b) { return a - b; });
  }
  function needsDates(expr) {
    return expr.toLowerCase().split(/\s+/).some(function (t) { return t.indexOf("year:") === 0 || t.indexOf("date:") === 0; });
  }

  // -------------------------------------------------------------- pulizia --
  var CUE = /^\s*[\[(](?:musica|music|applausi|applause|risate|laughter|rumore|noise|silenzio|silence|[^\])]{0,30})[\])]\s*$/i;
  var INLINE = /[\[(](?:musica|music|applausi|applause|risate|laughter)[\])]/gi;
  var NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  function unescapeHtml(s) {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (m, code) {
      if (code[0] === "#") {
        var num = (code[1] === "x" || code[1] === "X") ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return isNaN(num) ? m : String.fromCodePoint(num);
      }
      var key = code.toLowerCase();
      return NAMED[key] != null ? NAMED[key] : m;
    });
  }
  function cleanSnippets(snips) {
    var lines = [];
    for (var i = 0; i < snips.length; i++) {
      var text = unescapeHtml(String(snips[i] == null ? "" : snips[i])).replace(/\n/g, " ");
      if (CUE.test(text)) continue;
      text = text.replace(INLINE, " ").replace(/[ \t ]+/g, " ").trim();
      if (text) lines.push(text);
    }
    var joined = lines.join(" ").replace(/[ \t ]+/g, " ").trim();
    if (!joined) return "";
    var out = joined.replace(/([.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"])/g, "$1\n").replace(/\n{3,}/g, "\n\n");
    return out.trim() + "\n";
  }
  function slugify(text) {
    var n = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (n.length > 60) n = n.slice(0, 60).replace(/-+$/, "");
    return n || "video";
  }
  function filename(v, lang) {
    var d = v.uploadDate ? v.uploadDate.toISOString().slice(0, 10) : "0000-00-00";
    return d + "_" + slugify(v.title) + "_" + v.videoId + (lang ? "." + lang : "") + ".txt";
  }

  // ------------------------------------------------------------------ zip --
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xffffffff; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function deflate(u8) { var cs = new CompressionStream("deflate-raw"); var st = new Response(u8).body.pipeThrough(cs); return new Response(st).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function concat(chunks) { var total = 0, i; for (i = 0; i < chunks.length; i++) total += chunks[i].length; var out = new Uint8Array(total), off = 0; for (i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; } return out; }
  function buildZip(files) {
    var local = [], central = [], offset = 0, idx = 0;
    function next() {
      if (idx >= files.length) {
        var cb = concat(central);
        var eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
        ev.setUint32(12, cb.length, true); ev.setUint32(16, offset, true);
        return Promise.resolve(new Blob([concat(local.concat([cb, eocd]))], { type: "application/zip" }));
      }
      var f = files[idx++], nameB = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      return deflate(data).then(function (comp) {
        var lh = new Uint8Array(30 + nameB.length), lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 8, true);
        lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true);
        lv.setUint32(18, comp.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameB.length, true);
        lh.set(nameB, 30); local.push(lh, comp);
        var ce = new Uint8Array(46 + nameB.length), cv = new DataView(ce.buffer);
        cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 8, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true);
        cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameB.length, true);
        cv.setUint32(42, offset, true); ce.set(nameB, 46); central.push(ce);
        offset += lh.length + comp.length;
        return next();
      });
    }
    return next();
  }

  // -------------------------------------------------------------- youtube --
  function channelBase() {
    var u = location.origin + location.pathname.replace(/\/(videos|streams|featured|shorts|playlists|community|about)?$/, "");
    return u.replace(/\/+$/, "");
  }
  function fetchText(url) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, { credentials: "include", signal: ctrl.signal }).then(
      function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); },
      function (e) { clearTimeout(to); throw new Error(e && e.name === "AbortError" ? "timeout (20s)" : "rete: " + (e && e.message || e)); }
    );
  }

  function ytcfgGet(k) { try { return (window.ytcfg && ytcfg.get) ? ytcfg.get(k) : null; } catch (e) { return null; } }
  function initialFromHtml(html) {
    var ms = ["var ytInitialData = ", 'window["ytInitialData"] = ', "ytInitialData = "];
    for (var i = 0; i < ms.length; i++) { var o = extractJsonAfter(html, ms[i]); if (o) return o; }
    return null;
  }

  // onBatch(list, done) viene chiamato dopo ogni blocco caricato, cosi' la UI
  // mostra subito i primi video e continua ad aggiungerli in sottofondo.
  function getVideos(onBatch) {
    var base = channelBase();
    var acc = [], seen = {};
    function snapshot() {
      return acc.map(function (v, i) {
        return { index: i + 1, videoId: v.videoId, title: v.title, url: "https://www.youtube.com/watch?v=" + v.videoId,
          publishedTimeText: v.publishedTimeText, lengthText: v.lengthText, uploadDate: null };
      });
    }
    dbg("1/3 Leggo la pagina del canale (" + base + "/videos)…");
    return fetchText(base + "/videos").then(function (html) {
      dbg("2/3 Interpreto l'elenco…");
      var initial = initialFromHtml(html);
      if (initial) collectVideos(initial, acc, seen);
      if (window.ytInitialData) collectVideos(window.ytInitialData, acc, seen);
      dbg("3/3 Trovati " + acc.length + " video iniziali, preparo la lista…");
      if (acc.length === 0) throw new Error("elenco vuoto: la pagina non contiene video riconoscibili");
      onBatch(snapshot(), false); // <-- mostra subito i primi video e i comandi

      var apiKey = ytcfgGet("INNERTUBE_API_KEY") || (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
      var cver = ytcfgGet("INNERTUBE_CONTEXT_CLIENT_VERSION") || (html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20240101.00.00";
      var token = findContinuation(initial) || findContinuation(window.ytInitialData);
      var ctx = ytcfgGet("INNERTUBE_CONTEXT") || { client: { hl: "it", gl: "IT", clientName: "WEB", clientVersion: cver } };
      var guard = 0;
      function more() {
        if (!token || !apiKey || guard >= 300) return Promise.resolve();
        guard++;
        return fetch("/youtubei/v1/browse?key=" + apiKey, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: ctx, continuation: token }),
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
          if (!data) return;
          var before = acc.length;
          collectVideos(data, acc, seen);
          token = findContinuation(data);
          if (acc.length === before) return; // niente di nuovo: stop
          onBatch(snapshot(), false);
          return more();
        }).catch(function () { /* errore di rete a meta': fermati con quel che c'e' */ });
      }
      return more().then(function () { return snapshot(); });
    });
  }

  function playerFrom(html) { return extractJsonAfter(html, "ytInitialPlayerResponse =") || extractJsonAfter(html, "var ytInitialPlayerResponse"); }
  function pubDate(player) {
    var r = player && player.microformat && player.microformat.playerMicroformatRenderer;
    var d = r && (r.publishDate || r.uploadDate); if (!d) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  function resolveDates(videos, onProg) {
    var todo = videos.filter(function (v) { return v.uploadDate == null; }), done = 0, i = 0;
    function worker() {
      if (i >= todo.length) return Promise.resolve();
      var v = todo[i++];
      return fetchText("/watch?v=" + v.videoId).then(function (h) { v.uploadDate = pubDate(playerFrom(h)); }, function () {})
        .then(function () { done++; onProg(done, todo.length); return worker(); });
    }
    var workers = []; for (var w = 0; w < Math.min(6, todo.length); w++) workers.push(worker());
    return Promise.all(workers);
  }

  function pickTrack(tracks, langs) {
    function find(code, asr) { return tracks.find(function (t) { return (t.languageCode || "").toLowerCase().indexOf(code) === 0 && (asr ? t.kind === "asr" : t.kind !== "asr"); }); }
    for (var i = 0; i < langs.length; i++) { var m = find(langs[i], false); if (m) return m; var a = find(langs[i], true); if (a) return a; }
    return tracks.find(function (t) { return t.kind !== "asr"; }) || tracks.find(function (t) { return t.kind === "asr"; });
  }
  function getTranscript(v, langs) {
    return fetchText("/watch?v=" + v.videoId).then(function (html) {
      var player = playerFrom(html);
      if (player && !v.uploadDate) v.uploadDate = pubDate(player);
      var tl = player && player.captions && player.captions.playerCaptionsTracklistRenderer;
      var tracks = tl && tl.captionTracks;
      if (!tracks || !tracks.length) throw new Error("nessuna trascrizione");
      var track = pickTrack(tracks, langs);
      if (!track) throw new Error("nessuna trascrizione nelle lingue " + langs.join(","));
      var url = track.baseUrl + (track.baseUrl.indexOf("fmt=") !== -1 ? "" : "&fmt=json3");
      return fetch(url, { credentials: "include" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (data) {
        var snips = [];
        (data.events || []).forEach(function (ev) { if (!ev.segs) return; var line = ev.segs.map(function (s) { return s.utf8 || ""; }).join(""); if (line) snips.push(line); });
        if (!snips.length) throw new Error("trascrizione vuota");
        return { language: track.languageCode || "??", isGenerated: track.kind === "asr", text: cleanSnippets(snips) };
      });
    });
  }

  // ------------------------------------------------------------------- UI --
  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var panel = el("div", "position:fixed;top:16px;right:16px;width:430px;max-height:88vh;z-index:2147483647;background:#fff;color:#111;border:1px solid #ccc;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:14px/1.45 system-ui,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden");
  window.__yttPanel = panel;
  var head = el("div", "padding:12px 14px;background:#c00;color:#fff;font-weight:700;display:flex;justify-content:space-between;align-items:center");
  head.appendChild(el("span", "", "Trascrizioni YouTube"));
  var close = el("span", "cursor:pointer;font-size:18px", "×");
  close.onclick = function () { panel.remove(); window.__yttPanel = null; };
  head.appendChild(close);
  panel.appendChild(head);

  var body = el("div", "padding:12px 14px;overflow:auto");
  panel.appendChild(body);

  var status = el("div", "margin-bottom:8px;color:#555", "Carico l'elenco dei video…");
  body.appendChild(status);
  __statusEl = status;

  var tools = el("div", "display:none;gap:6px;flex-wrap:wrap;margin-bottom:8px");
  var filterInp = el("input", "flex:1;min-width:150px;padding:6px 8px;border:1px solid #ccc;border-radius:6px");
  filterInp.placeholder = "es. year:2026  •  date:2026-01-01..2026-06-30  •  3 7 15";
  var bFilter = el("button", "", "Filtra");
  var bAll = el("button", "", "Tutti");
  var bNone = el("button", "", "Nessuno");
  var bDates = el("button", "", "Risolvi date");
  [bFilter, bAll, bNone, bDates].forEach(function (b) { b.style.cssText = "padding:6px 10px;border:1px solid #ccc;border-radius:6px;background:#f4f4f4;cursor:pointer"; });
  tools.appendChild(filterInp); tools.appendChild(bFilter); tools.appendChild(bAll); tools.appendChild(bNone); tools.appendChild(bDates);
  body.appendChild(tools);

  var listBox = el("div", "border:1px solid #eee;border-radius:8px;max-height:40vh;overflow:auto");
  body.appendChild(listBox);

  var foot = el("div", "display:none;align-items:center;gap:8px;margin-top:10px");
  foot.appendChild(el("span", "", "Lingue:"));
  var langInp = el("input", "width:80px;padding:6px 8px;border:1px solid #ccc;border-radius:6px");
  langInp.value = "it";
  foot.appendChild(langInp);
  var count = el("span", "flex:1;text-align:right;font-weight:600", "0 selezionati");
  foot.appendChild(count);
  var bGo = el("button", "padding:8px 14px;border:0;border-radius:8px;background:#c00;color:#fff;font-weight:700;cursor:pointer", "Scarica ZIP");
  foot.appendChild(bGo);
  body.appendChild(foot);

  var prog = el("div", "display:none;margin-top:10px");
  var progTxt = el("div", "color:#555;margin-bottom:6px", "");
  var progBar = el("div", "height:8px;background:#eee;border-radius:5px;overflow:hidden");
  var progFill = el("div", "height:100%;width:0;background:#c00"); progBar.appendChild(progFill);
  prog.appendChild(progTxt); prog.appendChild(progBar);
  body.appendChild(prog);
  var summary = el("div", "margin-top:10px"); body.appendChild(summary);

  document.body.appendChild(panel);

  // ---- stato UI
  var videos = [], selected = {};
  function fmtDate(v) { return v.uploadDate ? v.uploadDate.toISOString().slice(0, 10) : (v.publishedTimeText || "—"); }
  function renderList() {
    listBox.innerHTML = "";
    videos.forEach(function (v) {
      var row = el("label", "display:flex;gap:8px;padding:5px 8px;border-bottom:1px solid #f0f0f0;cursor:pointer;align-items:baseline");
      var cb = el("input"); cb.type = "checkbox"; cb.checked = !!selected[v.index];
      cb.onchange = function () { if (cb.checked) selected[v.index] = 1; else delete selected[v.index]; updateCount(); };
      row.appendChild(cb);
      row.appendChild(el("span", "color:#999;min-width:28px", "" + v.index));
      row.appendChild(el("span", "color:#888;min-width:78px;font-size:12px", fmtDate(v)));
      var tt = el("span", "flex:1", v.title);
      row.appendChild(tt);
      listBox.appendChild(row);
    });
    updateCount();
  }
  function updateCount() {
    var n = Object.keys(selected).length;
    count.textContent = n + " selezionati";
    bGo.disabled = n === 0; bGo.style.opacity = n === 0 ? .5 : 1;
  }

  bAll.onclick = function () { videos.forEach(function (v) { selected[v.index] = 1; }); renderList(); };
  bNone.onclick = function () { selected = {}; renderList(); };
  bFilter.onclick = doFilter;
  filterInp.onkeydown = function (e) { if (e.key === "Enter") doFilter(); };
  function doFilter() {
    var expr = filterInp.value.trim(); if (!expr) return;
    var run = function () {
      try {
        var idx = parseSelection(expr, videos);
        if (!idx.length) { status.textContent = "Nessun video corrisponde al filtro."; return; }
        idx.forEach(function (i) { selected[i] = 1; }); renderList();
        status.textContent = "Aggiunti " + idx.length + " video alla selezione.";
      } catch (e) { status.textContent = "Filtro non valido: " + e.message; }
    };
    if (needsDates(expr) && videos.some(function (v) { return v.uploadDate == null; })) runResolveDates(run);
    else run();
  }
  bDates.onclick = function () { runResolveDates(); };
  function runResolveDates(then) {
    bDates.disabled = true;
    resolveDates(videos, function (d, t) { status.textContent = "Risolvo le date… " + d + "/" + t; })
      .then(function () { renderList(); status.textContent = "Date risolte."; bDates.disabled = false; if (then) then(); });
  }

  bGo.onclick = function () {
    var chosen = videos.filter(function (v) { return selected[v.index]; });
    var langs = langInp.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean); if (!langs.length) langs = ["it"];
    prog.style.display = "block"; summary.innerHTML = ""; bGo.disabled = true;
    var files = [], saved = [], skipped = [], i = 0;
    function step() {
      if (i >= chosen.length) return finish();
      var v = chosen[i++];
      progTxt.textContent = "Scarico " + i + "/" + chosen.length + ": " + v.title;
      progFill.style.width = Math.round((i / chosen.length) * 100) + "%";
      return getTranscript(v, langs).then(function (t) {
        var lang = t.language.toLowerCase().indexOf("it") === 0 ? null : t.language;
        var name = filename(v, lang);
        var header = "Titolo: " + v.title + "\nVideo ID: " + v.videoId + "\nURL: " + v.url +
          "\nData: " + (v.uploadDate ? v.uploadDate.toISOString().slice(0, 10) : "??????????") +
          "\nLingua: " + t.language + " (" + (t.isGenerated ? "auto-generata" : "manuale") + ")\n\n" +
          "------------------------------------------------------------------------\n\n";
        files.push({ name: name, text: header + t.text });
        saved.push({ v: v, t: t, name: name });
      }, function (e) { skipped.push({ v: v, reason: e.message }); }).then(step);
    }
    function finish() {
      progTxt.textContent = "Preparo l'archivio ZIP…";
      var go = files.length ? (function () {
        var rows = [["video_id", "data", "titolo", "lingua", "auto_generata", "file", "url"]];
        saved.forEach(function (s) { rows.push([s.v.videoId, s.v.uploadDate ? s.v.uploadDate.toISOString().slice(0, 10) : "", s.v.title, s.t.language, s.t.isGenerated ? "si" : "no", s.name, s.v.url]); });
        var csv = rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n") + "\n";
        files.push({ name: "index.csv", text: csv });
        return buildZip(files).then(function (blob) {
          var m = location.href.match(/@([\w.-]+)/); var who = m ? m[1] : "canale";
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "trascrizioni_" + who + "_" + new Date().toISOString().slice(0, 10) + ".zip";
          document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        });
      })() : Promise.resolve();
      go.then(function () {
        progFill.style.width = "100%"; progTxt.textContent = "Fatto.";
        var h = "<div style='color:#137333;font-weight:700'>" + saved.length + " trascrizioni salvate" + (files.length ? " nello ZIP (con index.csv)." : ".") + "</div>";
        if (skipped.length) {
          h += "<div style='color:#b06000;font-weight:700;margin-top:8px'>" + skipped.length + " saltati (senza trascrizione):</div><ul style='margin:4px 0 0;padding-left:18px'>";
          skipped.forEach(function (s) { h += "<li style='color:#b06000'><a href='" + esc(s.v.url) + "' target='_blank'>" + esc(s.v.title) + "</a> — " + esc(s.reason) + "</li>"; });
          h += "</ul>";
        }
        summary.innerHTML = h; bGo.disabled = false;
      });
    }
    step();
  };

  // ---- avvio: carica la lista (mostrandola man mano che arriva)
  function showBatch(list, done) {
    try {
      videos = list;
      renderList();
      tools.style.display = "flex";
      foot.style.display = "flex";
      status.textContent = done
        ? "Trovati " + videos.length + " video. Seleziona e scarica."
        : "Carico… " + videos.length + " video (puoi gia' selezionare).";
    } catch (e) {
      status.innerHTML = "<b style='color:#c00'>Errore nel mostrare la lista:</b> " + esc(e && e.message || e);
    }
  }
  getVideos(function (list) { showBatch(list, false); }).then(function (list) {
    showBatch(list, true);
  }).catch(function (e) {
    status.innerHTML = "<b style='color:#c00'>Errore:</b> " + esc(e && e.message || e) + "<br><span style='color:#777'>Apri la pagina di un canale (es. youtube.com/@nome) e riprova.</span>";
  });
})();
