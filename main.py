"""Orquestrador da esteira medalhão: da bronze guardada no disco até o site.

    python main.py               lê o que há de novo na bronze e atualiza silver, gold e docs/data
    python main.py reconstruir   reinterpreta toda a bronze do zero

A coleta das páginas não faz parte deste repositório: a esteira começa no HTML já
guardado em data/bronze.

Para execução automática (n8n, agendador): --json imprime um resumo na saída padrão e
--publicar envia os dados do dashboard ao GitHub (o GitHub Pages serve a pasta docs/).
"""
import argparse
import json
import sys
import time
import traceback

from config import get_logger, settings

logger = get_logger("pipeline")

MAX_PARTIDAS_NO_RESUMO = 20


def new_matches(match_ids, db_path=None) -> list[dict]:
    """Partidas recém-chegadas como aparecem na gold, da mais recente para a mais antiga."""
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


def run(mode: str = "atualizar", publish: bool = False, new_ids=(), summary: dict | None = None) -> dict:
    """Refaz as camadas e sincroniza docs/data.

    `new_ids` são as partidas que acabaram de entrar na bronze, para o resumo; `summary`
    permite que a etapa anterior (quem abasteceu a bronze) entregue o que já apurou.
    """
    from load import publish as publisher, warehouse

    start = time.time()
    logger.info(f"=== Esteira FURIA | modo: {mode} ===")
    summary = {"modo": mode, "status": "ok", "mensagem": "", **(summary or {}),
               "total_partidas": None, "partidas_novas": [], "publicacao": None}
    try:
        built = warehouse.build(reparse_all=(mode == "reconstruir"))
        summary["total_partidas"] = built.get("partidas_na_silver")
        summary["partidas_novas"] = new_matches(new_ids)
        publisher.sync_dashboard_data()          # docs/data sempre acompanha a gold
        if publish:
            summary["publicacao"] = publisher.push_dashboard()
            if summary["publicacao"]["status"] == "erro":
                logger.error(f"Publicação do dashboard falhou: {summary['publicacao']['mensagem']}")
    except Exception as exc:
        summary["status"] = "erro"
        summary["mensagem"] = f"Construção do banco interrompida: {exc}"
        logger.critical(summary["mensagem"])
        logger.error(traceback.format_exc())
    summary["duracao_s"] = round(time.time() - start, 1)
    if summary["status"] == "ok":
        logger.info(f"=== Concluído em {summary['duracao_s']}s ===")
    else:
        logger.warning("Execução incompleta.")
    return summary


def non_negative(text: str) -> int:
    value = int(text)
    if value < 0:
        raise argparse.ArgumentTypeError("use um número inteiro maior ou igual a zero")
    return value


def add_output_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--publicar", action="store_true", help="envia os dados do dashboard (docs/data) ao GitHub")
    parser.add_argument("--json", action="store_true", help="imprime o resumo da execução em JSON na saída padrão")
    parser.add_argument("--json-arquivo", default=None, metavar="CAMINHO",
                        help="grava o mesmo resumo em um arquivo (para quem não consegue ler a saída padrão)")


def write_summary(result: dict, json_file: str | None, to_stdout: bool) -> None:
    # Só ASCII: o resumo é lido por outros programas (PowerShell, n8n) sem depender de codificação.
    text = json.dumps(result, ensure_ascii=True)
    if json_file:
        with open(json_file, "w", encoding="ascii") as fh:
            fh.write(text)
    if to_stdout:
        print(text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Esteira medalhão da FURIA: bronze, silver, gold e site")
    parser.add_argument("modo", nargs="?", default="atualizar", choices=["atualizar", "reconstruir"])
    add_output_arguments(parser)
    args = parser.parse_args()
    result = run(args.modo, args.publicar)
    write_summary(result, args.json_arquivo, args.json)
    sys.exit(0 if result["status"] == "ok" else 1)
