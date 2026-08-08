// Test offline della logica pura dell'estensione (Node, nessuna rete).
import assert from "node:assert/strict";
import test from "node:test";

import { parseSelection, needsDates, SelectionError } from "../lib/selection.js";
import { cleanSnippets, slugify, transcriptFilename } from "../lib/clean.js";
import { buildZip } from "../lib/zip.js";

function makeVideos() {
  const mk = (i, id, title, iso) => ({
    index: i,
    videoId: id,
    title,
    url: "http://x/" + id,
    uploadDate: iso ? new Date(iso + "T00:00:00Z") : null,
  });
  return [
    mk(1, "aaa", "Intro 2026", "2026-03-01"),
    mk(2, "bbb", "Video giugno 2026", "2026-06-15"),
    mk(3, "ccc", "Retro 2025", "2025-12-31"),
    mk(4, "ddd", "Vecchio 2024", "2024-01-10"),
    mk(5, "eee", "Senza data", null),
  ];
}
const ids = (expr) =>
  parseSelection(expr, makeVideos())
    .map((i) => makeVideos()[i - 1].videoId);

test("all", () => assert.deepEqual(ids("all"), ["aaa", "bbb", "ccc", "ddd", "eee"]));
test("indice singolo", () => assert.deepEqual(ids("2"), ["bbb"]));
test("intervallo", () => assert.deepEqual(ids("2-4"), ["bbb", "ccc", "ddd"]));
test("intervallo invertito", () => assert.deepEqual(ids("4-2"), ["bbb", "ccc", "ddd"]));
test("year", () => assert.deepEqual(ids("year:2026"), ["aaa", "bbb"]));
test("year ignora date sconosciute", () => assert.ok(!ids("year:2025").includes("eee")));
test("date range", () => assert.deepEqual(ids("date:2026-01-01..2026-04-01"), ["aaa"]));
test("date inizio aperto", () => assert.deepEqual(ids("date:..2024-12-31"), ["ddd"]));
test("date fine aperta", () => assert.deepEqual(ids("date:2026-06-01.."), ["bbb"]));
test("date singolo giorno", () => assert.deepEqual(ids("date:2025-12-31"), ["ccc"]));
test("last:2", () => assert.deepEqual(ids("last:2"), ["aaa", "bbb"]));
test("unione year + indice", () => assert.deepEqual(ids("year:2026 4"), ["aaa", "bbb", "ddd"]));
test("unione con dedup", () => assert.deepEqual(ids("1 1 1-2"), ["aaa", "bbb"]));

test("needsDates", () => {
  assert.equal(needsDates("year:2026"), true);
  assert.equal(needsDates("date:2026-01-01.."), true);
  assert.equal(needsDates("1 2 all last:5"), false);
});

test("errori di selezione", () => {
  assert.throws(() => parseSelection("99", makeVideos()), SelectionError);
  assert.throws(() => parseSelection("pippo", makeVideos()), SelectionError);
  assert.throws(() => parseSelection("year:20", makeVideos()), SelectionError);
  assert.throws(() => parseSelection("date:2026-13-99", makeVideos()), SelectionError);
  assert.throws(() => parseSelection("0", makeVideos()), SelectionError);
});

test("clean: unescape + cue + frasi", () => {
  const out = cleanSnippets(["[Musica]", "l&#39;occhio va bene.", "Seconda frase qui."]);
  assert.ok(!out.includes("Musica"));
  assert.ok(out.includes("l'occhio"));
  assert.ok(out.includes("\n")); // spezza le frasi
});

test("clean: cue inline e newline interni", () => {
  const out = cleanSnippets(["ciao [Applausi] mondo", "prima\nriga"]);
  assert.ok(!out.includes("Applausi"));
  assert.ok(out.replace(/\n/g, " ").includes("ciao  mondo prima riga") ||
            out.replace(/\n/g, " ").includes("ciao mondo prima riga"));
});

test("clean: vuoto", () => {
  assert.equal(cleanSnippets([]), "");
  assert.equal(cleanSnippets(["[Musica]"]), "");
});

test("slugify", () => {
  assert.equal(slugify("Ciao, Mondo! 2026 àèìòù"), "ciao-mondo-2026-aeiou");
  assert.equal(slugify(""), "video");
});

test("nome file it e altra lingua", () => {
  const v = { videoId: "abc123", title: "Il mio Video", uploadDate: new Date("2026-03-14T00:00:00Z") };
  assert.equal(transcriptFilename(v), "2026-03-14_il-mio-video_abc123.txt");
  assert.equal(transcriptFilename(v, "en"), "2026-03-14_il-mio-video_abc123.en.txt");
});

test("zip: costruzione valida (firma PK e EOCD)", async () => {
  const blob = await buildZip([
    { name: "a.txt", text: "contenuto uno\nseconda riga" },
    { name: "b.txt", text: "x".repeat(5000) },
  ]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
  // EOCD alla fine
  const tail = buf.slice(buf.length - 22);
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  assert.equal(dv.getUint32(0, true), 0x06054b50);
  assert.equal(dv.getUint16(10, true), 2); // 2 voci
});
