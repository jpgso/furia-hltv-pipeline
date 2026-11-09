import os
import polars as pl
from config import DATA_DIR, get_logger

logger = get_logger(__name__)

def upsert_entity_to_master(df_new: pl.DataFrame, entity_name: str, primary_keys: list) -> None:
    """Implementa a lógica de Camada Bronze: Merge e Drop Duplicates em Data Lakehouse Local."""
    if df_new is None or df_new.is_empty():
        logger.warning(f"DataFrame novo da entidade '{entity_name}' vazio. Abortando I/O.")
        return

    master_file_name = f"furia_{entity_name}_master.parquet"
    master_file_path = os.path.join(DATA_DIR, master_file_name)

    logger.info(f"Iniciando rotina de Upsert para '{entity_name}' na Camada Bronze...")

    try:
        if os.path.exists(master_file_path):
            logger.info("Tabela Mestra localizada. Processando delta histórico...")
            df_master = pl.read_parquet(master_file_path)
            df_combined = pl.concat([df_master, df_new], how="diagonal")
        else:
            logger.info("Tabela Mestra ausente (Day 1). Consolidando nova fundação de dados Bronze...")
            df_combined = df_new

        # Governança de Duplicidade
        df_final = df_combined.unique(subset=primary_keys, keep="last")
        
        # Dump em disco otimizado via Arrow engine
        df_final.write_parquet(master_file_path)
        
        linhas_novas = df_final.height - (df_master.height if 'df_master' in locals() else 0)
        logger.info(f"[LOAD-SUCCESS] '{master_file_name}' | Consolidado: {df_final.height} lins | Delta real: +{linhas_novas} records")

    except Exception as e:
        logger.error(f"Falha de I/O crítica no Upsert de '{entity_name}': {e}")
        raise Exception(f"Erro no módulo de Storage: {e}")