from pathlib import Path

# ------------------------------------------------------------------ caminhos
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
BRONZE_DIR = DATA_DIR / "bronze"          # HTML bruto compactado (.html.gz)
WAREHOUSE_PATH = DATA_DIR / "furia.duckdb"  # staging + silver + gold
EXPORT_DIR = DATA_DIR / "gold_export"      # gold em JSON/Parquet para o dashboard
SQL_DIR = BASE_DIR / "sql"
DASHBOARD_DIR = BASE_DIR / "docs"          # site estático publicado pelo GitHub Pages
DASHBOARD_DATA_DIR = DASHBOARD_DIR / "data"
# Tabelas gold que o dashboard lê no navegador
DASHBOARD_TABLES = ("partidas", "detalhe_mapas", "detalhe_jogadores", "detalhe_jogadores_lado",
                    "detalhe_vetos", "lineups", "desempenho_por_evento")
PUBLISH_BRANCH = "main"                   # a publicação automática só envia a partir desta branch

# ---------------------------------------------------------------------- time
TEAM_ID = 8297
TEAM_SLUG = "furia"

# ---------------------------------------------------------------------- URLs
BASE_URL = "https://www.hltv.org"
URL_RESULTS = f"{BASE_URL}/results?team={TEAM_ID}"
URL_EVENTS = f"{BASE_URL}/stats/teams/events/{TEAM_ID}/{TEAM_SLUG}"
RESULTS_PAGE_SIZE = 100  # a HLTV lista 100 partidas por página de resultados

# ------------------------------------------------------------------ extração
CHROME_DEBUG_PORT = 9222
DELAY_RANGE = (1.5, 3.0)   # pausa entre páginas, em segundos
PAGE_TIMEOUT = 30          # espera máxima pelo conteúdo de uma página
CHALLENGE_TIMEOUT = 300    # espera máxima pela verificação manual do Cloudflare
EVENTS_CHALLENGE_TIMEOUT = 90  # a página de eventos é opcional: espera menos
RECENT_MATCH_DAYS = 3      # partida recente sem estatísticas é tentada de novo

# Incrementar sempre que transform/parsers.py mudar o que extrai:
# na execução seguinte todo o bronze é reinterpretado, sem nova raspagem.
PARSER_VERSION = 2
