import os
from pathlib import Path

# Definição de caminhos absolutos baseados na raiz do projeto
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = os.path.join(BASE_DIR, "data")

# Governança: Garantindo a existência do Storage Local
os.makedirs(DATA_DIR, exist_ok=True)

# URLs do Ecossistema FURIA
URL_PLAYER_STATS = "https://www.hltv.org/stats/teams/players/8297/furia"
URL_TEAM_MAPS = "https://www.hltv.org/stats/teams/maps/8297/furia"
URL_TEAM_MATCHES = "https://www.hltv.org/stats/teams/matches/8297/furia"
URL_TEAM_EVENTS = "https://www.hltv.org/stats/teams/events/8297/furia"
URL_TEAM_LINEUPS = "https://www.hltv.org/stats/teams/lineups/8297/furia"

# Parâmetros de Execução e Evasão (Stealth)
MAX_PAGES_TO_SCRAPE = 50
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"