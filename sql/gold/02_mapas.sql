-- Camada GOLD: desempenho por mapa e comportamento nos vetos.

-- Aproveitamento por mapa, por lado (CT/TR) e por quem escolheu o mapa.
-- Rounds de CT disputados pela FURIA = rounds que ela venceu de CT + rounds que o adversário venceu de TR.
CREATE OR REPLACE TABLE gold.desempenho_por_mapa AS
WITH jogos AS (
    SELECT
        fm.mapa_id,
        count(*)                                                        AS jogados,
        count(*) FILTER (WHERE fm.resultado = 'V')                         AS vitorias,
        count(*) FILTER (WHERE fm.resultado = 'D')                         AS derrotas,
        sum(rounds_furia)                                               AS rounds_vencidos,
        sum(rounds_adversario)                                          AS rounds_perdidos,
        sum(rounds_ct_furia)                                            AS ct_vencidos,
        sum(rounds_ct_furia) + sum(rounds_tr_adversario)                AS ct_disputados,
        sum(rounds_tr_furia)                                            AS tr_vencidos,
        sum(rounds_tr_furia) + sum(rounds_ct_adversario)                AS tr_disputados,
        count(*) FILTER (WHERE escolha = 'FURIA')                       AS jogados_escolha_furia,
        count(*) FILTER (WHERE escolha = 'FURIA' AND fm.resultado = 'V')   AS vitorias_escolha_furia,
        count(*) FILTER (WHERE escolha = 'ADVERSARIO')                  AS jogados_escolha_adversario,
        count(*) FILTER (WHERE escolha = 'ADVERSARIO' AND fm.resultado = 'V') AS vitorias_escolha_adversario,
        count(*) FILTER (WHERE teve_prorrogacao)                        AS prorrogacoes,
        max(fp.data)                                                    AS ultima_vez
    FROM silver.fato_mapa fm
    JOIN silver.fato_partida fp USING (partida_id)
    GROUP BY fm.mapa_id
),
vetos AS (
    SELECT
        mapa_id,
        count(*) FILTER (WHERE autor = 'FURIA' AND acao = 'BAN')        AS bans_furia,
        count(*) FILTER (WHERE autor = 'FURIA' AND acao = 'PICK')       AS picks_furia,
        count(*) FILTER (WHERE autor = 'ADVERSARIO' AND acao = 'BAN')   AS bans_adversario,
        count(*) FILTER (WHERE autor = 'ADVERSARIO' AND acao = 'PICK')  AS picks_adversario
    FROM silver.fato_veto
    GROUP BY mapa_id
)
SELECT
    d.nome                                                              AS mapa,
    j.jogados, j.vitorias, j.derrotas,
    round(100.0 * j.vitorias / nullif(j.jogados, 0), 1)                 AS aproveitamento,
    j.rounds_vencidos, j.rounds_perdidos,
    round(100.0 * j.ct_vencidos / nullif(j.ct_disputados, 0), 1)        AS aproveitamento_rounds_ct,
    round(100.0 * j.tr_vencidos / nullif(j.tr_disputados, 0), 1)        AS aproveitamento_rounds_tr,
    j.jogados_escolha_furia,
    round(100.0 * j.vitorias_escolha_furia / nullif(j.jogados_escolha_furia, 0), 1)           AS aproveitamento_escolha_furia,
    j.jogados_escolha_adversario,
    round(100.0 * j.vitorias_escolha_adversario / nullif(j.jogados_escolha_adversario, 0), 1) AS aproveitamento_escolha_adversario,
    j.prorrogacoes,
    coalesce(v.bans_furia, 0)                                           AS bans_furia,
    coalesce(v.picks_furia, 0)                                          AS picks_furia,
    coalesce(v.bans_adversario, 0)                                      AS bans_adversario,
    coalesce(v.picks_adversario, 0)                                     AS picks_adversario,
    j.ultima_vez
FROM silver.dim_mapa d
JOIN jogos j USING (mapa_id)
LEFT JOIN vetos v USING (mapa_id)
ORDER BY j.jogados DESC;

-- Mesmo recorte, ano a ano (para ver a evolução do map pool).
CREATE OR REPLACE TABLE gold.desempenho_por_mapa_ano AS
SELECT
    d.nome                                                              AS mapa,
    year(fp.data)                                                       AS ano,
    count(*)                                                            AS jogados,
    count(*) FILTER (WHERE fm.resultado = 'V')                          AS vitorias,
    count(*) FILTER (WHERE fm.resultado = 'D')                          AS derrotas,
    round(100.0 * count(*) FILTER (WHERE fm.resultado = 'V') / count(*), 1) AS aproveitamento,
    sum(fm.rounds_furia) - sum(fm.rounds_adversario)                    AS saldo_rounds
FROM silver.fato_mapa fm
JOIN silver.fato_partida fp USING (partida_id)
JOIN silver.dim_mapa d USING (mapa_id)
GROUP BY ALL
ORDER BY ano, jogados DESC;

-- Tendência de veto por ano: o que a FURIA e os adversários banem e escolhem.
CREATE OR REPLACE TABLE gold.vetos AS
WITH series AS (
    SELECT year(fp.data) AS ano, count(DISTINCT fv.partida_id) AS partidas_com_veto
    FROM silver.fato_veto fv
    JOIN silver.fato_partida fp USING (partida_id)
    GROUP BY ALL
)
SELECT
    year(fp.data)                                                       AS ano,
    fv.autor,
    fv.acao,
    d.nome                                                              AS mapa,
    count(*)                                                            AS vezes,
    round(100.0 * count(*) / any_value(s.partidas_com_veto), 1)         AS pct_das_partidas
FROM silver.fato_veto fv
JOIN silver.fato_partida fp USING (partida_id)
JOIN silver.dim_mapa d USING (mapa_id)
JOIN series s ON s.ano = year(fp.data)
WHERE fv.autor IS NOT NULL
GROUP BY ALL
ORDER BY ano, autor, acao, vezes DESC;
