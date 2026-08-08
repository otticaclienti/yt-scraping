# Bookmarklet — "Trascrizioni YouTube"

Il modo più semplice, **senza installare nulla**: un segnalibro di Chrome che,
dalla pagina di un canale YouTube, apre un pannello per scegliere i video ed
estrarre le trascrizioni (un file per video in un unico ZIP + `index.csv`).

Gira dentro la pagina youtube.com, quindi usa la tua sessione e non ha problemi
di CORS. Non serve Python, né estensioni, né server.

## Come lo usa una persona non tecnica

Apri **`install.html`** in Chrome e segui le istruzioni: si trascina un pulsante
sulla barra dei preferiti, una volta sola. Poi, da qualsiasi canale, si clicca
quel segnalibro.

## File

| File | Cos'è |
|------|-------|
| `src.js` | sorgente leggibile del bookmarklet |
| `build.mjs` | minifica `src.js` → `bookmarklet.min.js` e `bookmarklet.txt` |
| `bookmarklet.txt` | la stringa `javascript:…` da mettere nel segnalibro |
| `generate-install.mjs` | incorpora il bookmarklet in `install.html` |
| `install.html` | pagina di installazione (bottone da trascinare) |

## Rigenerare dopo una modifica a `src.js`

```bash
cd bookmarklet
npm install --no-save terser   # solo la prima volta
node build.mjs
node generate-install.mjs
```

## Note

- Selezione e pulizia del testo condividono la logica con la versione Python e
  con l'estensione (stessa sintassi: `year:`, `date:`, `N`, `N-M`, `last:N`, `all`).
- Se YouTube cambia le sue pagine e qualcosa smette di funzionare, la parte da
  aggiornare è quella di rete dentro `src.js` (funzioni `getVideos`,
  `getTranscript`, `resolveDates`).
