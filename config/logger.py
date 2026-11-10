"""Log da esteira: um arquivo por execução em logs/ e eco no console."""
import logging
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
KEEP_FILES = 30  # execuções mais antigas que isso são apagadas
_ROOT = "furia"
_configured = False


def _prune() -> None:
    old = sorted(LOG_DIR.glob("pipeline_furia_*.txt"))[:-(KEEP_FILES - 1)]
    for path in old:
        try:
            path.unlink()
        except OSError:
            pass  # arquivo em uso por outra execução


def _configure() -> None:
    global _configured
    if _configured:
        return
    _configured = True
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    _prune()
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    # delay=True: o arquivo só nasce na primeira mensagem (processos auxiliares não deixam arquivo vazio)
    file_handler = logging.FileHandler(
        LOG_DIR / f"pipeline_furia_{datetime.now():%Y%m%d_%H%M%S}.txt", encoding="utf-8", delay=True)
    console = logging.StreamHandler()
    root = logging.getLogger(_ROOT)
    root.setLevel(logging.INFO)
    root.propagate = False
    for handler in (file_handler, console):
        handler.setFormatter(formatter)
        root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    _configure()
    return logging.getLogger(f"{_ROOT}.{name}")
