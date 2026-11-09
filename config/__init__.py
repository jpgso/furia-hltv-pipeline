"""
Módulo de Configuração (Settings & Observability)
Centraliza parâmetros de execução, variáveis globais e o sistema de logging corporativo.
"""

from .settings import (
    DATA_DIR, 
    URL_TEAM_MAPS, 
    URL_TEAM_MATCHES,
    URL_TEAM_EVENTS,
    URL_TEAM_LINEUPS,
    URL_PLAYER_STATS, 
    MAX_PAGES_TO_SCRAPE, 
    USER_AGENT
)
from .logger import get_logger

__all__ = [
    "DATA_DIR", 
    "URL_TEAM_MAPS",
    "URL_TEAM_MATCHES",
    "URL_TEAM_EVENTS",
    "URL_TEAM_LINEUPS",
    "URL_PLAYER_STATS", 
    "MAX_PAGES_TO_SCRAPE", 
    "USER_AGENT", 
    "get_logger"
]