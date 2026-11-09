import polars as pl
from config import get_logger

logger = get_logger(__name__)

def clean_and_type_data(raw_data: list, entity_name: str) -> pl.DataFrame:
    """Aplica higienização básica otimizada para o schema de cada entidade."""
    logger.info(f"Iniciando transformação de {len(raw_data)} registros da entidade '{entity_name}'...")
    df = pl.DataFrame(raw_data)
    
    if df.is_empty():
        logger.warning(f"DataFrame vazio para '{entity_name}'. Bypass acionado.")
        return df

    if entity_name == "history":
        df = df.with_columns([
            pl.col("data").str.strip_chars(),
            pl.col("campeonato").str.strip_chars(),
            pl.col("oponente").str.strip_chars(),
            pl.col("mapa").str.strip_chars(),
            pl.col("resultado").str.strip_chars(),
        ])

        df = df.with_columns(
            pl.col("resultado").alias("resultado_furia")
        )

    logger.info(f"Camada Bronze gerada com sucesso para '{entity_name}'.")
    return df