# yt-scraping — Trascrizioni da un canale YouTube

Strumento da riga di comando che, dato l'URL di un canale YouTube, ti fa
**scegliere quali video prendere** (in modo flessibile) e ne **estrae le
trascrizioni** in testo pulito, un file per video, preferendo l'italiano.

Non serve alcuna API key di Google.

## Tre modi per usarlo

- **Segnalibro di Chrome (il più semplice, niente da installare)** — vedi
  [`bookmarklet/`](bookmarklet/README.md). Aggiungi un segnalibro una volta,
  poi da qualsiasi canale è un clic. Apri `bookmarklet/install.html` per la
  procedura guidata.
- **Estensione Chrome** — vedi [`extension/README.md`](extension/README.md).
  Come il segnalibro ma con un pulsante fisso; richiede la "modalità
  sviluppatore" o la pubblicazione sullo store.
- **Da terminale (Python)** — questo README qui sotto. Più affidabile, ideale
  per automazioni.

Tutte le versioni condividono la stessa sintassi di selezione (anno, intervallo
di date, indici, `last:N`, `all`).

## Come funziona

1. Legge l'elenco dei video del canale (veloce, tramite `yt-dlp`).
2. Ti mostra un **menu interattivo** dove selezioni i video.
3. Scarica la trascrizione di ciascun video selezionato (`youtube-transcript-api`),
   preferendo l'italiano (manuale, poi auto-generata).
4. Salva un file `.txt` pulito per video + un `index.csv` riepilogativo.
5. I video **senza trascrizione** vengono **saltati e segnalati** a fine run.

## Installazione

Richiede Python 3.9+.

```bash
python3 -m venv .venv
source .venv/bin/activate        # su Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

> Nota: lo strumento contatta YouTube. Va eseguito su una rete che possa
> raggiungere youtube.com (in alcuni ambienti l'accesso è bloccato).

## Uso

Modalità interattiva (consigliata):

```bash
python transcribe.py https://www.youtube.com/@nomecanale
```

Vedrai l'elenco dei video e un prompt `Selezione>`. Digita `help` per la
sintassi. Alcuni esempi di selezione:

| Cosa vuoi | Cosa digiti |
|-----------|-------------|
| Tutti i video del 2026 | `year:2026` |
| Un intervallo di date | `date:2026-01-01..2026-06-30` |
| Dal 1 marzo 2026 in poi | `date:2026-03-01..` |
| I 20 più recenti | `last:20` |
| Alcuni scelti a mano | `3 7 15` |
| Un intervallo di posizioni | `5-12` |
| Il 2026 + alcuni a mano | `year:2026 3 7 15-18` |
| Proprio tutti | `all` |

I criteri si **combinano**: quelli su una stessa riga vengono uniti. Dopo aver
visto quanti video hai selezionato puoi confermare, aggiungerne altri o rifare.

### Modalità non interattiva

Utile per automatizzare o ripetere sempre la stessa selezione:

```bash
# tutte le trascrizioni del 2026 nella cartella ./trascrizioni
python transcribe.py https://www.youtube.com/@nomecanale \
    --select "year:2026" --out trascrizioni
```

### Opzioni principali

| Opzione | Descrizione |
|---------|-------------|
| `-o, --out DIR` | cartella di output (default: `transcripts`) |
| `-l, --langs it,en` | lingue preferite, in ordine (default: `it`) |
| `--select "EXPR"` | selezione non interattiva, salta il menu |
| `--resolve-dates` | risolve subito tutte le date (utile con `--select year:`) |
| `--overwrite` | riscrive i file già esistenti |

## Le date di pubblicazione

L'elenco "veloce" del canale non contiene le date. Lo strumento le risolve in
parallelo **solo quando servono** (cioè quando usi un filtro `year:` o `date:`,
o quando digiti `dates` nel menu). Fino ad allora l'elenco è comunque
navigabile e selezionabile per posizione/titolo.

## Output

Per ogni video salvato viene creato un file:

```
transcripts/
├── 2026-03-14_titolo-del-video_VIDEOID.txt
├── 2026-06-02_altro-video_VIDEOID.txt
└── index.csv
```

Ogni `.txt` ha una piccola intestazione con i metadati (titolo, URL, data,
lingua) seguita dal testo pulito. `index.csv` elenca tutte le trascrizioni
salvate.

## Passo futuro: analisi dei concetti

L'output è pensato per un secondo passo che analizzi ogni trascrizione ed
estragga i concetti principali. Quel passo dovrà semplicemente:

- leggere `transcripts/index.csv` (o iterare i file `.txt` della cartella);
- per ciascun file, saltare l'intestazione (fino alla riga di trattini `----`)
  e analizzare il testo che segue.

Metadati e testo sono già separati e in chiaro, così l'analisi non richiede
altre chiamate di rete.

## Struttura del progetto

```
transcribe.py          # entry point
ytt/
├── channel.py         # elenco video del canale + risoluzione date (yt-dlp)
├── selection.py       # parsing delle espressioni di selezione
├── transcripts.py     # download trascrizione, preferenza italiano
├── textutil.py        # pulizia testo e nomi file
├── model.py           # struttura dati Video
└── cli.py             # menu interattivo e orchestrazione
tests/                 # test offline (parser selezione, pulizia testo)
```

## Test

```bash
pip install pytest
python -m pytest tests/ -q
```
