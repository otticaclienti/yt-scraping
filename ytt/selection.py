"""Parsing delle espressioni di selezione dei video.

Un'espressione e' una sequenza di token separati da spazi; la selezione finale
e' l'UNIONE degli insiemi prodotti da ciascun token.

Token supportati (combinabili nella stessa riga):
  all                      tutti i video
  N                        il video numero N (indice 1-based mostrato in elenco)
  N-M                      intervallo di indici, estremi inclusi
  last:N                   gli N video piu' recenti
  year:YYYY                tutti i video pubblicati in quell'anno
  date:YYYY-MM-DD..YYYY-MM-DD   intervallo di date (inclusivo)
  date:YYYY-MM-DD..        dalla data in poi
  date:..YYYY-MM-DD        fino alla data
  date:YYYY-MM-DD          un singolo giorno

Esempi:
  "all"
  "year:2026"
  "date:2026-01-01..2026-06-30"
  "year:2026 3 7 15-18"        (il 2026 piu' alcuni scelti a mano)

I token che richiedono la data (year:/date:) hanno effetto solo sui video di
cui e' nota la data di pubblicazione; se un video ha data sconosciuta viene
ignorato da quei filtri (ma resta selezionabile per indice).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Iterable, List, Set

from .model import Video


class SelectionError(ValueError):
    """Espressione di selezione non valida."""


def _parse_iso_date(s: str) -> date:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError as exc:
        raise SelectionError(f"data non valida '{s}' (usa YYYY-MM-DD)") from exc


def _token_indices(token: str, videos: List[Video]) -> Set[int]:
    """Risolve un singolo token in un insieme di indici (1-based)."""
    n = len(videos)
    all_idx = {v.index for v in videos}
    t = token.strip().lower()

    if not t:
        return set()

    if t == "all":
        return set(all_idx)

    if t.startswith("last:"):
        raw = t[len("last:"):]
        if not raw.isdigit() or int(raw) <= 0:
            raise SelectionError(f"'{token}': last: richiede un intero positivo")
        k = int(raw)
        # I video sono ordinati dal piu' recente (index 1) al piu' vecchio.
        return {v.index for v in videos if v.index <= k}

    if t.startswith("year:"):
        raw = t[len("year:"):]
        if not raw.isdigit() or len(raw) != 4:
            raise SelectionError(f"'{token}': year: richiede un anno a 4 cifre")
        y = int(raw)
        return {v.index for v in videos if v.year == y}

    if t.startswith("date:"):
        return _date_token_indices(token, t[len("date:"):], videos)

    # Intervallo di indici N-M
    if "-" in t and not t.startswith("-"):
        a, _, b = t.partition("-")
        if a.isdigit() and b.isdigit():
            lo, hi = int(a), int(b)
            if lo == 0 or hi == 0:
                raise SelectionError(f"'{token}': gli indici partono da 1")
            if lo > hi:
                lo, hi = hi, lo
            return {i for i in range(lo, hi + 1) if i in all_idx}

    # Indice singolo N
    if t.isdigit():
        i = int(t)
        if i == 0:
            raise SelectionError("gli indici partono da 1")
        if i not in all_idx:
            raise SelectionError(f"indice {i} fuori intervallo (1..{n})")
        return {i}

    raise SelectionError(f"token non riconosciuto: '{token}'")


def _date_token_indices(token: str, spec: str, videos: List[Video]) -> Set[int]:
    if ".." in spec:
        lo_s, _, hi_s = spec.partition("..")
        lo = _parse_iso_date(lo_s) if lo_s else date.min
        hi = _parse_iso_date(hi_s) if hi_s else date.max
    else:
        lo = hi = _parse_iso_date(spec)
    if lo > hi:
        lo, hi = hi, lo
    return {
        v.index
        for v in videos
        if v.upload_date is not None and lo <= v.upload_date <= hi
    }


def parse_selection(expression: str, videos: List[Video]) -> List[int]:
    """Restituisce gli indici selezionati (ordinati) per l'espressione data.

    Solleva SelectionError se un token e' malformato.
    """
    selected: Set[int] = set()
    for token in expression.split():
        selected |= _token_indices(token, videos)
    return sorted(selected)


def select_videos(expression: str, videos: List[Video]) -> List[Video]:
    """Come parse_selection ma restituisce direttamente gli oggetti Video."""
    idx = set(parse_selection(expression, videos))
    return [v for v in videos if v.index in idx]


def needs_dates(expression: str) -> bool:
    """True se l'espressione usa filtri che richiedono le date di pubblicazione."""
    toks = expression.lower().split()
    return any(t.startswith("year:") or t.startswith("date:") for t in toks)
