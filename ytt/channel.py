"""Recupero dell'elenco dei video di un canale tramite yt-dlp.

Strategia in due tempi:
  1. estrazione "flat": velocissima, restituisce id/titolo/url in ordine
     cronologico inverso (piu' recente per primo), ma SENZA data di pubblicazione;
  2. risoluzione date (opzionale, parallela): recupera la data reale per ogni
     video. Serve solo se si usano i filtri per anno/data, oppure per mostrarle
     nel menu.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from typing import Callable, List, Optional

from .model import Video


class ChannelError(RuntimeError):
    pass


def _ydl(opts: dict):
    # Import ritardato: yt-dlp e' una dipendenza pesante e serve solo a runtime.
    try:
        import yt_dlp
    except ImportError as exc:  # pragma: no cover
        raise ChannelError(
            "yt-dlp non e' installato. Esegui: pip install -r requirements.txt"
        ) from exc
    base = {"quiet": True, "no_warnings": True, "skip_download": True}
    base.update(opts)
    return yt_dlp.YoutubeDL(base)


def _videos_url(channel_url: str) -> str:
    """Normalizza verso la scheda '/videos' del canale.

    Accetta @handle, /channel/ID, /c/nome, /user/nome, o l'URL gia' su /videos.
    """
    url = channel_url.strip().rstrip("/")
    lower = url.lower()
    if lower.endswith("/videos") or lower.endswith("/streams") or "watch?v=" in lower:
        return url
    if "playlist?list=" in lower or "/playlist" in lower:
        return url
    return url + "/videos"


def _parse_upload_date(entry: dict) -> Optional[date]:
    raw = entry.get("upload_date")  # 'YYYYMMDD'
    if raw:
        try:
            return datetime.strptime(str(raw), "%Y%m%d").date()
        except ValueError:
            pass
    ts = entry.get("timestamp") or entry.get("release_timestamp")
    if ts:
        try:
            return datetime.utcfromtimestamp(int(ts)).date()
        except (ValueError, OverflowError, OSError):
            pass
    return None


def fetch_video_list(channel_url: str) -> List[Video]:
    """Elenco veloce (flat) dei video del canale, ordinato dal piu' recente."""
    url = _videos_url(channel_url)
    opts = {"extract_flat": "in_playlist"}
    with _ydl(opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as exc:  # yt_dlp.utils.DownloadError e simili
            raise ChannelError(f"Impossibile leggere il canale: {exc}") from exc

    entries = info.get("entries") or []
    videos: List[Video] = []
    i = 0
    for e in entries:
        if not e:
            continue
        vid = e.get("id")
        if not vid:
            continue
        i += 1
        videos.append(
            Video(
                index=i,
                video_id=vid,
                title=e.get("title") or "(senza titolo)",
                url=e.get("url") or f"https://www.youtube.com/watch?v={vid}",
                upload_date=_parse_upload_date(e),
                duration=e.get("duration"),
            )
        )
    if not videos:
        raise ChannelError(
            "Nessun video trovato. Controlla l'URL del canale "
            "(es. https://www.youtube.com/@nomecanale)."
        )
    return videos


def _fetch_single_date(video_id: str) -> Optional[date]:
    opts = {"extract_flat": False}
    with _ydl(opts) as ydl:
        try:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}",
                download=False,
                process=False,
            )
        except Exception:
            return None
    return _parse_upload_date(info or {})


def resolve_dates(
    videos: List[Video],
    max_workers: int = 8,
    progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    """Riempie `upload_date` per i video che non ce l'hanno (in parallelo).

    `progress(done, total)` viene chiamata dopo ogni video risolto.
    Modifica gli oggetti Video sul posto.
    """
    todo = [v for v in videos if v.upload_date is None]
    total = len(todo)
    if total == 0:
        if progress:
            progress(0, 0)
        return

    done = 0
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_single_date, v.video_id): v for v in todo}
        for fut in as_completed(futures):
            v = futures[fut]
            try:
                v.upload_date = fut.result()
            except Exception:
                v.upload_date = None
            done += 1
            if progress:
                progress(done, total)
