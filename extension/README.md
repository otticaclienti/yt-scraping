# Estensione Chrome — Estrattore Trascrizioni YouTube

Fa la stessa cosa dello strumento Python, ma **dentro Chrome**: nessun Python,
nessun terminale, nessun server. Usa la tua sessione YouTube già attiva nel
browser (quindi meno blocchi da parte di YouTube).

## Installazione (una volta sola)

1. Apri Chrome e vai su `chrome://extensions`.
2. In alto a destra attiva **Modalità sviluppatore**.
3. Clicca **Carica estensione non pacchettizzata**.
4. Seleziona **questa cartella** (`extension/`).

Comparirà l'icona dell'estensione nella barra di Chrome (se non la vedi,
cliccca sul puzzle 🧩 e "fissa" l'estensione).

## Uso

Due modi per aprire lo strumento:

- **Dalla pagina del canale**: vai su un canale YouTube e clicca l'icona
  dell'estensione — l'URL del canale viene compilato da solo.
- **Da qualsiasi pagina**: clicca l'icona e incolla a mano l'URL del canale.

Poi:

1. **Carica video**: appare l'elenco.
2. **Seleziona**: spunta le caselle a mano, oppure usa il **filtro** in alto.
   Il filtro usa la stessa sintassi combinabile della versione Python:
   - `year:2026` — tutti quelli del 2026
   - `date:2026-01-01..2026-06-30` — intervallo di date
   - `date:2026-03-01..` — da una data in poi
   - `last:20` — i 20 più recenti
   - `3 7 15` oppure `5-12` — scelti a mano
   - `all` — tutti
   - combinabili: `year:2026 3 7 15-18`
   > I filtri per anno/data richiedono le date esatte: premi **Risolvi date**
   > (o vengono risolte automaticamente all'uso del filtro).
3. **Scarica trascrizioni**: scarica un unico file **ZIP** con dentro un `.txt`
   pulito per ogni video (italiano preferito) + un `index.csv` riepilogativo.
   I video **senza trascrizione** vengono elencati come "saltati".

## Note e limiti

- Deve girare in un Chrome dove sei loggato normalmente su YouTube.
- YouTube cambia spesso le sue pagine: se un giorno l'elenco o le trascrizioni
  smettessero di funzionare, va aggiornata la logica in `lib/youtube.js`. La
  parte di selezione e pulizia (`lib/selection.js`, `lib/clean.js`) è stabile e
  coperta da test.
- Le **date esatte** non sono nell'elenco veloce del canale: vengono recuperate
  su richiesta (un accesso per video), come nella versione Python.

## Struttura

```
extension/
├── manifest.json      # dichiarazione dell'estensione (MV3)
├── background.js      # apre l'app al clic sull'icona
├── app.html / app.js  # interfaccia e orchestrazione
└── lib/
    ├── selection.js   # parsing dei filtri di selezione
    ├── clean.js       # pulizia testo + nomi file
    ├── youtube.js     # elenco canale, date, trascrizioni (rete)
    └── zip.js         # creazione ZIP senza dipendenze
tests/logic.test.mjs   # test offline (Node) della logica pura
```

## Test della logica (facoltativo)

```bash
cd extension
node --test tests/logic.test.mjs
```
