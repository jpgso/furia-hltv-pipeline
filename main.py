"""Orquestrador da esteira medalhão FURIA x HLTV.

    python main.py diario        baixa só partidas novas e atualiza o banco (padrão)
    python main.py historico     percorre todo o histórico e baixa o que faltar
    python main.py reconstruir   refaz silver e gold a partir da bronze, sem rede
"""
import argparse
import sys
import time
import traceback

from config import get_logger

logger = get_logger("pipeline")


def run(mode: str, limit: int | None = None) -> int:
    from load import warehouse

    start = time.time()
    logger.info(f"=== Esteira FURIA/HLTV | modo: {mode} ===")
    failed = False
    if mode != "reconstruir":
        try:
            from extract.crawler import run_extraction

            run_extraction(full=(mode == "historico"), limit=limit)
        except Exception as exc:
            # O que já foi baixado está salvo na bronze: o banco é atualizado mesmo assim.
            failed = True
            logger.critical(f"Extração interrompida: {exc}")
            logger.error(traceback.format_exc())
    try:
        warehouse.build(reparse_all=(mode == "reconstruir"))
    except Exception as exc:
        logger.critical(f"Construção do banco interrompida: {exc}")
        logger.error(traceback.format_exc())
        return 1
    if failed:
        logger.warning("Banco atualizado com o que havia na bronze; rode de novo para baixar o restante.")
        return 1
    logger.info(f"=== Concluído em {time.time() - start:.1f}s ===")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Esteira medalhão FURIA x HLTV")
    parser.add_argument("modo", nargs="?", default="diario", choices=["diario", "historico", "reconstruir"])
    parser.add_argument("--limite", type=int, default=None, help="máximo de partidas a baixar nesta execução")
    args = parser.parse_args()
    sys.exit(run(args.modo, args.limite))
