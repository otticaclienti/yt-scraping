// Genera install.html incorporando il bookmarklet minificato.
import { readFileSync, writeFileSync } from "node:fs";

const bm = readFileSync(new URL("./bookmarklet.txt", import.meta.url), "utf8").trim();
const hrefAttr = bm.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const textArea = bm.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<title>Trascrizioni YouTube — installazione</title>
<style>
  :root{
    --bg:#f5f5f4; --card:#ffffff; --fg:#191917; --muted:#6c6a66; --line:#e6e5e2;
    --accent:#cc0f0f; --accent-ink:#ffffff; --accent-soft:#fbeaea; --ok:#127a37;
    --shadow:0 12px 32px rgba(20,18,16,.14);
  }
  :root:not([data-theme="light"]){ }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#17161a; --card:#201f24; --fg:#eceae6; --muted:#9a978f; --line:#302e35;
      --accent:#ff5a5a; --accent-ink:#1a1013; --accent-soft:#2a1b1e; --ok:#4cc26a;
      --shadow:0 14px 36px rgba(0,0,0,.5);
    }
  }
  :root[data-theme="dark"]{
    --bg:#17161a; --card:#201f24; --fg:#eceae6; --muted:#9a978f; --line:#302e35;
    --accent:#ff5a5a; --accent-ink:#1a1013; --accent-soft:#2a1b1e; --ok:#4cc26a;
    --shadow:0 14px 36px rgba(0,0,0,.5);
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--fg);
    font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:640px; margin:0 auto; padding:48px 20px 80px}
  .eyebrow{font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); font-weight:700; margin:0 0 10px}
  h1{font-size:30px; line-height:1.15; margin:0 0 10px; letter-spacing:-.01em; text-wrap:balance}
  .lead{font-size:17px; color:var(--muted); margin:0 0 32px; text-wrap:pretty}
  .hero{
    background:var(--card); border:1px solid var(--line); border-radius:16px;
    padding:28px; text-align:center; box-shadow:var(--shadow); margin-bottom:14px;
  }
  .hint-strong{font-weight:600; margin:0 0 18px}
  .grab{
    display:inline-flex; align-items:center; gap:10px; cursor:grab;
    background:var(--accent); color:var(--accent-ink); text-decoration:none;
    font-weight:700; font-size:17px; padding:15px 26px; border-radius:12px;
    box-shadow:0 6px 16px rgba(204,15,15,.28); user-select:none;
  }
  .grab:active{cursor:grabbing}
  .grab svg{width:20px; height:20px}
  .below{color:var(--muted); font-size:13px; margin:16px 0 0}
  ol.steps{list-style:none; counter-reset:s; padding:0; margin:26px 0 0; display:flex; flex-direction:column; gap:2px}
  ol.steps li{counter-increment:s; position:relative; padding:14px 4px 14px 48px; border-bottom:1px solid var(--line)}
  ol.steps li:last-child{border-bottom:0}
  ol.steps li::before{
    content:counter(s); position:absolute; left:0; top:12px; width:30px; height:30px;
    border-radius:50%; background:var(--accent-soft); color:var(--accent);
    display:grid; place-items:center; font-weight:700; font-size:14px;
  }
  .k{font-weight:600}
  h2{font-size:14px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:44px 0 12px}
  details{background:var(--card); border:1px solid var(--line); border-radius:12px; padding:6px 16px}
  summary{cursor:pointer; font-weight:600; padding:10px 0}
  textarea{
    width:100%; height:110px; margin-top:10px; padding:10px 12px; border:1px solid var(--line);
    border-radius:8px; background:var(--bg); color:var(--fg); font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;
    resize:vertical; white-space:pre; overflow:auto;
  }
  .copy{margin:10px 0 4px; padding:9px 16px; border:1px solid var(--line); border-radius:8px;
        background:var(--bg); color:var(--fg); font-weight:600; cursor:pointer}
  .copy:hover{border-color:var(--muted)}
  .manual-steps{margin:8px 0 14px; padding-left:18px; color:var(--fg)}
  .manual-steps li{margin:4px 0}
  .note{background:var(--accent-soft); border-radius:10px; padding:14px 16px; font-size:14px; color:var(--fg); margin-top:26px}
  code{background:var(--bg); border:1px solid var(--line); border-radius:5px; padding:1px 6px; font:13px ui-monospace,Menlo,Consolas,monospace}
  a.link{color:var(--accent)}
  footer{margin-top:40px; color:var(--muted); font-size:13px; text-align:center}
</style>

<div class="wrap">
  <p class="eyebrow">Nessuna installazione</p>
  <h1>Il tuo pulsante per le trascrizioni di YouTube</h1>
  <p class="lead">Un piccolo segnalibro per Chrome. Lo aggiungi una volta sola, poi da qualsiasi canale YouTube è un clic: scegli i video e scarichi le trascrizioni in un unico file ZIP.</p>

  <div class="hero">
    <p class="hint-strong">Trascina questo pulsante sulla barra dei preferiti di Chrome ⬆︎</p>
    <a class="grab" href="${hrefAttr}" title="Trascina sulla barra dei preferiti" draggable="true" onclick="return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 10h8M8 13h5"/></svg>
      Trascrizioni YouTube
    </a>
    <p class="below">La barra dei preferiti è la fila di scorciatoie sotto l'indirizzo. Non la vedi? Premi <span class="k">Ctrl</span>+<span class="k">Shift</span>+<span class="k">B</span> (su Mac <span class="k">⌘</span>+<span class="k">Shift</span>+<span class="k">B</span>) per mostrarla.</p>
  </div>

  <ol class="steps">
    <li><span class="k">Trascina</span> il pulsante rosso qui sopra sulla barra dei preferiti e rilascialo. Ora è un segnalibro.</li>
    <li>Vai sul <span class="k">canale YouTube</span> che ti interessa (es. <code>youtube.com/@nomecanale</code>).</li>
    <li><span class="k">Clicca il segnalibro</span> "Trascrizioni YouTube": si apre un pannello in alto a destra.</li>
    <li><span class="k">Scegli i video</span> — spunta a mano oppure usa il filtro (<code>year:2026</code>, <code>date:2026-01-01..2026-06-30</code>, <code>3 7 15</code>, <code>all</code>).</li>
    <li>Premi <span class="k">Scarica ZIP</span>: dentro trovi un file di testo per ogni video, più un <code>index.csv</code>.</li>
  </ol>

  <h2>Non riesci a trascinare?</h2>
  <details>
    <summary>Aggiungi il segnalibro a mano (metodo sicuro)</summary>
    <ol class="manual-steps">
      <li>Copia il codice qui sotto con il pulsante <span class="k">Copia il codice</span>.</li>
      <li>Sulla barra dei preferiti, <span class="k">clic destro</span> → <span class="k">Aggiungi pagina…</span></li>
      <li>In <span class="k">Nome</span> scrivi: <code>Trascrizioni YouTube</code></li>
      <li>In <span class="k">URL</span> incolla il codice copiato, poi <span class="k">Salva</span>.</li>
    </ol>
    <button class="copy" id="copyBtn">Copia il codice</button>
    <textarea id="code" readonly spellcheck="false">${textArea}</textarea>
  </details>

  <div class="note">
    <strong>Una nota onesta:</strong> funziona nel tuo Chrome dove sei già loggato su YouTube. È la prima versione: se al primo tentativo qualcosa non va, scrivimi cosa vedi (o mandami uno screenshot) e lo sistemo — non devi toccare nulla di tecnico.
  </div>

  <footer>Un file per video · italiano preferito · i video senza trascrizione vengono elencati a parte.</footer>
</div>

<script>
  var b = document.getElementById('copyBtn');
  if (b) b.addEventListener('click', function(){
    var t = document.getElementById('code');
    t.select(); t.setSelectionRange(0, t.value.length);
    navigator.clipboard.writeText(t.value).then(function(){
      b.textContent = 'Copiato ✓';
      setTimeout(function(){ b.textContent = 'Copia il codice'; }, 1800);
    }, function(){ document.execCommand('copy'); });
  });
</script>
`;

writeFileSync(new URL("./install.html", import.meta.url), html);
console.log("install.html scritto:", html.length, "caratteri");
