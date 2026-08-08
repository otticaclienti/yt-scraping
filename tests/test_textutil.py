"""Test della pulizia testo e dei nomi file."""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ytt.model import Video
from ytt import textutil as tu


def test_html_unescape():
    out = tu.clean_snippets(["l&#39;occhio", "&amp; altro"])
    assert "l'occhio" in out
    assert "& altro" in out


def test_removes_cue_lines():
    out = tu.clean_snippets(["[Musica]", "ciao a tutti", "[Applausi]"])
    assert "Musica" not in out
    assert "Applausi" not in out
    assert "ciao a tutti" in out


def test_inline_cue_removed():
    out = tu.clean_snippets(["ciao [Musica] mondo"])
    assert "Musica" not in out
    assert "ciao" in out and "mondo" in out


def test_newlines_flattened_and_joined():
    out = tu.clean_snippets(["prima\nriga", "seconda"])
    assert "prima riga seconda" in out.replace("\n", " ")


def test_sentence_split_adds_newlines():
    out = tu.clean_snippets(["Questa e' una frase. Questa e' un'altra frase."])
    assert "\n" in out


def test_empty():
    assert tu.clean_snippets([]) == ""
    assert tu.clean_snippets(["[Musica]"]) == ""


def test_slugify():
    assert tu.slugify("Ciao, Mondo! 2026 àèìòù") == "ciao-mondo-2026-aeiou"
    assert tu.slugify("") == "video"


def test_slugify_maxlen():
    s = tu.slugify("parola " * 30, max_len=20)
    assert len(s) <= 20
    assert not s.endswith("-")


def test_filename_italian():
    v = Video(index=1, video_id="abc123", title="Il mio Video",
              url="http://x", upload_date=date(2026, 3, 14))
    assert tu.transcript_filename(v) == "2026-03-14_il-mio-video_abc123.txt"


def test_filename_other_language_tag():
    v = Video(index=1, video_id="abc123", title="Video",
              url="http://x", upload_date=date(2026, 3, 14))
    assert tu.transcript_filename(v, lang="en") == "2026-03-14_video_abc123.en.txt"


def test_filename_no_date():
    v = Video(index=1, video_id="abc123", title="Video", url="http://x")
    assert tu.transcript_filename(v).startswith("0000-00-00_")
