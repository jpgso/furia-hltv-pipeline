-- Camada GOLD: tabelas no grão de mapa, para o dashboard filtrar e agregar no navegador
-- (período, lineup, mapa, jogador, adversário). As demais tabelas gold já vêm agregadas.

-- Escalação da FURIA em cada mapa: os jogadores com estatística naquele mapa.
CREATE OR REPLACE VIEW gold.base_lineup_mapa AS
SELECT
    fj.partida_id,
    fj.mapstats_id,
    string_agg(j.nick, ' · ' ORDER BY lower(j.nick))      AS jogadores
FROM silver.fato_jogador_mapa fj
JOIN silver.dim_jogador j USING (jogador_id)
WHERE fj.eh_furia AND fj.lado = 'TOTAL'
GROUP BY fj.partida_id, fj.mapstats_id;

-- Uma linha por escalação distinta, em ordem de estreia.
CREATE OR REPLACE TABLE gold.lineups AS
SELECT
    row_number() OVER (ORDER BY min(fp.data_hora), l.jogadores) AS lineup_id,
    l.jogadores,
    count(DISTINCT l.partida_id)                          AS partidas,
    count(*)                                              AS mapas,
    round(100.0 * count(*) FILTER (WHERE fm.resultado = 'V') / count(*), 1) AS aproveitamento_mapas,
    min(fp.data)                                          AS primeira_partida,
    max(fp.data)                                          AS ultima_partida
FROM gold.base_lineup_mapa l
JOIN silver.fato_mapa fm USING (partida_id, mapstats_id)
JOIN silver.fato_partida fp USING (partida_id)
GROUP BY l.jogadores
ORDER BY lineup_id;

-- Uma linha por mapa disputado.
CREATE OR REPLACE TABLE gold.detalhe_mapas AS
SELECT
    fm.partida_id,
    fm.mapstats_id,
    fm.ordem,
    fp.data,
    d.nome                                                AS mapa,
    fm.resultado,
    fm.rounds_furia,
    fm.rounds_adversario,
    fm.rounds_ct_furia,
    fm.rounds_tr_furia,
    fm.rounds_ct_adversario,
    fm.rounds_tr_adversario,
    fm.teve_prorrogacao,
    fm.escolha,
    fm.lado_inicial_furia,
    g.lineup_id
FROM silver.fato_mapa fm
JOIN silver.fato_partida fp USING (partida_id)
JOIN silver.dim_mapa d USING (mapa_id)
LEFT JOIN gold.base_lineup_mapa l USING (partida_id, mapstats_id)
LEFT JOIN gold.lineups g ON g.jogadores = l.jogadores
WHERE NOT fm.sem_disputa
ORDER BY fp.data_hora, fm.partida_id, fm.ordem;

-- Uma linha por jogador da FURIA x mapa, com o desempenho no mapa inteiro.
-- `rounds` é o peso para as médias de ADR, KAST e rating.
CREATE OR REPLACE TABLE gold.detalhe_jogadores AS
SELECT
    b.mapstats_id,
    j.nick                                                AS jogador,
    b.rounds, b.kills, b.deaths, b.adr, b.kast_pct, b.rating
FROM gold.base_jogador_mapa b
JOIN silver.dim_jogador j USING (jogador_id)
WHERE b.lado = 'TOTAL'
ORDER BY b.data_hora, b.mapstats_id, j.nick;

-- O mesmo recorte separado por lado (CT e TR). Fica em outra tabela porque o
-- dashboard só a carrega quando alguém pede a visão por lado.
CREATE OR REPLACE TABLE gold.detalhe_jogadores_lado AS
SELECT
    b.mapstats_id,
    j.nick                                                AS jogador,
    b.lado,
    b.rounds, b.kills, b.deaths, b.adr, b.kast_pct, b.rating
FROM gold.base_jogador_mapa b
JOIN silver.dim_jogador j USING (jogador_id)
WHERE b.lado IN ('CT', 'TR')
ORDER BY b.data_hora, b.mapstats_id, j.nick, b.lado;

-- Uma linha por ação de veto com autor conhecido.
CREATE OR REPLACE TABLE gold.detalhe_vetos AS
SELECT
    fv.partida_id,
    fv.ordem,
    d.nome                                                AS mapa,
    fv.acao,
    fv.autor
FROM silver.fato_veto fv
JOIN silver.dim_mapa d USING (mapa_id)
WHERE fv.autor IS NOT NULL
ORDER BY fv.partida_id, fv.ordem;
