"""Orquestrador da esteira medalhão FURIA x HLTV.

    python main.py diario        baixa só partidas novas e atualiza o banco (padrão)
    python main.py historico     percorre todo o histórico e baixa o que faltar
    python main.py reconstruir   refaz silver e gold a partir da bronze, sem rede

Para execução automática (n8n, agendador): --json imprime um resumo na saída padrão
e --espera-desafio limita a espera pela verificação manual do Cloudflare.
"""
import argparse
import json
import sys
import time
import traceback

from config import get_logger, settings

logger = get_logger("pipeline")

MAX_PARTIDAS_NO_RESUMO = 20


def classify_failure(exc: Exception) -> str:
    """Traduz a falha da extração em um status que a automação sabe tratar."""
    from extract.browser import BrowserUnavailable, PageLoadError

    if isinstance(exc, BrowserUnavailable):
        return "sem_chrome"
    if isinstance(exc, PageLoadError) and "Cloudflare" in str(exc):
        return "cloudflare"
    return "erro"


def new_matches(match_ids, db_path=None) -> list[dict]:
    """Partidas recém-baixadas como aparecem na gold, da mais recente para a mais antiga."""
    import duckdb

    ids = sorted(int(i) for i in match_ids)
    if not ids:
        return []
    con = duckdb.connect(str(db_path or settings.WAREHOUSE_PATH), read_only=True)
    try:
        rows = con.execute(
            "SELECT partida_id, CAST(data AS VARCHAR), adversario, resultado, "
            "       placar_furia, placar_adversario, evento, mapas, url "
            "FROM gold.partidas WHERE partida_id IN (SELECT unnest(?)) "
            "ORDER BY data_hora DESC, partida_id DESC LIMIT ?",
            [ids, MAX_PARTIDAS_NO_RESUMO],
        ).fetchall()
    finally:
        con.close()
    cols = ("partida_id", "data", "adversario", "resultado", "placar_furia",
            "placar_adversario", "evento", "mapas", "url")
    return [dict(zip(cols, row)) for row in rows]


def run(mode: str, limit: int | None = None) -> dict:
    from extract import bronze
    from load import warehouse

    start = time.time()
    logger.info(f"=== Esteira FURIA/HLTV | modo: {mode} ===")
    summary = {"modo": mode, "status": "ok", "mensagem": "", "baixadas": 0, "adiadas": 0,
               "falhas": 0, "total_partidas": None, "partidas_novas": []}
    before = bronze.saved_match_ids()
    if mode != "reconstruir":
        try:
            from extract.crawler import run_extraction

            stats = run_extraction(full=(mode == "historico"), limit=limit)
            summary.update({k: stats[k] for k in ("adiadas", "falhas")})
        except Exception as exc:
            # O que já foi baixado está salvo na bronze: o banco é atualizado mesmo assim.
            summary["status"] = classify_failure(exc)
            summary["mensagem"] = str(exc)
            logger.critical(f"Extração interrompida: {exc}")
            logger.error(traceback.format_exc())
    downloaded = bronze.saved_match_ids() - before
    summary["baixadas"] = len(downloaded)
    try:
        built = warehouse.build(reparse_all=(mode == "reconstruir"))
        summary["total_partidas"] = built.get("partidas_na_silver")
        summary["partidas_novas"] = new_matches(downloaded)
    except Exception as exc:
        summary["status"] = "erro"
        summary["mensagem"] = f"Construção do banco interrompida: {exc}"
        logger.critical(summary["mensagem"])
        logger.error(traceback.format_exc())
    summary["duracao_s"] = round(time.time() - start, 1)
    if summary["status"] == "ok":
        logger.info(f"=== Concluído em {summary['duracao_s']}s ===")
    else:
        logger.warning("Execução incompleta; rode de novo para baixar o restante.")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Esteira medalhão FURIA x HLTV")
    parser.add_argument("modo", nargs="?", default="diario", choices=["diario", "historico", "reconstruir"])
    parser.add_argument("--limite", type=int, default=None, help="máximo de partidas a baixar nesta execução")
    parser.add_argument("--espera-desafio", type=int, default=None, metavar="SEGUNDOS",
                        help="espera máxima pela verificação do Cloudflare (execução automática)")
    parser.add_argument("--json", action="store_true", help="imprime o resumo da execução em JSON na saída padrão")
    args = parser.parse_args()
    if args.espera_desafio is not None:
        settings.CHALLENGE_TIMEOUT = args.espera_desafio
        settings.EVENTS_CHALLENGE_TIMEOUT = min(settings.EVENTS_CHALLENGE_TIMEOUT, args.espera_desafio)
    result = run(args.modo, args.limite)
    if args.json:
        # Só ASCII: a saída é lida por outros programas (PowerShell, n8n) sem depender de codificação.
        print(json.dumps(result, ensure_ascii=True))
    sys.exit(0 if result["status"] == "ok" else 1)
