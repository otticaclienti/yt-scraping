#!/usr/bin/env python3
"""Punto d'ingresso: estrae le trascrizioni dei video scelti da un canale YouTube.

Uso:
    python transcribe.py https://www.youtube.com/@nomecanale
    python transcribe.py <url> --select year:2026
    python transcribe.py <url> --out trascrizioni --langs it
"""

from ytt.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
