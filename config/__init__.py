"""Configuração: caminhos, parâmetros de execução e logging."""

from . import settings
from .logger import get_logger

__all__ = ["settings", "get_logger"]
