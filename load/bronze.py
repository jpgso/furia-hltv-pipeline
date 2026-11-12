"""Camada bronze: o HTML de cada página guardada, exatamente como veio, compactado.

O nome do arquivo identifica a partida; a esteira lê o que estiver na pasta.
"""
import gzip
import os
from pathlib import Path

from config import settings

MATCHES = "matches"
RESULTS = "results"
EVENTS = "events"


def _path(kind: str, name: str, root: Path | None = None) -> Path:
    return (root or settings.BRONZE_DIR) / kind / f"{name}.html.gz"


def save(kind: str, name: str, html: str, root: Path | None = None) -> Path:
    """Grava de forma atômica: uma queda no meio não deixa arquivo corrompido."""
    path = _path(kind, name, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as fh:
        fh.write(html)
    os.replace(tmp, path)
    return path


def load(path: Path) -> str:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return fh.read()


def results_name(offset: int) -> str:
    return f"offset_{offset:05d}"


def list_files(kind: str, root: Path | None = None) -> list[Path]:
    folder = (root or settings.BRONZE_DIR) / kind
    return sorted(folder.glob("*.html.gz")) if folder.exists() else []


def match_id_of(path: Path | str) -> int:
    """O nome do arquivo é o id da partida: 2367598.html.gz."""
    return int(Path(path).name.split(".")[0])


def saved_match_ids(root: Path | None = None) -> set[int]:
    return {match_id_of(p) for p in list_files(MATCHES, root)}
