"""Banco DuckDB: staging (registros lidos da bronze), silver e gold (SQL em /sql)."""
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import duckdb
import pyarrow as pa

from config import get_logger, settings
from extract import bronze
from transform.parsers import parse_events_page, parse_match_page, parse_results_page

logger = get_logger(__name__)

_I, _F, _S, _B = pa.int64(), pa.float64(), pa.string(), pa.bool_()

STAGING = {
    "results_listing": [
        ("match_id", _I), ("match_url", _S), ("unix_ms", _I), ("team1_nome", _S), ("team2_nome", _S),
        ("team1_score", _I), ("team2_score", _I), ("evento_nome", _S), ("formato", _S), ("estrelas", _I),
    ],
    "matches": [
        ("match_id", _I), ("parser_version", _I), ("match_url", _S), ("unix_ms", _I),
        ("event_id", _I), ("event_nome", _S),
        ("team1_id", _I), ("team1_nome", _S), ("team1_score", _I), ("team1_resultado", _S),
        ("team2_id", _I), ("team2_nome", _S), ("team2_score", _I), ("team2_resultado", _S),
        ("encerrada", _B), ("melhor_de", _I), ("online", _B), ("fase", _S),
    ],
    "match_maps": [
        ("match_id", _I), ("ordem", _I), ("mapa", _S), ("mapstats_id", _I), ("jogado", _B),
        ("team1_score", _I), ("team2_score", _I),
        ("team1_ct", _I), ("team1_tr", _I), ("team1_ot", _I),
        ("team2_ct", _I), ("team2_tr", _I), ("team2_ot", _I),
        ("team1_lado_inicial", _S), ("escolhido_por_team_id", _I),
    ],
    "match_vetos": [
        ("match_id", _I), ("ordem", _I), ("team_id", _I), ("acao", _S), ("mapa", _S),
    ],
    "player_stats": [
        ("match_id", _I), ("mapstats_id", _I), ("team_id", _I), ("player_id", _I), ("nick", _S),
        ("nome_completo", _S), ("lado", _S), ("kills", _I), ("deaths", _I), ("ekills", _I), ("edeaths", _I),
        ("swing_pct", _F), ("adr", _F), ("eadr", _F), ("kast_pct", _F),
        ("ekast_pct", _F), ("rating", _F), ("rating_versao", _S),
    ],
    "event_placements": [("event_id", _I), ("evento_nome", _S), ("colocacao", _S)],
}
_MATCH_TABLES = {"matches": "match", "match_maps": "maps", "match_vetos": "vetos", "player_stats": "player_stats"}


def _columns(con, table: str) -> list[str]:
    return [r[0] for r in con.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'staging' AND table_name = ? ORDER BY ordinal_position", [table]).fetchall()]


def connect(path: Path | None = None) -> duckdb.DuckDBPyConnection:
    path = path or settings.WAREHOUSE_PATH
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(path))
    for schema in ("staging", "silver", "gold"):
        con.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")

    # Tabela com colunas diferentes das esperadas é descartada e relida da bronze.
    stale = {t for t, cols in STAGING.items() if (have := _columns(con, t)) and have != [c for c, _ in cols]}
    if stale & _MATCH_TABLES.keys():
        stale |= _MATCH_TABLES.keys()  # as quatro andam juntas: `matches` marca o que já foi lido
    for table in stale:
        con.execute(f"DROP TABLE IF EXISTS staging.{table}")
    for table, columns in STAGING.items():
        con.register("_empty", pa.Table.from_pylist([], schema=pa.schema(columns)))
        con.execute(f"CREATE TABLE IF NOT EXISTS staging.{table} AS SELECT * FROM _empty")
        con.unregister("_empty")
    con.execute(
        "CREATE OR REPLACE TABLE staging.parametros AS SELECT ?::BIGINT AS time_id", [settings.TEAM_ID]
    )
    return con


def _insert(con, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    con.register("_rows", pa.Table.from_pylist(rows, schema=pa.schema(STAGING[table])))
    con.execute(f"INSERT INTO staging.{table} SELECT * FROM _rows")
    con.unregister("_rows")


def _delete_ids(con, table: str, ids, keep: bool = False) -> None:
    """Apaga as linhas das partidas em `ids` (ou, com keep=True, de todas as outras)."""
    con.register("_ids", pa.table({"match_id": pa.array(sorted(ids), type=_I)}))
    con.execute(f"DELETE FROM staging.{table} WHERE match_id {'NOT ' if keep else ''}IN (SELECT match_id FROM _ids)")
    con.unregister("_ids")


def _parse_match_file(path: Path) -> dict:
    return parse_match_page(bronze.load(path), bronze.match_id_of(path))


def _parse_matches(paths: list[Path]) -> list[dict]:
    """Poucos arquivos são lidos em sequência; uma releitura completa usa todos os núcleos."""
    if len(paths) < 40:
        return [_parse_match_file(p) for p in paths]
    with ProcessPoolExecutor() as pool:
        return list(pool.map(_parse_match_file, paths, chunksize=8))


def load_staging(con, bronze_root: Path | None = None, reparse_all: bool = False) -> int:
    """Interpreta o que há de novo na bronze. Devolve quantas partidas foram lidas."""
    # Lista de resultados: a carga diária só baixa as primeiras páginas, então as linhas
    # são acumuladas (a página mais nova prevalece) em vez de recriadas a cada execução.
    listing: dict[int, dict] = {}
    for path in reversed(bronze.list_files(bronze.RESULTS, bronze_root)):
        for row in parse_results_page(bronze.load(path))["matches"]:
            listing[row["match_id"]] = row
    if listing:
        _delete_ids(con, "results_listing", listing.keys())
        _insert(con, "results_listing", list(listing.values()))

    events = bronze.list_files(bronze.EVENTS, bronze_root)
    if events:
        con.execute("DELETE FROM staging.event_placements")
        _insert(con, "event_placements", parse_events_page(bronze.load(events[-1])))

    # A bronze é a fonte da verdade: partida sem arquivo sai do banco.
    files = {bronze.match_id_of(p): p for p in bronze.list_files(bronze.MATCHES, bronze_root)}
    for table in _MATCH_TABLES:
        _delete_ids(con, table, files.keys(), keep=True)

    # Partidas: só as ainda não lidas com a versão atual do parser.
    done = set()
    if not reparse_all:
        done = {r[0] for r in con.execute(
            "SELECT match_id FROM staging.matches WHERE parser_version = ?", [settings.PARSER_VERSION]
        ).fetchall()}
    paths = [p for match_id, p in files.items() if match_id not in done]
    if not paths:
        return 0

    logger.info(f"Interpretando {len(paths)} partida(s) da bronze...")
    parsed = _parse_matches(paths)
    ids = [p["match"]["match_id"] for p in parsed]
    for table, key in _MATCH_TABLES.items():
        _delete_ids(con, table, ids)
        if key == "match":
            rows = [{**p["match"], "parser_version": settings.PARSER_VERSION} for p in parsed]
        else:
            rows = [row for p in parsed for row in p[key]]
        _insert(con, table, rows)
    return len(parsed)


def run_sql_layer(con, layer: str) -> None:
    for path in sorted((settings.SQL_DIR / layer).glob("*.sql")):
        try:
            con.execute(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise RuntimeError(f"Erro em sql/{layer}/{path.name}: {exc}") from exc


def export_gold(con, export_dir: Path | None = None) -> list[str]:
    """Exporta em JSON as tabelas gold que o dashboard lê."""
    export_dir = Path(export_dir or settings.EXPORT_DIR)
    export_dir.mkdir(parents=True, exist_ok=True)
    for table in settings.DASHBOARD_TABLES:
        target = (export_dir / f"{table}.json").as_posix().replace("'", "''")  # pasta com apóstrofo no nome
        con.execute(f"COPY gold.{table} TO '{target}' (FORMAT JSON, ARRAY true)")
    return list(settings.DASHBOARD_TABLES)


def build(bronze_root: Path | None = None, db_path: Path | None = None,
          export_dir: Path | None = None, reparse_all: bool = False) -> dict:
    """bronze -> staging -> silver -> gold -> exportação. Tudo ou nada: falha no meio desfaz a carga."""
    con = connect(db_path)
    try:
        con.execute("BEGIN TRANSACTION")
        try:
            parsed = load_staging(con, bronze_root, reparse_all)
            run_sql_layer(con, "silver")
            run_sql_layer(con, "gold")
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
        tables = export_gold(con, export_dir)
        partidas = con.execute("SELECT count(*) FROM silver.fato_partida").fetchone()[0]
    finally:
        con.close()
    summary = {"partidas_interpretadas": parsed, "partidas_na_silver": partidas, "tabelas_exportadas": len(tables)}
    logger.info(f"Banco atualizado: {summary}")
    return summary
