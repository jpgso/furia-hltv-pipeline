-- Camada SILVER: dimensões do modelo estrela.
-- Horário: a HLTV informa o instante em UTC; aqui vira horário de Brasília,
-- respeitando o horário de verão que existiu até 2019.

CREATE OR REPLACE MACRO data_hora_brt(ms) AS timezone('America/Sao_Paulo', to_timestamp(ms / 1000.0));
CREATE OR REPLACE MACRO data_brt(ms) AS CAST(data_hora_brt(ms) AS DATE);

-- Colocação em faixa, como '5-8th': a primeira e a última posição da faixa.
CREATE OR REPLACE MACRO posicao_inicial(colocacao) AS TRY_CAST(regexp_extract(colocacao, '^(\d+)', 1) AS INTEGER);
CREATE OR REPLACE MACRO posicao_final(colocacao) AS TRY_CAST(regexp_extract(colocacao, '(\d+)\D*$', 1) AS INTEGER);

-- Percentual de vitórias de um grupo de partidas ou de mapas.
CREATE OR REPLACE MACRO pct_vitorias(r) AS round(100.0 * count(*) FILTER (WHERE r = 'V') / count(*), 1);

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
-- Uma colocação por evento: quando a página de eventos não traz o id, casa pelo nome.
colocacoes AS (
    SELECT coalesce(c.event_id, e.evento_id) AS evento_id, min(c.colocacao) AS colocacao
    FROM staging.event_placements c
    LEFT JOIN eventos e ON c.event_id IS NULL AND lower(trim(c.evento_nome)) = lower(trim(e.nome))
    GROUP BY ALL
)
SELECT
    e.evento_id,
    e.nome,
    e.data_inicio,
    e.data_fim,
    year(e.data_inicio)                                              AS ano,
    c.colocacao,
    posicao_inicial(c.colocacao)                                       AS melhor_posicao,
    posicao_final(c.colocacao)                                         AS pior_posicao
FROM eventos e
LEFT JOIN colocacoes c USING (evento_id);

