"""Strutture dati condivise."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class Video:
    """Un video del canale.

    `upload_date` puo' essere None finche' non viene risolta (l'elenco "flat"
    del canale e' veloce ma non include la data di pubblicazione).
    """

    index: int              # posizione nell'elenco, 1-based (piu' recente = 1)
    video_id: str
    title: str
    url: str
    upload_date: Optional[date] = None
    duration: Optional[int] = None          # secondi, se disponibile

    @property
    def year(self) -> Optional[int]:
        return self.upload_date.year if self.upload_date else None

    @property
    def date_str(self) -> str:
        return self.upload_date.isoformat() if self.upload_date else "??????????"
