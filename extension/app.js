import { parseSelection, needsDates, SelectionError } from "./lib/selection.js";
import { cleanSnippets, transcriptFilename } from "./lib/clean.js";
import { buildZip } from "./lib/zip.js";
import {
  fetchChannelVideos,
  resolveDates,
  fetchTranscript,
} from "./lib/youtube.js";

const $ = (id) => document.getElementById(id);

let videos = [];
const selected = new Set(); // indici selezionati

// Precompila l'URL del canale dal parametro passato dal background script.
const params = new URLSearchParams(location.search);
if (params.get("channel")) $("channel").value = params.get("channel");

// ---- caricamento elenco --------------------------------------------------

$("load").addEventListener("click", loadChannel);
$("channel").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadChannel();
});

async function loadChannel() {
  const url = $("channel").value.trim();
  if (!url) return;
  $("load").disabled = true;
  $("loadStatus").textContent = "Carico l'elenco dei video…";
  try {
    videos = await fetchChannelVideos(url, (n) => {
      $("loadStatus").textContent = `Trovati ${n} video…`;
    });
    selected.clear();
    renderRows();
    $("panel").hidden = false;
    $("loadStatus").innerHTML = `<span class="ok">Trovati ${videos.length} video.</span>`;
  } catch (e) {
    $("loadStatus").innerHTML = `<span class="skip">Errore: ${escapeHtml(e.message)}</span>`;
  } finally {
    $("load").disabled = false;
  }
}

// ---- rendering tabella ---------------------------------------------------

function fmtDate(v) {
  if (v.uploadDate) return v.uploadDate.toISOString().slice(0, 10);
  return v.publishedTimeText || "—";
}

function renderRows() {
  const tbody = $("rows");
  tbody.innerHTML = "";
  for (const v of videos) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-idx="${v.index}" ${selected.has(v.index) ? "checked" : ""}></td>
      <td class="num">${v.index}</td>
      <td class="date">${escapeHtml(fmtDate(v))}</td>
      <td class="dur">${escapeHtml(v.lengthText || "—")}</td>
      <td>${escapeHtml(v.title)}</td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const idx = +cb.dataset.idx;
      if (cb.checked) selected.add(idx);
      else selected.delete(idx);
      updateCount();
    });
  });
  updateCount();
}

function updateCount() {
  $("selCount").textContent = String(selected.size);
  $("download").disabled = selected.size === 0;
  const total = videos.length;
  $("checkAll").checked = total > 0 && selected.size === total;
}

// ---- selezione rapida e filtro ------------------------------------------

document.querySelectorAll("[data-quick]").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.quick === "all") videos.forEach((v) => selected.add(v.index));
    else selected.clear();
    renderRows();
  })
);

$("checkAll").addEventListener("change", (e) => {
  if (e.target.checked) videos.forEach((v) => selected.add(v.index));
  else selected.clear();
  renderRows();
});

$("applyFilter").addEventListener("click", applyFilter);
$("filter").addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyFilter();
});

async function applyFilter() {
  const expr = $("filter").value.trim();
  if (!expr) return;
  if (needsDates(expr) && videos.some((v) => v.uploadDate == null)) {
    await doResolveDates();
  }
  try {
    const idx = parseSelection(expr, videos);
    if (idx.length === 0) {
      $("listStatus").innerHTML = `<span class="skip">Nessun video corrisponde al filtro.</span>`;
      return;
    }
    idx.forEach((i) => selected.add(i)); // unione con la selezione corrente
    renderRows();
    $("listStatus").innerHTML = `<span class="ok">Aggiunti ${idx.length} video alla selezione.</span>`;
  } catch (e) {
    if (e instanceof SelectionError)
      $("listStatus").innerHTML = `<span class="skip">Filtro non valido: ${escapeHtml(e.message)}</span>`;
    else throw e;
  }
}

// ---- risoluzione date ----------------------------------------------------

$("resolveDates").addEventListener("click", doResolveDates);

async function doResolveDates() {
  const missing = videos.filter((v) => v.uploadDate == null).length;
  if (missing === 0) return;
  $("resolveDates").disabled = true;
  await resolveDates(videos, (done, total) => {
    $("listStatus").textContent = `Risolvo le date… ${done}/${total}`;
  });
  renderRows();
  $("listStatus").innerHTML = `<span class="ok">Date risolte.</span>`;
  $("resolveDates").disabled = false;
}

// ---- scaricamento trascrizioni ------------------------------------------

$("download").addEventListener("click", download);

async function download() {
  const chosen = videos.filter((v) => selected.has(v.index));
  const langs = $("langs").value.split(",").map((s) => s.trim()).filter(Boolean);
  if (langs.length === 0) langs.push("it");

  $("result").hidden = false;
  $("download").disabled = true;
  const files = [];
  const saved = [];
  const skipped = [];

  for (let i = 0; i < chosen.length; i++) {
    const v = chosen[i];
    setProgress(i, chosen.length, `Scarico ${i + 1}/${chosen.length}: ${v.title}`);
    try {
      const t = await fetchTranscript(v.videoId, langs);
      if (t.publishDate && !v.uploadDate) v.uploadDate = t.publishDate;
      const text = cleanSnippets(t.snippets);
      if (!text.trim()) throw Object.assign(new Error("trascrizione vuota"), { skip: true });
      const lang = t.language.toLowerCase().startsWith("it") ? null : t.language;
      const name = transcriptFilename(v, lang);
      files.push({ name, text: fileBody(v, t, text) });
      saved.push({ v, t, name });
    } catch (e) {
      if (e.skip) skipped.push({ v, reason: e.message });
      else skipped.push({ v, reason: "errore: " + e.message });
    }
  }

  setProgress(chosen.length, chosen.length, "Preparo l'archivio ZIP…");

  if (files.length > 0) {
    files.push({ name: "index.csv", text: indexCsv(saved) });
    const blob = await buildZip(files);
    triggerDownload(blob, zipName($("channel").value));
  }

  renderSummary(saved, skipped, files.length > 0);
  $("download").disabled = selected.size === 0;
}

function fileBody(v, t, text) {
  const header = [
    `Titolo: ${v.title}`,
    `Video ID: ${v.videoId}`,
    `URL: ${v.url}`,
    `Data: ${v.uploadDate ? v.uploadDate.toISOString().slice(0, 10) : "??????????"}`,
    `Lingua: ${t.language} (${t.isGenerated ? "auto-generata" : "manuale"})`,
    "",
    "-".repeat(72),
    "",
  ].join("\n");
  return header + text;
}

function indexCsv(saved) {
  const rows = [["video_id", "data", "titolo", "lingua", "auto_generata", "file", "url"]];
  for (const { v, t, name } of saved) {
    rows.push([
      v.videoId,
      v.uploadDate ? v.uploadDate.toISOString().slice(0, 10) : "",
      v.title,
      t.language,
      t.isGenerated ? "si" : "no",
      name,
      v.url,
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(s) {
  s = String(s);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function setProgress(done, total, msg) {
  $("dlStatus").textContent = msg;
  $("dlBar").style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
}

function renderSummary(saved, skipped, hasZip) {
  const parts = [];
  parts.push(
    `<div class="ok"><span class="count">${saved.length}</span> trascrizioni salvate` +
      (hasZip ? " nello ZIP scaricato (contiene anche <code>index.csv</code>)." : ".") +
      `</div>`
  );
  if (skipped.length) {
    parts.push(
      `<div class="skip" style="margin-top:10px"><span class="count">${skipped.length}</span> video saltati (senza trascrizione):</div>`
    );
    parts.push("<ul>");
    for (const { v, reason } of skipped) {
      parts.push(
        `<li class="skip"><a href="${v.url}" target="_blank">${escapeHtml(v.title)}</a> — ${escapeHtml(reason)}</li>`
      );
    }
    parts.push("</ul>");
  }
  $("dlSummary").innerHTML = parts.join("");
  $("dlBar").style.width = "100%";
}

function zipName(channelUrl) {
  const m = channelUrl.match(/@([\w.-]+)/);
  const who = m ? m[1] : "canale";
  const today = new Date().toISOString().slice(0, 10);
  return `trascrizioni_${who}_${today}.zip`;
}

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 4000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
