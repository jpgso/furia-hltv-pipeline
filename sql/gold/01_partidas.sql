-- Camada GOLD: partidas e visão geral do time.

-- Tabela larga de partidas, pronta para listagens, com sequência e forma recente.
CREATE OR REPLACE TABLE gold.partidas AS
WITH mapas AS (
    SELECT
        fm.partida_id,
        count(*) FILTER (WHERE fm.resultado = 'V')     AS mapas_vencidos,
        count(*) FILTER (WHERE fm.resultado = 'D')     AS mapas_perdidos,
        sum(fm.rounds_furia)                           AS rounds_vencidos,
        sum(fm.rounds_adversario)                      AS rounds_perdidos,
        string_agg(dm.nome || ' ' || fm.rounds_furia || '-' || fm.rounds_adversario, ', ' ORDER BY fm.ordem) AS mapas
    FROM silver.fato_mapa fm
    JOIN silver.dim_mapa dm USING (mapa_id)
    GROUP BY fm.partida_id
),
base AS (
    SELECT
        fp.partida_id, fp.data, fp.data_hora, fp.resultado,
        t.nome                                         AS adversario,
        e.nome                                         AS evento,
        'bo' || fp.melhor_de                           AS formato,
        fp.online, fp.fase, fp.estrelas,
        fp.placar_furia, fp.placar_adversario,
        m.mapas_vencidos, m.mapas_perdidos, m.rounds_vencidos, m.rounds_perdidos, m.mapas,
        fp.url,
        lag(fp.resultado) OVER ordem                   AS resultado_anterior
    FROM silver.fato_partida fp
    LEFT JOIN silver.dim_time t   ON t.time_id = fp.adversario_id
    LEFT JOIN silver.dim_evento e ON e.evento_id = fp.evento_id
    LEFT JOIN mapas m USING (partida_id)
    WINDOW ordem AS (ORDER BY fp.data_hora, fp.partida_id)
),
blocos AS (
    SELECT *,
        sum(CASE WHEN resultado IS DISTINCT FROM resultado_anterior THEN 1 ELSE 0 END)
            OVER (ORDER BY data_hora, partida_id) AS bloco
    FROM base
)
SELECT
    * EXCLUDE (resultado_anterior, bloco),
    -- positivo = vitórias seguidas; negativo = derrotas seguidas
    CASE resultado WHEN 'V' THEN 1 WHEN 'D' THEN -1 ELSE 0 END
        * row_number() OVER (PARTITION BY bloco ORDER BY data_hora, partida_id)           AS sequencia,
    round(100 * avg(CASE WHEN resultado = 'V' THEN 1.0 ELSE 0 END)
        OVER (ORDER BY data_hora, partida_id ROWS BETWEEN 9 PRECEDING AND CURRENT ROW), 1) AS aproveitamento_ultimas_10
FROM blocos
ORDER BY data_hora DESC, partida_id DESC;

-- Indicadores gerais (uma linha). Mapas e rounds não contam mapas sem disputa (W.O.).
CREATE OR REPLACE TABLE gold.kpis_gerais AS
WITH p AS (
    SELECT
        count(*)                                             AS partidas,
        count(*) FILTER (WHERE resultado = 'V')              AS vitorias,
        count(*) FILTER (WHERE resultado = 'D')              AS derrotas,
        count(*) FILTER (WHERE resultado = 'E')              AS empates,
        min(data)                                            AS primeira_partida,
        max(data)                                            AS ultima_partida,
        arg_max(sequencia, data_hora)                        AS sequencia_atual,
        max(sequencia)                                       AS maior_sequencia_vitorias
    FROM gold.partidas
),
m AS (
    SELECT
        count(*)                                             AS mapas,
        count(*) FILTER (WHERE resultado = 'V')              AS mapas_vencidos,
        count(*) FILTER (WHERE resultado = 'D')              AS mapas_perdidos,
        sum(rounds_furia)                                    AS rounds_vencidos,
        sum(rounds_adversario)                               AS rounds_perdidos
    FROM silver.fato_mapa
    WHERE NOT sem_disputa
),
e AS (
    SELECT
        count(*)                                             AS campeonatos,
        count(*) FILTER (WHERE pior_posicao = 1)             AS titulos,
        count(*) FILTER (WHERE pior_posicao <= 4)            AS top_4
    FROM silver.fato_colocacao_evento
)
SELECT
    p.partidas, p.vitorias, p.derrotas, p.empates,
    round(100.0 * p.vitorias / nullif(p.partidas, 0), 1)                                  AS aproveitamento,
    m.mapas_vencidos, m.mapas_perdidos,
    round(100.0 * m.mapas_vencidos / nullif(m.mapas, 0), 1)                               AS aproveitamento_mapas,
    m.rounds_vencidos, m.rounds_perdidos,
    p.sequencia_atual, p.maior_sequencia_vitorias,
    e.campeonatos, e.titulos, e.top_4,
    p.primeira_partida, p.ultima_partida
FROM p CROSS JOIN m CROSS JOIN e;

-- Evolução mês a mês.
CREATE OR REPLACE TABLE gold.desempenho_mensal AS
SELECT
    strftime(data, '%Y-%m')                                        AS ano_mes,
    year(data)                                                     AS ano,
    month(data)                                                    AS mes,
    count(*)                                                       AS partidas,
    count(*) FILTER (WHERE resultado = 'V')                        AS vitorias,
    count(*) FILTER (WHERE resultado = 'D')                        AS derrotas,
    pct_vitorias(resultado) AS aproveitamento,
    sum(mapas_vencidos)                                            AS mapas_vencidos,
    sum(mapas_perdidos)                                            AS mapas_perdidos,
    sum(rounds_vencidos) - sum(rounds_perdidos)                    AS saldo_rounds
FROM gold.partidas
GROUP BY ALL
ORDER BY ano_mes;

-- Histórico contra cada adversário.
CREATE OR REPLACE TABLE gold.confronto_direto AS
SELECT
    adversario,
    count(*)                                                       AS partidas,
    count(*) FILTER (WHERE resultado = 'V')                        AS vitorias,
    count(*) FILTER (WHERE resultado = 'D')                        AS derrotas,
    pct_vitorias(resultado) AS aproveitamento,
    sum(mapas_vencidos)                                            AS mapas_vencidos,
    sum(mapas_perdidos)                                            AS mapas_perdidos,
    max(data)                                                      AS ultima_partida,
    arg_max(resultado, data_hora)                                  AS ultimo_resultado
FROM gold.partidas
WHERE adversario IS NOT NULL
GROUP BY adversario
ORDER BY partidas DESC, adversario;

-- Campanha em cada campeonato.
CREATE OR REPLACE TABLE gold.desempenho_por_evento AS
SELECT
    e.evento_id,
    e.nome                                                         AS evento,
    e.ano,
    e.data_inicio,
    e.data_fim,
    e.colocacao,
    e.melhor_posicao,
    e.pior_posicao,
    count(*)                                                       AS partidas,
    count(*) FILTER (WHERE fp.resultado = 'V')                     AS vitorias,
    count(*) FILTER (WHERE fp.resultado = 'D')                     AS derrotas,
    pct_vitorias(fp.resultado) AS aproveitamento
FROM silver.fato_partida fp
JOIN silver.dim_evento e USING (evento_id)
GROUP BY ALL
ORDER BY e.data_inicio DESC;
