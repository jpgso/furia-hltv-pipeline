-- Camada GOLD: adversários mapa a mapa e placares dos mapas.
-- Mapas sem disputa (W.O.) ficam fora das duas tabelas.

-- Histórico contra cada adversário em cada mapa. Complementa gold.confronto_direto,
-- que conta séries: aqui o grão é adversário x mapa.
CREATE OR REPLACE TABLE gold.confronto_por_mapa AS
SELECT
    t.nome                                                         AS adversario,
    d.nome                                                         AS mapa,
    count(*)                                                       AS jogados,
    count(*) FILTER (WHERE fm.resultado = 'V')                     AS vitorias,
    count(*) FILTER (WHERE fm.resultado = 'D')                     AS derrotas,
    pct_vitorias(fm.resultado)                                     AS aproveitamento,
    sum(fm.rounds_furia)                                           AS rounds_vencidos,
    sum(fm.rounds_adversario)                                      AS rounds_perdidos,
    sum(fm.rounds_furia) - sum(fm.rounds_adversario)               AS saldo_rounds,
    count(*) FILTER (WHERE fm.teve_prorrogacao)                    AS prorrogacoes,
    max(fp.data)                                                   AS ultima_vez,
    arg_max(fm.resultado, fp.data_hora)                            AS ultimo_resultado
FROM silver.fato_mapa fm
JOIN silver.fato_partida fp USING (partida_id)
JOIN silver.dim_time t ON t.time_id = fp.adversario_id
JOIN silver.dim_mapa d USING (mapa_id)
WHERE NOT fm.sem_disputa
GROUP BY t.nome, d.nome
ORDER BY jogados DESC, adversario, mapa;

-- Quantas vezes cada placar de mapa aconteceu, FURIA primeiro.
-- `apertado` marca os mapas decididos por até três rounds.
-- Até 2023 o mapa ia a 16 rounds (CS:GO); desde então vai a 13 (CS2).
CREATE OR REPLACE TABLE gold.placares AS
SELECT
    fm.rounds_furia,
    fm.rounds_adversario,
    fm.resultado,
    fm.teve_prorrogacao,
    abs(fm.rounds_furia - fm.rounds_adversario) <= 3               AS apertado,
    count(*)                                                       AS vezes,
    round(100.0 * count(*) / sum(count(*)) OVER (), 1)             AS pct_dos_mapas,
    min(fp.data)                                                   AS primeira_vez,
    max(fp.data)                                                   AS ultima_vez
FROM silver.fato_mapa fm
JOIN silver.fato_partida fp USING (partida_id)
WHERE NOT fm.sem_disputa
GROUP BY fm.rounds_furia, fm.rounds_adversario, fm.resultado, fm.teve_prorrogacao
ORDER BY vezes DESC, fm.rounds_furia DESC, fm.rounds_adversario;
