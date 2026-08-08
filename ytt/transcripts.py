"""Recupero della trascrizione di un singolo video, con preferenza italiano."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .textutil import clean_snippets


@dataclass
class TranscriptResult:
    text: str
    language: str          # codice lingua effettivo (es. 'it')
    is_generated: bool     # True se auto-generata da YouTube


class NoTranscript(Exception):
    """Il video non ha una trascrizione utilizzabile (da saltare e segnalare)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _api():
    from youtube_transcript_api import YouTubeTranscriptApi
    return YouTubeTranscriptApi()


def fetch_transcript(
    video_id: str,
    languages: Optional[List[str]] = None,
    allow_other_languages: bool = True,
) -> TranscriptResult:
    """Recupera e ripulisce la trascrizione di un video.

    Ordine di preferenza:
      1. trascrizione MANUALE nelle lingue richieste (default: it)
      2. trascrizione AUTO-GENERATA nelle lingue richieste
      3. (se allow_other_languages) qualunque manuale, poi qualunque generata

    Solleva NoTranscript se non c'e' nulla di utilizzabile.
    """
    from youtube_transcript_api import (
        NoTranscriptFound,
        TranscriptsDisabled,
        VideoUnavailable,
        VideoUnplayable,
        CouldNotRetrieveTranscript,
    )

    langs = languages or ["it"]
    api = _api()

    try:
        tlist = api.list(video_id)
    except TranscriptsDisabled:
        raise NoTranscript("trascrizioni disabilitate")
    except (VideoUnavailable, VideoUnplayable):
        raise NoTranscript("video non disponibile")
    except CouldNotRetrieveTranscript as exc:
        raise NoTranscript(f"impossibile recuperare la trascrizione ({type(exc).__name__})")

    transcript = None
    try:
        transcript = tlist.find_manually_created_transcript(langs)
    except NoTranscriptFound:
        try:
            transcript = tlist.find_generated_transcript(langs)
        except NoTranscriptFound:
            if allow_other_languages:
                transcript = _first_available(tlist)

    if transcript is None:
        raise NoTranscript(f"nessuna trascrizione nelle lingue {langs}")

    try:
        fetched = transcript.fetch()
    except CouldNotRetrieveTranscript as exc:
        raise NoTranscript(f"errore nel download ({type(exc).__name__})")

    snippets = [s.text for s in fetched]
    text = clean_snippets(snippets)
    if not text.strip():
        raise NoTranscript("trascrizione vuota")

    return TranscriptResult(
        text=text,
        language=transcript.language_code,
        is_generated=transcript.is_generated,
    )


def _first_available(tlist):
    """Prima manuale disponibile, altrimenti prima generata, altrimenti None."""
    manual = [t for t in tlist if not t.is_generated]
    if manual:
        return manual[0]
    generated = [t for t in tlist if t.is_generated]
    if generated:
        return generated[0]
    return None
