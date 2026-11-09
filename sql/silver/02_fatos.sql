-- Camada SILVER: fatos, sempre na ótica da FURIA.

-- Uma linha por partida (série) encerrada.
CREATE OR REPLACE TABLE silver.fato_partida AS
WITH base AS (
    SELECT m.*, m.team1_id = p.time_id AS furia_eh_time1
    FROM staging.matches m
    CROSS JOIN staging.parametros p
    WHERE m.encerrada AND p.time_id IN (m.team1_id, m.team2_id)
)
SELECT
    b.match_id                                                           AS partida_id,
    data_brt(b.unix_ms)                                                  AS data,
    data_hora_brt(b.unix_ms)                                             AS data_hora,
    b.event_id                                                           AS evento_id,
    CASE WHEN b.furia_eh_time1 THEN b.team2_id ELSE b.team1_id END       AS adversario_id,
    CASE WHEN b.furia_eh_time1 THEN b.team1_score ELSE b.team2_score END AS placar_furia,
    CASE WHEN b.furia_eh_time1 THEN b.team2_score ELSE b.team1_score END AS placar_adversario,
    CASE CASE WHEN b.furia_eh_time1 THEN b.team1_resultado ELSE b.team2_resultado END
        WHEN 'won' THEN 'V' WHEN 'lost' THEN 'D' ELSE 'E'
    END                                                                  AS resultado,
    coalesce(b.melhor_de, TRY_CAST(regexp_extract(l.formato, '^bo(\d)$', 1) AS INTEGER), 1) AS melhor_de,
    b.online,
    b.fase,
    l.estrelas,
    'https://www.hltv.org' || b.match_url                                AS url
FROM base b
LEFT JOIN staging.results_listing l USING (match_id);

-- Uma linha por mapa efetivamente jogado.
CREATE OR REPLACE TABLE silver.fato_mapa AS
WITH base AS (
    SELECT mm.*, m.team1_id = p.time_id AS furia_eh_time1, p.time_id AS furia_id
    FROM staging.match_maps mm
    JOIN staging.matches m USING (match_id)
    CROSS JOIN staging.parametros p
    WHERE mm.jogado AND m.match_id IN (SELECT partida_id FROM silver.fato_partida)
),
lados AS (
    SELECT
        match_id, ordem, mapstats_id, mapa, furia_id, escolhido_por_team_id,
        CASE WHEN furia_eh_time1 THEN team1_score ELSE team2_score END AS rounds_furia,
        CASE WHEN furia_eh_time1 THEN team2_score ELSE team1_score END AS rounds_adversario,
        CASE WHEN furia_eh_time1 THEN team1_ct ELSE team2_ct END       AS rounds_ct_furia,
        CASE WHEN furia_eh_time1 THEN team1_tr ELSE team2_tr END       AS rounds_tr_furia,
        CASE WHEN furia_eh_time1 THEN team2_ct ELSE team1_ct END       AS rounds_ct_adversario,
        CASE WHEN furia_eh_time1 THEN team2_tr ELSE team1_tr END       AS rounds_tr_adversario,
        CASE WHEN furia_eh_time1 THEN team1_ot ELSE team2_ot END       AS rounds_prorrogacao_furia,
        CASE WHEN furia_eh_time1 THEN team2_ot ELSE team1_ot END       AS rounds_prorrogacao_adversario,
        CASE WHEN furia_eh_time1 THEN team1_lado_inicial
             WHEN team1_lado_inicial = 'CT' THEN 'TR'
             WHEN team1_lado_inicial = 'TR' THEN 'CT' END              AS lado_inicial_furia
    FROM base
)
SELECT
    l.match_id                                   AS partida_id,
    l.ordem,
    l.mapstats_id,
    d.mapa_id,
    l.rounds_furia,
    l.rounds_adversario,
    CASE WHEN l.rounds_furia > l.rounds_adversario THEN 'V'
         WHEN l.rounds_furia < l.rounds_adversario THEN 'D' ELSE 'E' END AS resultado,
    l.rounds_ct_furia,
    l.rounds_tr_furia,
    l.rounds_ct_adversario,
    l.rounds_tr_adversario,
    l.rounds_prorrogacao_furia,
    l.rounds_prorrogacao_adversario,
    l.rounds_prorrogacao_furia IS NOT NULL       AS teve_prorrogacao,
    l.lado_inicial_furia,
    CASE WHEN l.escolhido_por_team_id = l.furia_id THEN 'FURIA'
         WHEN l.escolhido_por_team_id IS NOT NULL THEN 'ADVERSARIO'
         WHEN EXISTS (SELECT 1 FROM staging.match_vetos v
                      WHERE v.match_id = l.match_id AND v.acao = 'left over' AND v.mapa = l.mapa) THEN 'DECISIVO'
         ELSE 'INDEFINIDO' END                   AS escolha
FROM lados l
JOIN silver.dim_mapa d ON d.nome = l.mapa;

-- Uma linha por ação de veto (ban, pick ou mapa que sobrou).
CREATE OR REPLACE TABLE silver.fato_veto AS
SELECT
    v.match_id                                   AS partida_id,
    v.ordem,
    d.mapa_id,
    CASE v.acao WHEN 'removed' THEN 'BAN' WHEN 'picked' THEN 'PICK' ELSE 'SOBRA' END AS acao,
    v.team_id                                    AS time_id,
    CASE WHEN v.team_id = p.time_id THEN 'FURIA'
         WHEN v.team_id IS NOT NULL THEN 'ADVERSARIO' END AS autor
FROM staging.match_vetos v
JOIN silver.dim_mapa d ON d.nome = v.mapa
CROSS JOIN staging.parametros p
WHERE v.match_id IN (SELECT partida_id FROM silver.fato_partida);

-- Uma linha por jogador x mapa x lado (TOTAL, CT, TR), dos dois times.
CREATE OR REPLACE TABLE silver.fato_jogador_mapa AS
SELECT
    fm.partida_id,
    fm.mapstats_id,
    fm.mapa_id,
    s.player_id                                  AS jogador_id,
    s.team_id                                    AS time_id,
    coalesce(s.team_id = p.time_id, FALSE)       AS eh_furia,
    s.lado,
    s.kills,
    s.deaths,
    s.kills - s.deaths                           AS saldo,
    s.adr,
    s.kast_pct,
    s.rating,
    s.rating_versao,
    s.swing_pct,
    s.ekills,
    s.edeaths,
    s.eadr,
    s.ekast_pct
FROM staging.player_stats s
JOIN silver.fato_mapa fm ON fm.partida_id = s.match_id AND fm.mapstats_id = s.mapstats_id
CROSS JOIN staging.parametros p;

-- Colocação final em cada campeonato listado na página de eventos do time.
CREATE OR REPLACE TABLE silver.fato_colocacao_evento AS
SELECT
    coalesce(c.event_id, e.evento_id)                                AS evento_id,
    c.evento_nome,
    c.colocacao,
    TRY_CAST(regexp_extract(c.colocacao, '^(\d+)', 1) AS INTEGER)    AS melhor_posicao
FROM staging.event_placements c
LEFT JOIN silver.dim_evento e
       ON c.event_id IS NULL AND lower(trim(c.evento_nome)) = lower(trim(e.nome));
