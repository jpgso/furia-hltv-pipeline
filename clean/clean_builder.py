import os
import sys
from pathlib import Path

# Governança de Rotas: Força o Python a enxergar a raiz do projeto
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

import json
import re
import polars as pl
from config import get_logger

logger = get_logger(__name__)

BRONZE_DIR = BASE_DIR / "data"
SILVER_DIR = BRONZE_DIR / "silver"

def process_silver_layer():
    os.makedirs(SILVER_DIR, exist_ok=True)
    
    logger.info("==================================================")
    logger.info("   [ETL] INICIANDO REFINAMENTO - CAMADA SILVER    ")
    logger.info("==================================================")
    
    bronze_details_file = BRONZE_DIR / "furia_match_details_master.parquet"
    
    if bronze_details_file.exists():
        logger.info("Processando 'match_details' (Data Flattening, Schema Drift e Vetos)...")
        df_bronze = pl.read_parquet(bronze_details_file)
        raw_data = df_bronze.to_dicts()
        
        silver_details_data = []
        
        for row in raw_data:
            url = row.get("match_url", "N/A")
            campeonato = row.get("campeonato", "N/A")
            time_a = row.get("time_a", "N/A")
            time_b = row.get("time_b", "N/A")
            
            # ---------------------------------------------------------
            # FILTRO DE PICKS & BANS (Isolando a numeração)
            # ---------------------------------------------------------
            raw_picks = row.get("picks_bans", "N/A")
            picks_bans_final = "Veto não disponível"
            
            if raw_picks != "N/A" and raw_picks != "Veto não disponível":
                clean_picks = []
                for linha in raw_picks.split(" | "):
                    linha = linha.strip()
                    # Captura estritamente as linhas que começam com 1., 2., etc.
                    if re.match(r'^\d+\.', linha):
                        clean_picks.append(linha)
                
                if clean_picks:
                    picks_bans_final = " | ".join(clean_picks)
            # ---------------------------------------------------------

            try:
                mapas = json.loads(row.get("mapas_jogados", "[]")) if isinstance(row.get("mapas_jogados"), str) else row.get("mapas_jogados", [])
            except:
                mapas = []
                
            try:
                jogadores = json.loads(row.get("estatisticas_jogadores", "[]")) if isinstance(row.get("estatisticas_jogadores"), str) else row.get("estatisticas_jogadores", [])
            except:
                jogadores = []

            if not mapas: mapas = [{"mapa": "N/A", "placar_detalhado": "N/A"}]
            if not jogadores: jogadores = [{"jogador": "N/A", "k_d": "N/A", "swing": "N/A", "adr": "N/A", "kast": "N/A", "rating": "N/A"}]

            for m in mapas:
                nome_mapa = m.get("mapa", "N/A")
                placar_raw = m.get("placar_detalhado", "N/A")
                
                placar_final = "N/A"
                placar_lados = "N/A"
                
                if placar_raw != "N/A" and "STATS" in placar_raw:
                    lados_match = re.search(r'(\(.*?\))', placar_raw)
                    if lados_match:
                        placar_lados = lados_match.group(1)
                    
                    placar_clean = placar_raw.replace('STATS', '')
                    placar_clean = re.sub(r'\(.*?\)', '', placar_clean).strip()
                    placar_clean = re.sub(r'\s{2,}', ' - ', placar_clean)
                    placar_final = placar_clean
                    
                for j in jogadores:
                    jogador_nome = j.get("jogador", "N/A")
                    
                    if j.get("k_d", "").upper() == "K-D" or jogador_nome.upper() in ["FURIA", time_a.upper(), time_b.upper()]:
                        continue
                        
                    silver_details_data.append({
                        "campeonato": campeonato,
                        "time_a": time_a,
                        "time_b": time_b,
                        "mapa": nome_mapa,
                        "placar": placar_final,
                        "placar_lados": placar_lados,
                        "jogador": jogador_nome,
                        "k_d": j.get("k_d", "N/A"),
                        "kd_diff": j.get("swing", "N/A"),  
                        "swing": j.get("adr", "N/A"),      
                        "adr": j.get("kast", "N/A"),       
                        "kast": j.get("rating", "N/A"),    
                        "picks_bans": picks_bans_final,
                        "match_url": url
                    })
        
        if silver_details_data:
            df_silver_details = pl.DataFrame(silver_details_data)
            out_file = SILVER_DIR / "furia_match_details_silver.parquet"
            df_silver_details.write_parquet(out_file)
            logger.info(f"-> [SILVER-SUCCESS] 'match_details' estruturada. Linhas: {df_silver_details.height}")

    # Processamento sem Lineups
    outras_tabelas = ["roster", "team_maps", "history", "events"]
    
    for tabela in outras_tabelas:
        file_path = BRONZE_DIR / f"furia_{tabela}_master.parquet"
        if file_path.exists():
            logger.info(f"Promovendo '{tabela}' para a Camada Silver...")
            df = pl.read_parquet(file_path)
            
            out_file = SILVER_DIR / f"furia_{tabela}_silver.parquet"
            df.write_parquet(out_file)
            logger.info(f"-> [SILVER-SUCCESS] '{tabela}' promovida. Linhas: {df.height}")
            
    logger.info("==================================================")
    logger.info("   [ETL] CAMADA SILVER CONSOLIDADA COM SUCESSO    ")
    logger.info("==================================================")

if __name__ == "__main__":
    process_silver_layer()

