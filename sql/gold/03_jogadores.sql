-- Camada GOLD: desempenho individual dos jogadores da FURIA.
-- ADR, KAST e rating são médias ponderadas pelos rounds de cada mapa.
-- Atenção: o rating mistura versões da HLTV (2.0 nas partidas antigas, 3.0 nas novas).

CREATE OR REPLACE VIEW gold.base_jogador_mapa AS
SELECT
    fj.partida_id, fj.mapstats_id, fj.mapa_id, fj.jogador_id, fj.lado,
    fp.data, fp.data_hora,
    fm.resultado,
    CASE fj.lado
        WHEN 'CT' THEN fm.rounds_ct_furia + fm.rounds_tr_adversario
        WHEN 'TR' THEN fm.rounds_tr_furia + fm.rounds_ct_adversario
        ELSE fm.rounds_furia + fm.rounds_adversario
    END                                                   AS rounds,
    fj.kills, fj.deaths, fj.adr, fj.kast_pct, fj.rating
FROM silver.fato_jogador_mapa fj
JOIN silver.fato_mapa fm USING (partida_id, mapstats_id)
JOIN silver.fato_partida fp USING (partida_id)
WHERE fj.eh_furia AND NOT fm.sem_disputa;

CREATE OR REPLACE MACRO media_ponderada(valor, peso) AS
    round(sum(valor * peso) FILTER (WHERE valor IS NOT NULL AND peso > 0)
          / nullif(sum(peso) FILTER (WHERE valor IS NOT NULL AND peso > 0), 0), 2);

-- Carreira de cada jogador pela FURIA.
CREATE OR REPLACE TABLE gold.jogadores AS
SELECT
    j.nick                                                AS jogador,
    j.nome_completo,
    count(DISTINCT b.partida_id)                          AS partidas,
    count(*)                                              AS mapas,
    pct_vitorias(b.resultado) AS aproveitamento_mapas,
    sum(b.kills)                                          AS kills,
    sum(b.deaths)                                         AS deaths,
    sum(b.kills) - sum(b.deaths)                          AS saldo,
    round(sum(b.kills) / nullif(sum(b.deaths), 0), 2)     AS kd,
    media_ponderada(b.adr, b.rounds)                      AS adr,
    media_ponderada(b.kast_pct, b.rounds)                 AS kast_pct,
    media_ponderada(b.rating, b.rounds)                   AS rating,
    max(b.rating)                                         AS melhor_rating_em_mapa,
    min(b.data)                                           AS primeira_partida,
    max(b.data)                                           AS ultima_partida
FROM gold.base_jogador_mapa b
JOIN silver.dim_jogador j USING (jogador_id)
WHERE b.lado = 'TOTAL'
GROUP BY j.jogador_id, j.nick, j.nome_completo
ORDER BY mapas DESC;

-- Jogador x mapa.
CREATE OR REPLACE TABLE gold.jogador_por_mapa AS
SELECT
    j.nick                                                AS jogador,
    d.nome                                                AS mapa,
    count(*)                                              AS mapas,
    pct_vitorias(b.resultado) AS aproveitamento_mapas,
    round(sum(b.kills) / nullif(sum(b.deaths), 0), 2)     AS kd,
    media_ponderada(b.adr, b.rounds)                      AS adr,
    media_ponderada(b.kast_pct, b.rounds)                 AS kast_pct,
    media_ponderada(b.rating, b.rounds)                   AS rating
FROM gold.base_jogador_mapa b
JOIN silver.dim_jogador j USING (jogador_id)
JOIN silver.dim_mapa d USING (mapa_id)
WHERE b.lado = 'TOTAL'
GROUP BY ALL
ORDER BY jogador, mapas DESC;

-- Jogador x lado (CT e TR).
CREATE OR REPLACE TABLE gold.jogador_por_lado AS
SELECT
    j.nick                                                AS jogador,
    b.lado,
    count(*)                                              AS mapas,
    round(sum(b.kills) / nullif(sum(b.deaths), 0), 2)     AS kd,
    media_ponderada(b.adr, b.rounds)                      AS adr,
    media_ponderada(b.kast_pct, b.rounds)                 AS kast_pct,
    media_ponderada(b.rating, b.rounds)                   AS rating
FROM gold.base_jogador_mapa b
JOIN silver.dim_jogador j USING (jogador_id)
WHERE b.lado IN ('CT', 'TR')
GROUP BY ALL
ORDER BY jogador, lado;

-- Evolução mensal de cada jogador.
CREATE OR REPLACE TABLE gold.jogador_mensal AS
SELECT
    j.nick                                                AS jogador,
    strftime(b.data, '%Y-%m')                             AS ano_mes,
    count(*)                                              AS mapas,
    round(sum(b.kills) / nullif(sum(b.deaths), 0), 2)     AS kd,
    media_ponderada(b.adr, b.rounds)                      AS adr,
    media_ponderada(b.kast_pct, b.rounds)                 AS kast_pct,
    media_ponderada(b.rating, b.rounds)                   AS rating
FROM gold.base_jogador_mapa b
JOIN silver.dim_jogador j USING (jogador_id)
WHERE b.lado = 'TOTAL'
GROUP BY ALL
ORDER BY jogador, ano_mes;
