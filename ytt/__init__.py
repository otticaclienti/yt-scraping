"""ytt - Estrazione trascrizioni da un canale YouTube.

Moduli:
- channel:     recupero elenco video del canale (yt-dlp)
- selection:   parsing delle espressioni di selezione (anno, date, indici...)
- transcripts: recupero della trascrizione di un singolo video
- textutil:    pulizia del testo e nomi file
- cli:         menu interattivo e orchestrazione
"""

__version__ = "0.1.0"
