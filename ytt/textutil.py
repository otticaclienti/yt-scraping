"""Pulizia del testo delle trascrizioni e generazione dei nomi file."""

from __future__ import annotations

import html
import re
import unicodedata
from typing import List, Optional

from .model import Video

# Righe/segmenti che sono solo indicazioni sonore, es. "[Musica]", "[Applause]".
_CUE_RE = re.compile(r"^\s*[\[(](?:musica|music|applausi|applause|risate|"
                     r"laughter|rumore|noise|silenzio|silence|"
                     r"[^\])]{0,30})[\])]\s*$", re.IGNORECASE)
_INLINE_CUE_RE = re.compile(r"[\[(](?:musica|music|applausi|applause|risate|"
                            r"laughter)[\])]", re.IGNORECASE)
_WS_RE = re.compile(r"[ \t ]+")
_MULTINL_RE = re.compile(r"\n{3,}")


def clean_snippets(snippets: List[str]) -> str:
    """Trasforma i segmenti grezzi della trascrizione in testo pulito.

    - decodifica le entita' HTML (&#39; -> ')
    - rimuove le indicazioni sonore ([Musica], [Applausi]...)
    - normalizza spazi e a-capo
    - unisce i segmenti in un flusso leggibile, con un a-capo per pausa lunga
    """
    lines: List[str] = []
    for raw in snippets:
        if raw is None:
            continue
        text = html.unescape(raw)
        # I sottotitoli auto-generati usano spesso "\n" interni: appiattisci.
        text = text.replace("\n", " ")
        if _CUE_RE.match(text):
            continue
        text = _INLINE_CUE_RE.sub(" ", text)
        text = _WS_RE.sub(" ", text).strip()
        if text:
            lines.append(text)

    # Unisci in un unico paragrafo: i sottotitoli sono spezzati in modo
    # arbitrario, quindi ricomponiamo un flusso continuo e poi spezziamo in
    # frasi per leggibilita'.
    joined = " ".join(lines)
    joined = _WS_RE.sub(" ", joined).strip()
    return _split_sentences(joined)


def _split_sentences(text: str) -> str:
    """A-capo dopo la punteggiatura di fine frase, per un testo piu' leggibile."""
    if not text:
        return ""
    # Inserisce un a-capo dopo . ! ? seguiti da spazio + maiuscola.
    out = re.sub(r"([.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«\"])", r"\1\n", text)
    out = _MULTINL_RE.sub("\n\n", out)
    return out.strip() + "\n"


def slugify(text: str, max_len: int = 60) -> str:
    """Slug sicuro per nomi file: ascii, minuscolo, trattini."""
    norm = unicodedata.normalize("NFKD", text)
    norm = norm.encode("ascii", "ignore").decode("ascii")
    norm = norm.lower()
    norm = re.sub(r"[^a-z0-9]+", "-", norm).strip("-")
    if len(norm) > max_len:
        norm = norm[:max_len].rstrip("-")
    return norm or "video"


def transcript_filename(video: Video, lang: Optional[str] = None) -> str:
    """Nome file per la trascrizione: DATA_titolo_VIDEOID[.lang].txt."""
    date_part = video.upload_date.isoformat() if video.upload_date else "0000-00-00"
    slug = slugify(video.title)
    lang_part = f".{lang}" if lang else ""
    return f"{date_part}_{slug}_{video.video_id}{lang_part}.txt"
