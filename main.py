import asyncio
import time
import traceback
import polars as pl

from config import get_logger
from extract import run_full_extraction_pipeline
from transform import clean_and_type_data
from load import upsert_entity_to_master
from clean import process_silver_layer

# Inicialização global do monitoramento
logger = get_logger(__name__)

def run_pipeline():
    """Orquestrador Central (Entrypoint) da Arquitetura ETL Multicamadas."""
    logger.info("==================================================")
    logger.info("    [HLTV DATA PIPELINE - FURIA ECOSYSTEM]        ")
    logger.info("==================================================")
    
    start_time = time.time()
    
    try:
        # [STEP 1] - EXTRACT (Web Crawler)
        raw_payload = asyncio.run(run_full_extraction_pipeline())
        
        # Mapeamento relacional de Chaves Primárias para garantir a integridade do Delta (Upsert)
        entity_primary_keys = {
            "history": ["match_url"],
            "match_details": ["match_url"],
            "team_maps": ["mapa"],
            "roster": ["jogador"],
            "events": ["campeonato", "colocacao"]          
        }

        # Iterador de Domínios
        for entity_name, raw_data in raw_payload.items():
            logger.info(f"--- Roteando fluxos analíticos para a entidade: {entity_name.upper()} ---")
            
            if not raw_data:
                logger.warning(f"Vácuo de dados detectado para '{entity_name}'. Bypass acionado.")
                continue
                
            # [STEP 2] - TRANSFORM (Data Cleansing Inicial)
            df_entity = clean_and_type_data(raw_data, entity_name)
            
            # [STEP 3] - LOAD (Tabela Mestra / Bronze Layer)
            pk = entity_primary_keys.get(entity_name, df_entity.columns)
            upsert_entity_to_master(df_entity, entity_name, pk)
            
        # [STEP 4] - SILVER LAYER (Data Flattening & Refinamento Estrutural)
        process_silver_layer()
            
        # Encerramento Analítico
        execution_time = time.time() - start_time
        logger.info(f"--- ESTEIRA COMPLETA CONCLUÍDA (Performance de Execução: {execution_time:.2f}s) ---")

    except Exception:
        # Captura agressiva de stack trace para auditoria
        detalhe = traceback.format_exc()
        logger.critical("FALHA DE INTEGRIDADE NA EXECUÇÃO DA ESTEIRA!")
        logger.error(f"Root Cause Analysis (Detalhes do traceback):\n{detalhe}")

if __name__ == "__main__":
    run_pipeline()