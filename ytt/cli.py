"""Menu interattivo e orchestrazione dell'estrazione."""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import List, Optional

from . import channel as channel_mod
from . import selection as sel
from . import transcripts as tr
from .model import Video
from .textutil import transcript_filename

HELP_SELECTION = """\
Come selezionare i video (puoi combinare piu' elementi separati da spazi):
  all                          tutti i video
  3                            il video numero 3
  5-10                         dal 5 al 10 (inclusi)
  last:20                      i 20 video piu' recenti
  year:2026                    tutti quelli del 2026
  date:2026-01-01..2026-06-30  in un intervallo di date
  date:2026-03-01..            dal 1 marzo 2026 in poi
  date:..2025-12-31            fino al 31 dicembre 2025

Esempi:
  year:2026
  year:2026 3 7 15-18
  date:2026-01-01..2026-03-31 42

Comandi del menu:
  list [N]     mostra l'elenco (opz. le prime N righe)
  dates        risolve/aggiorna le date di pubblicazione
  help         mostra questo aiuto
  quit         esci senza scaricare
"""


# --------------------------------------------------------------------------- #
# Stampa elenco                                                               #
# --------------------------------------------------------------------------- #

def _fmt_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "  --  "
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h:d}:{m:02d}:{s:02d}"
    return f"  {m:d}:{s:02d}"


def print_list(videos: List[Video], limit: Optional[int] = None) -> None:
    rows = videos if limit is None else videos[:limit]
    width = len(str(len(videos)))
    print()
    for v in rows:
        title = v.title if len(v.title) <= 70 else v.title[:67] + "..."
        print(f"  [{v.index:>{width}}]  {v.date_str}  {_fmt_duration(v.duration)}  {title}")
    if limit is not None and len(videos) > limit:
        print(f"  ... e altri {len(videos) - limit} video (usa 'list' per vederli tutti)")
    print()


# --------------------------------------------------------------------------- #
# Risoluzione date con avanzamento                                            #
# --------------------------------------------------------------------------- #

def _resolve_dates_with_progress(videos: List[Video]) -> None:
    missing = sum(1 for v in videos if v.upload_date is None)
    if missing == 0:
        return
    print(f"Risolvo le date di pubblicazione di {missing} video...", flush=True)

    def cb(done: int, total: int) -> None:
        bar_len = 30
        filled = int(bar_len * done / total) if total else bar_len
        bar = "#" * filled + "-" * (bar_len - filled)
        print(f"\r  [{bar}] {done}/{total}", end="", flush=True)

    channel_mod.resolve_dates(videos, progress=cb)
    print()  # newline dopo la barra


# --------------------------------------------------------------------------- #
# Menu interattivo                                                            #
# --------------------------------------------------------------------------- #

def interactive_select(videos: List[Video]) -> List[Video]:
    """Mostra il menu e restituisce i video scelti dall'utente."""
    print(f"\nTrovati {len(videos)} video nel canale.")
    print_list(videos, limit=25)
    print("Digita 'help' per la sintassi di selezione.\n")

    while True:
        try:
            line = input("Selezione> ").strip()
        except EOFError:
            print()
            return []
        if not line:
            continue

        low = line.lower()
        if low in ("quit", "q", "exit"):
            return []
        if low in ("help", "h", "?"):
            print(HELP_SELECTION)
            continue
        if low == "dates":
            _resolve_dates_with_progress(videos)
            print_list(videos, limit=25)
            continue
        if low == "list" or low.startswith("list "):
            parts = line.split()
            lim = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
            print_list(videos, limit=lim)
            continue

        # Se serve una data e non l'abbiamo, risolvila ora.
        if sel.needs_dates(line) and any(v.upload_date is None for v in videos):
            _resolve_dates_with_progress(videos)

        try:
            chosen = sel.select_videos(line, videos)
        except sel.SelectionError as exc:
            print(f"  ! {exc}\n")
            continue

        if not chosen:
            print("  Nessun video corrisponde a questa selezione. Riprova.\n")
            continue

        print(f"\n  Selezionati {len(chosen)} video:")
        print_list(chosen, limit=15)
        ans = input("  Procedo con lo scaricamento? [s/N/(a)ggiungi altro] ").strip().lower()
        if ans in ("s", "si", "y", "yes"):
            return chosen
        if ans in ("a", "add", "aggiungi"):
            print("  Aggiungi altri criteri (verranno uniti alla selezione).")
            # Ripeti il ciclo tenendo memoria: uniamo la prossima espressione.
            return _augment_loop(videos, chosen)
        print("  Selezione annullata, riprova.\n")


def _augment_loop(videos: List[Video], current: List[Video]) -> List[Video]:
    selected_idx = {v.index for v in current}
    while True:
        try:
            line = input("Aggiungi> ").strip()
        except EOFError:
            break
        if not line or line.lower() in ("ok", "fine", "done", ""):
            break
        if line.lower() in ("quit", "q"):
            return []
        if sel.needs_dates(line) and any(v.upload_date is None for v in videos):
            _resolve_dates_with_progress(videos)
        try:
            more = sel.select_videos(line, videos)
        except sel.SelectionError as exc:
            print(f"  ! {exc}")
            continue
        selected_idx |= {v.index for v in more}
        print(f"  Ora selezionati: {len(selected_idx)} video "
              f"(invio vuoto o 'ok' per procedere).")
    return [v for v in videos if v.index in selected_idx]


# --------------------------------------------------------------------------- #
# Scaricamento trascrizioni                                                   #
# --------------------------------------------------------------------------- #

def download_transcripts(
    videos: List[Video],
    out_dir: Path,
    languages: List[str],
    overwrite: bool = False,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: List[tuple] = []
    skipped: List[tuple] = []

    total = len(videos)
    for i, v in enumerate(videos, 1):
        prefix = f"[{i}/{total}] {v.video_id}"
        try:
            result = tr.fetch_transcript(v.video_id, languages=languages)
        except tr.NoTranscript as exc:
            print(f"  {prefix}  SALTATO ({exc.reason}): {v.title}")
            skipped.append((v, exc.reason))
            continue
        except Exception as exc:  # rete o casi imprevisti: salta ma segnala
            print(f"  {prefix}  SALTATO (errore: {exc}): {v.title}")
            skipped.append((v, f"errore: {exc}"))
            continue

        lang_tag = None if result.language.startswith("it") else result.language
        fname = transcript_filename(v, lang=lang_tag)
        path = out_dir / fname
        if path.exists() and not overwrite:
            print(f"  {prefix}  gia' presente, salto ({fname})")
            saved.append((v, result, fname))
            continue

        path.write_text(_file_body(v, result), encoding="utf-8")
        gen = "auto" if result.is_generated else "manuale"
        print(f"  {prefix}  OK [{result.language}/{gen}] -> {fname}")
        saved.append((v, result, fname))

    _write_index(out_dir, saved)
    _print_summary(out_dir, saved, skipped)


def _file_body(v: Video, result: tr.TranscriptResult) -> str:
    """Intestazione con metadati + testo pulito.

    L'intestazione e' in righe 'Chiave: valore' cosi' il futuro passo di
    analisi dei concetti puo' leggere i metadati senza chiamate di rete.
    """
    header = [
        f"Titolo: {v.title}",
        f"Video ID: {v.video_id}",
        f"URL: {v.url}",
        f"Data: {v.date_str}",
        f"Lingua: {result.language} ({'auto-generata' if result.is_generated else 'manuale'})",
        "",
        "-" * 72,
        "",
    ]
    return "\n".join(header) + result.text


def _write_index(out_dir: Path, saved: List[tuple]) -> None:
    """Indice CSV delle trascrizioni salvate (comodo per il passo successivo)."""
    index_path = out_dir / "index.csv"
    with index_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["video_id", "data", "titolo", "lingua", "auto_generata", "file", "url"])
        for v, result, fname in saved:
            w.writerow([
                v.video_id, v.date_str, v.title, result.language,
                "si" if result.is_generated else "no", fname, v.url,
            ])


def _print_summary(out_dir: Path, saved: List[tuple], skipped: List[tuple]) -> None:
    print("\n" + "=" * 60)
    print(f"Fatto. {len(saved)} trascrizioni salvate in: {out_dir}/")
    print(f"Indice: {out_dir / 'index.csv'}")
    if skipped:
        print(f"\n{len(skipped)} video saltati (senza trascrizione utilizzabile):")
        for v, reason in skipped:
            print(f"  - [{v.date_str}] {v.title}  ({reason})")
            print(f"      {v.url}")
    print("=" * 60)


# --------------------------------------------------------------------------- #
# Entry point                                                                 #
# --------------------------------------------------------------------------- #

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="transcribe",
        description="Estrae le trascrizioni dei video scelti da un canale YouTube.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=HELP_SELECTION,
    )
    p.add_argument("channel_url", help="URL del canale (es. https://www.youtube.com/@nomecanale)")
    p.add_argument("-o", "--out", default="transcripts", help="cartella di output (default: transcripts)")
    p.add_argument("-l", "--langs", default="it",
                   help="lingue preferite, separate da virgola (default: it)")
    p.add_argument("--select", metavar="EXPR",
                   help="selezione non interattiva (es. 'year:2026'); salta il menu")
    p.add_argument("--resolve-dates", action="store_true",
                   help="risolvi subito tutte le date (utile con --select year:/date:)")
    p.add_argument("--overwrite", action="store_true",
                   help="riscrivi i file gia' esistenti")
    return p


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    languages = [x.strip() for x in args.langs.split(",") if x.strip()] or ["it"]
    out_dir = Path(args.out)

    print(f"Leggo l'elenco dei video da: {args.channel_url}")
    try:
        videos = channel_mod.fetch_video_list(args.channel_url)
    except channel_mod.ChannelError as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 2

    if args.select is not None:
        if sel.needs_dates(args.select) or args.resolve_dates:
            _resolve_dates_with_progress(videos)
        try:
            chosen = sel.select_videos(args.select, videos)
        except sel.SelectionError as exc:
            print(f"Selezione non valida: {exc}", file=sys.stderr)
            return 2
        if not chosen:
            print("Nessun video corrisponde alla selezione.", file=sys.stderr)
            return 1
        print(f"Selezionati {len(chosen)} video.")
    else:
        if args.resolve_dates:
            _resolve_dates_with_progress(videos)
        chosen = interactive_select(videos)

    if not chosen:
        print("Nessun video selezionato. Uscita.")
        return 0

    print(f"\nScarico le trascrizioni ({len(chosen)} video), lingue preferite: {languages}\n")
    download_transcripts(chosen, out_dir, languages, overwrite=args.overwrite)
    return 0
