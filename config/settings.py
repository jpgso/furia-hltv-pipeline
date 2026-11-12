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
TEAM_ID = 8297   # identificador da FURIA nas páginas guardadas na bronze

# -------------------------------------------------------------------- leitura
# Incrementar sempre que transform/parsers.py mudar o que extrai:
# na execução seguinte toda a bronze é reinterpretada.
PARSER_VERSION = 2
