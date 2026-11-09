-- Camada SILVER: dimensões do modelo estrela.
-- Horário: a HLTV informa o instante em UTC; aqui vira horário de Brasília (UTC-3).

CREATE OR REPLACE MACRO data_hora_brt(ms) AS epoch_ms(ms) - INTERVAL 3 HOUR;
CREATE OR REPLACE MACRO data_brt(ms) AS CAST(epoch_ms(ms) - INTERVAL 3 HOUR AS DATE);

-- Times: o nome mais recente prevalece (times mudam de nome).
CREATE OR REPLACE TABLE silver.dim_time AS
WITH aparicoes AS (
    SELECT team1_id AS time_id, team1_nome AS nome, unix_ms FROM staging.matches
    UNION ALL
    SELECT team2_id, team2_nome, unix_ms FROM staging.matches
)
SELECT
    time_id,
    arg_max(nome, unix_ms)                                   AS nome,
    time_id = (SELECT time_id FROM staging.parametros)       AS eh_furia
FROM aparicoes
WHERE time_id IS NOT NULL
GROUP BY time_id;

-- Jogadores: todos os que aparecem em alguma partida (FURIA e adversários).
CREATE OR REPLACE TABLE silver.dim_jogador AS
SELECT
    s.player_id                          AS jogador_id,
    arg_max(s.nick, m.unix_ms)           AS nick,
    arg_max(s.nome_completo, m.unix_ms)  AS nome_completo
FROM staging.player_stats s
JOIN staging.matches m USING (match_id)
GROUP BY s.player_id;

-- Mapas: os jogados e os citados nos vetos.
CREATE OR REPLACE TABLE silver.dim_mapa AS
WITH nomes AS (
    SELECT mapa FROM staging.match_maps WHERE jogado
    UNION
    SELECT mapa FROM staging.match_vetos
)
SELECT row_number() OVER (ORDER BY mapa) AS mapa_id, mapa AS nome
FROM nomes
WHERE mapa IS NOT NULL;

-- Eventos: período calculado pelas partidas da FURIA; colocação vem da página de eventos.
CREATE OR REPLACE TABLE silver.dim_evento AS
WITH eventos AS (
    SELECT
        event_id                          AS evento_id,
        arg_max(event_nome, unix_ms)      AS nome,
        min(data_brt(unix_ms))            AS data_inicio,
        max(data_brt(unix_ms))            AS data_fim
    FROM staging.matches
    WHERE event_id IS NOT NULL
    GROUP BY event_id
),
colocacoes AS (
    SELECT event_id, lower(trim(evento_nome)) AS chave, min(colocacao) AS colocacao
    FROM staging.event_placements
    GROUP BY ALL
)
SELECT
    e.evento_id,
    e.nome,
    e.data_inicio,
    e.data_fim,
    year(e.data_inicio)                                              AS ano,
    c.colocacao,
    TRY_CAST(regexp_extract(c.colocacao, '^(\d+)', 1) AS INTEGER)    AS melhor_posicao
FROM eventos e
LEFT JOIN colocacoes c
       ON c.event_id = e.evento_id
       OR (c.event_id IS NULL AND c.chave = lower(trim(e.nome)));

-- Calendário contínuo entre a primeira e a última partida.
CREATE OR REPLACE TABLE silver.dim_data AS
WITH limites AS (
    SELECT min(data_brt(unix_ms)) AS ini, max(data_brt(unix_ms)) AS fim
    FROM staging.matches
    WHERE unix_ms IS NOT NULL
),
dias AS (
    SELECT CAST(unnest(generate_series(CAST(ini AS TIMESTAMP), CAST(fim AS TIMESTAMP), INTERVAL 1 DAY)) AS DATE) AS data
    FROM limites
    WHERE ini IS NOT NULL
)
SELECT
    data,
    year(data)                              AS ano,
    quarter(data)                           AS trimestre,
    month(data)                             AS mes,
    ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][month(data)] AS mes_nome,
    strftime(data, '%Y-%m')                 AS ano_mes,
    ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dayofweek(data) + 1]                       AS dia_semana
FROM dias;
