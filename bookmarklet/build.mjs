// Minifica src.js e produce la stringa "javascript:" da mettere nel segnalibro.
// Uso: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { minify } from "terser";

const src = readFileSync(new URL("./src.js", import.meta.url), "utf8");
const out = await minify(src, {
  compress: { passes: 2 },
  mangle: true,
  format: { comments: false },
});
if (out.error) throw out.error;

// Il prefisso "javascript:" rende la stringa un bookmarklet.
// encodeURIComponent evita problemi con caratteri speciali nell'URL del segnalibro.
const bookmarklet = "javascript:" + encodeURIComponent(out.code);

writeFileSync(new URL("./bookmarklet.txt", import.meta.url), bookmarklet);
writeFileSync(new URL("./bookmarklet.min.js", import.meta.url), out.code);

console.log("Minificato:", out.code.length, "caratteri");
console.log("Bookmarklet:", bookmarklet.length, "caratteri (scritto in bookmarklet.txt)");
