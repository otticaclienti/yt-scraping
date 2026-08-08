"""Test del parser delle espressioni di selezione."""

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ytt.model import Video
from ytt import selection as sel


def make_videos():
    data = [
        ("aaa", "Intro 2026", date(2026, 3, 1)),
        ("bbb", "Video giugno 2026", date(2026, 6, 15)),
        ("ccc", "Retro 2025", date(2025, 12, 31)),
        ("ddd", "Vecchio 2024", date(2024, 1, 10)),
        ("eee", "Senza data", None),
    ]
    return [
        Video(index=i + 1, video_id=vid, title=t, url=f"http://x/{vid}", upload_date=d)
        for i, (vid, t, d) in enumerate(data)
    ]


def sel_ids(expr):
    vids = make_videos()
    return [v.video_id for v in sel.select_videos(expr, vids)]


def test_all():
    assert sel_ids("all") == ["aaa", "bbb", "ccc", "ddd", "eee"]


def test_single_index():
    assert sel_ids("2") == ["bbb"]


def test_range():
    assert sel_ids("2-4") == ["bbb", "ccc", "ddd"]


def test_range_reversed():
    assert sel_ids("4-2") == ["bbb", "ccc", "ddd"]


def test_year():
    assert sel_ids("year:2026") == ["aaa", "bbb"]


def test_year_ignores_unknown_date():
    # 'eee' non ha data: non deve comparire nei filtri per anno.
    assert "eee" not in sel_ids("year:2025")


def test_date_range():
    assert sel_ids("date:2026-01-01..2026-04-01") == ["aaa"]


def test_date_open_start():
    assert sel_ids("date:..2024-12-31") == ["ddd"]


def test_date_open_end():
    assert sel_ids("date:2026-06-01..") == ["bbb"]


def test_date_single_day():
    assert sel_ids("date:2025-12-31") == ["ccc"]


def test_last():
    assert sel_ids("last:2") == ["aaa", "bbb"]


def test_union_year_plus_index():
    assert sel_ids("year:2026 4") == ["aaa", "bbb", "ddd"]


def test_union_dedup():
    assert sel_ids("1 1 1-2") == ["aaa", "bbb"]


def test_needs_dates():
    assert sel.needs_dates("year:2026") is True
    assert sel.needs_dates("date:2026-01-01..") is True
    assert sel.needs_dates("1 2 3 all last:5") is False


def test_invalid_index():
    with pytest.raises(sel.SelectionError):
        sel_ids("99")


def test_invalid_token():
    with pytest.raises(sel.SelectionError):
        sel_ids("pippo")


def test_invalid_year():
    with pytest.raises(sel.SelectionError):
        sel_ids("year:20")


def test_invalid_date():
    with pytest.raises(sel.SelectionError):
        sel_ids("date:2026-13-99")


def test_zero_index_rejected():
    with pytest.raises(sel.SelectionError):
        sel_ids("0")
