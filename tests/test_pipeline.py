import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extract import bronze
from extract.browser import is_challenge
from load import warehouse
from tests import fixtures
from transform.parsers import parse_events_page, parse_match_page, parse_results_page


# ------------------------------------------------------------------- parsers
def test_pagina_de_resultados_lista_partidas_e_total():
    page = parse_results_page(fixtures.results_page())
    assert page["total"] == 2
    assert [m["match_id"] for m in page["matches"]] == [2367598, 2333124]
    first = page["matches"][0]
    assert first["match_url"] == "/matches/2367598/nouns-vs-furia-thunderpick-world-championship-2023"
    assert (first["team1_nome"], first["team1_score"], first["team2_score"]) == ("Nouns", 0, 2)
    assert (first["formato"], first["estrelas"], first["unix_ms"]) == ("bo3", 1, 1698742800000)


def test_cabecalho_identifica_times_evento_e_vencedor():
    match = parse_match_page(fixtures.match_new_layout(), 2367598)["match"]
    assert (match["team1_id"], match["team1_resultado"], match["team1_score"]) == (11948, "lost", 0)
    assert (match["team2_id"], match["team2_resultado"], match["team2_score"]) == (8297, "won", 2)
    assert (match["event_id"], match["event_nome"]) == (7289, "Thunderpick World Championship 2023")
    assert (match["melhor_de"], match["online"], match["fase"]) == (3, True, "Group D elimination Match")
    assert match["encerrada"] and match["unix_ms"] == 1698742800000


def test_mapas_separam_lados_e_marcam_o_nao_jogado():
    maps = parse_match_page(fixtures.match_new_layout(), 2367598)["maps"]
    assert [(m["mapa"], m["jogado"]) for m in maps] == [("Vertigo", True), ("Mirage", True), ("Nuke", False)]
    vertigo = maps[0]
    assert (vertigo["team1_score"], vertigo["team2_score"], vertigo["mapstats_id"]) == (5, 13, 165657)
    # (2:10; 3:3): Nouns começou de TR (2) e fez 3 de CT; FURIA fez 10 de CT e 3 de TR
    assert (vertigo["team1_tr"], vertigo["team1_ct"], vertigo["team2_ct"], vertigo["team2_tr"]) == (2, 3, 10, 3)
    assert vertigo["team1_lado_inicial"] == "TR"
    assert vertigo["escolhido_por_team_id"] == 8297 and maps[1]["escolhido_por_team_id"] == 11948


def test_rounds_de_prorrogacao_ficam_separados():
    mirage = parse_match_page(fixtures.match_old_layout(), 2333124)["maps"][1]
    assert (mirage["team1_score"], mirage["team2_score"]) == (19, 15)
    assert (mirage["team1_ot"], mirage["team2_ot"]) == (4, 0)
    assert mirage["team1_tr"] + mirage["team1_ct"] + mirage["team1_ot"] == 19


def test_vetos_viram_uma_linha_por_acao():
    vetos = parse_match_page(fixtures.match_new_layout(), 2367598)["vetos"]
    assert len(vetos) == 7
    assert (vetos[0]["team_id"], vetos[0]["acao"], vetos[0]["mapa"]) == (8297, "removed", "Anubis")
    assert (vetos[3]["team_id"], vetos[3]["acao"], vetos[3]["mapa"]) == (11948, "picked", "Mirage")
    assert (vetos[6]["team_id"], vetos[6]["acao"], vetos[6]["mapa"]) == (None, "left over", "Nuke")


def test_estatisticas_sao_lidas_pela_classe_css():
    stats = parse_match_page(fixtures.match_new_layout(), 2367598)["player_stats"]
    assert {s["mapstats_id"] for s in stats} == {165657, 165660}  # 'all maps' fica de fora
    row = next(s for s in stats if s["mapstats_id"] == 165657 and s["nick"] == "KSCERATO" and s["lado"] == "TOTAL")
    assert (row["player_id"], row["team_id"]) == (15631, 8297)
    assert (row["kills"], row["deaths"], row["ekills"], row["edeaths"]) == (17, 7, 17, 9)
    assert (row["adr"], row["eadr"], row["kast_pct"], row["ekast_pct"]) == (109.3, 105.5, 77.8, 71.7)
    assert (row["swing_pct"], row["rating"], row["rating_versao"]) == (6.52, 1.71, "3.0")
    assert {s["lado"] for s in stats} == {"TOTAL", "CT", "TR"}


def test_layout_antigo_nao_tem_swing_nem_dados_eco():
    stats = parse_match_page(fixtures.match_old_layout(), 2333124)["player_stats"]
    row = next(s for s in stats if s["mapstats_id"] == 85615 and s["nick"] == "arT")
    assert (row["kills"], row["deaths"], row["swing_pct"]) == (25, 15, None)
    assert (row["ekills"], row["eadr"], row["ekast_pct"]) == (None, None, None)
    assert (row["adr"], row["kast_pct"], row["rating"], row["rating_versao"]) == (95.2, 76.9, 1.45, "2.0")


def test_pagina_de_eventos_e_deteccao_do_cloudflare():
    events = parse_events_page(fixtures.events_page())
    assert events[0] == {"event_id": 7289, "evento_nome": "Thunderpick World Championship 2023", "colocacao": "5-8th"}
    assert is_challenge(fixtures.challenge_page())
    assert not is_challenge(fixtures.match_new_layout())  # página real cita 'Cloudflare' em scripts, mas não no título


# ------------------------------------------------- bronze -> silver -> gold
def _build(tmp_path):
    root = tmp_path / "bronze"
    bronze.save(bronze.RESULTS, bronze.results_name(0), fixtures.results_page(), root)
    bronze.save(bronze.MATCHES, "2367598", fixtures.match_new_layout(), root)
    bronze.save(bronze.MATCHES, "2333124", fixtures.match_old_layout(), root)
    bronze.save(bronze.EVENTS, "events", fixtures.events_page(), root)
    db, export = tmp_path / "t.duckdb", tmp_path / "export"
    summary = warehouse.build(bronze_root=root, db_path=db, export_dir=export)
    return summary, db, export, root


def test_silver_fica_na_otica_da_furia(tmp_path):
    summary, db, _, _ = _build(tmp_path)
    assert summary["partidas_interpretadas"] == 2 and summary["partidas_na_silver"] == 2
    con = warehouse.connect(db)
    q = lambda sql: con.execute(sql).fetchall()
    assert q("SELECT partida_id, resultado, placar_furia, placar_adversario, melhor_de, estrelas "
             "FROM silver.fato_partida ORDER BY data") == [(2333124, "D", 1, 2, 3, 0), (2367598, "V", 2, 0, 3, 1)]
    assert q("SELECT data FROM silver.fato_partida WHERE partida_id = 2367598")[0][0].isoformat() == "2023-10-31"
    # 5 mapas jogados; o Nuke não jogado não vira linha
    assert q("SELECT count(*), count(*) FILTER (WHERE resultado = 'V') FROM silver.fato_mapa") == [(5, 3)]
    assert q("SELECT rounds_furia, rounds_adversario, rounds_ct_furia, rounds_tr_furia, lado_inicial_furia, escolha "
             "FROM silver.fato_mapa WHERE mapstats_id = 165657") == [(13, 5, 10, 3, "CT", "FURIA")]
    assert q("SELECT escolha FROM silver.fato_mapa WHERE mapstats_id = 85630") == [("DECISIVO",)]
    assert q("SELECT autor, acao, count(*) FROM silver.fato_veto GROUP BY ALL ORDER BY ALL") == [
        ("ADVERSARIO", "BAN", 4), ("ADVERSARIO", "PICK", 2), ("FURIA", "BAN", 4), ("FURIA", "PICK", 2), (None, "SOBRA", 2)]
    assert q("SELECT nome FROM silver.dim_time WHERE eh_furia") == [("FURIA",)]
    assert q("SELECT colocacao, melhor_posicao FROM silver.dim_evento WHERE evento_id = 7289") == [("5-8th", 5)]
    assert q("SELECT pior_posicao FROM silver.dim_evento WHERE evento_id = 7289") == [(8,)]
    # jogador x mapa x lado, sem produto cartesiano: 2 jogadores x 2 mapas x 3 lados + 2 x 3 x 1
    assert q("SELECT count(*) FROM silver.fato_jogador_mapa") == [(18,)]
    con.close()


def test_tabelas_gold_e_exportacao(tmp_path):
    _, db, export, _ = _build(tmp_path)
    con = warehouse.connect(db)
    q = lambda sql: con.execute(sql).fetchall()
    assert q("SELECT partidas, vitorias, derrotas, aproveitamento, mapas_vencidos, mapas_perdidos, aproveitamento_mapas, "
             "sequencia_atual, titulos FROM gold.kpis_gerais") == [(2, 1, 1, 50.0, 3, 2, 60.0, 1, 1)]
    assert q("SELECT adversario, resultado, mapas, sequencia FROM gold.partidas ORDER BY data") == [
        ("Lazarus", "D", "Overpass 16-10, Mirage 15-19, Inferno 9-16", -1),
        ("Nouns", "V", "Vertigo 13-5, Mirage 13-7", 1)]
    assert q("SELECT jogados, vitorias, aproveitamento, aproveitamento_rounds_ct, picks_adversario, prorrogacoes "
             "FROM gold.desempenho_por_mapa WHERE mapa = 'Mirage'") == [(2, 1, 50.0, 55.6, 2, 1)]  # CT: (10+5) vencidos de (12+15) disputados
    assert q("SELECT jogador, mapas, kills, deaths, kd FROM gold.jogadores ORDER BY jogador") == [
        ("KSCERATO", 2, 32, 16, 2.0), ("arT", 3, 59, 58, 1.02)]
    assert q("SELECT count(*) FROM gold.jogador_por_lado") == [(2,)]
    con.close()

    # só as tabelas que o dashboard lê são exportadas
    from config import settings
    assert {p.name for p in export.iterdir()} == {f"{t}.json" for t in settings.DASHBOARD_TABLES}
    exported = json.loads((export / "partidas.json").read_text(encoding="utf-8"))
    assert [p["adversario"] for p in exported] == ["Nouns", "Lazarus"]


def test_reconstrucao_e_incremental_e_idempotente(tmp_path):
    _, db, export, root = _build(tmp_path)
    again = warehouse.build(bronze_root=root, db_path=db, export_dir=export)
    assert again["partidas_interpretadas"] == 0 and again["partidas_na_silver"] == 2
    forced = warehouse.build(bronze_root=root, db_path=db, export_dir=export, reparse_all=True)
    assert forced["partidas_interpretadas"] == 2 and forced["partidas_na_silver"] == 2
    con = warehouse.connect(db)
    assert con.execute("SELECT count(*) FROM staging.player_stats").fetchone()[0] == 18
    con.close()


# ------------------------------------------------------ resumo para automação
def test_falha_e_classificada_para_a_automacao():
    from extract.browser import BrowserUnavailable, ChallengeError, PageLoadError
    from main import classify_failure

    assert classify_failure(BrowserUnavailable("porta fechada")) == "sem_chrome"
    assert classify_failure(ChallengeError("verificação do Cloudflare não resolvida: url")) == "cloudflare"
    assert classify_failure(PageLoadError("conteúdo não apareceu: url")) == "erro"
    assert classify_failure(ValueError("x")) == "erro"


def test_resumo_de_partidas_novas_vem_da_gold(tmp_path):
    from main import new_matches

    _, db, _, _ = _build(tmp_path)
    assert new_matches(set(), db) == []
    novas = new_matches({2367598, 999}, db)
    assert [(n["partida_id"], n["data"], n["adversario"], n["resultado"], n["placar_furia"], n["placar_adversario"])
            for n in novas] == [(2367598, "2023-10-31", "Nouns", "V", 2, 0)]
    assert novas[0]["mapas"] == "Vertigo 13-5, Mirage 13-7"
    json.dumps(novas)  # precisa ser serializável


# ------------------------------------------------ gold no grão de mapa (filtros)
def test_tabelas_de_detalhe_alimentam_os_filtros(tmp_path):
    _, db, export, _ = _build(tmp_path)
    con = warehouse.connect(db)
    q = lambda sql: con.execute(sql).fetchall()
    # nas fixtures cada partida tem um jogador diferente da FURIA: duas escalações
    assert q("SELECT lineup_id, jogadores, partidas, mapas FROM gold.lineups ORDER BY lineup_id") == [
        (1, "arT", 1, 3), (2, "KSCERATO", 1, 2)]
    assert q("SELECT count(*), count(lineup_id) FROM gold.detalhe_mapas") == [(5, 5)]
    assert q("SELECT mapa, resultado, rounds_furia, rounds_adversario, lineup_id FROM gold.detalhe_mapas "
             "WHERE mapstats_id = 165657") == [("Vertigo", "V", 13, 5, 2)]
    # mesmas linhas da silver, só da FURIA: o mapa inteiro em uma tabela, os lados em outra
    assert q("SELECT count(*) FROM gold.detalhe_jogadores") == q(
        "SELECT count(*) FROM silver.fato_jogador_mapa WHERE eh_furia AND lado = 'TOTAL'")
    assert q("SELECT count(*) FROM gold.detalhe_jogadores_lado") == q(
        "SELECT count(*) FROM silver.fato_jogador_mapa WHERE eh_furia AND lado <> 'TOTAL'")
    # reagregar o detalhe reproduz a tabela já agregada
    assert q("SELECT jogador, round(sum(rating * rounds) / sum(rounds), 2) FROM gold.detalhe_jogadores "
             "GROUP BY jogador ORDER BY jogador") == q(
        "SELECT jogador, rating FROM gold.jogadores ORDER BY jogador")
    assert q("SELECT count(*) FROM gold.detalhe_vetos") == q(
        "SELECT count(*) FROM silver.fato_veto WHERE autor IS NOT NULL")
    con.close()
    assert {"lineups", "detalhe_mapas", "detalhe_jogadores", "detalhe_vetos"} <= {p.stem for p in export.glob("*.json")}


# ------------------------------------------------------ publicação do dashboard
def test_copia_dos_dados_so_acusa_mudanca_real(tmp_path):
    from config import settings
    from load import publish

    _, _, export, _ = _build(tmp_path)
    dest = tmp_path / "docs" / "data"
    assert publish.sync_dashboard_data(export, dest) is True
    assert {p.name for p in dest.glob("*.json")} == {f"{t}.json" for t in settings.DASHBOARD_TABLES} | {"meta.json"}
    meta = (dest / "meta.json").read_text(encoding="utf-8")
    assert json.loads(meta)["atualizado_em"]
    # sem mudança nos dados: nada é regravado, nem a data de atualização
    assert publish.sync_dashboard_data(export, dest) is False
    assert (dest / "meta.json").read_text(encoding="utf-8") == meta
    (export / "lineups.json").write_text("[]", encoding="utf-8")
    assert publish.sync_dashboard_data(export, dest) is True
    assert (dest / "lineups.json").read_text(encoding="utf-8") == "[]"


def test_publicacao_envia_so_a_pasta_de_dados(tmp_path):
    import subprocess
    from load import publish

    git = lambda cwd, *a: subprocess.run(["git", "-C", str(cwd), *a], capture_output=True, text=True, check=True).stdout
    remote, repo = tmp_path / "remote.git", tmp_path / "repo"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(remote)], check=True)
    subprocess.run(["git", "clone", "-q", str(remote), str(repo)], check=True, capture_output=True)
    git(repo, "config", "user.name", "teste"); git(repo, "config", "user.email", "teste@example.com")
    git(repo, "checkout", "-q", "-b", "main")
    data = repo / "docs" / "data"; data.mkdir(parents=True)
    (data / "a.json").write_text("[1]"); (repo / "outro.txt").write_text("fora da publicação")
    git(repo, "add", "docs"); git(repo, "commit", "-q", "-m", "inicial"); git(repo, "push", "-q", "-u", "origin", "main")

    assert publish.push_dashboard(repo, data)["status"] == "sem_mudanca"
    (data / "a.json").write_text("[1, 2]")
    assert publish.push_dashboard(repo, data)["status"] == "publicado"
    assert git(remote, "show", "main:docs/data/a.json") == "[1, 2]"
    assert "outro.txt" not in git(remote, "ls-tree", "-r", "--name-only", "main")
    assert publish.push_dashboard(repo, data)["status"] == "sem_mudanca"


    # commit local de outra coisa ainda não enviado: a publicação se recusa a levá-lo junto
    (repo / "outro.txt").write_text("trabalho em andamento"); git(repo, "add", "outro.txt"); git(repo, "commit", "-q", "-m", "wip")
    (data / "a.json").write_text("[1, 2, 3]")
    blocked = publish.push_dashboard(repo, data)
    assert blocked["status"] == "erro" and "outro.txt" in blocked["mensagem"]
    assert git(remote, "show", "main:docs/data/a.json") == "[1, 2]"
    git(repo, "checkout", "-q", "-b", "experimento")
    assert "branch atual" in publish.push_dashboard(repo, data)["mensagem"]


# ------------------------------------------------------- consistência do banco
def test_bronze_e_a_fonte_da_verdade(tmp_path):
    _, db, export, root = _build(tmp_path)
    (root / bronze.MATCHES / "2333124.html.gz").unlink()
    assert warehouse.build(bronze_root=root, db_path=db, export_dir=export)["partidas_na_silver"] == 1
    con = warehouse.connect(db)
    assert con.execute("SELECT count(DISTINCT match_id) FROM staging.player_stats").fetchone()[0] == 1
    con.close()


def test_lista_de_resultados_acumula_entre_execucoes(tmp_path):
    import re

    _, db, export, root = _build(tmp_path)
    # a página 0 mais nova já não traz a primeira partida (ela teria ido para uma página não rebaixada)
    page = re.sub(r'<div class="result-con".*?</div>\s*(?=<div class="result-con")', "", fixtures.results_page(), count=1, flags=re.S)
    assert [m["match_id"] for m in parse_results_page(page)["matches"]] == [2333124]
    bronze.save(bronze.RESULTS, bronze.results_name(0), page, root)
    warehouse.build(bronze_root=root, db_path=db, export_dir=export)
    con = warehouse.connect(db)
    assert con.execute("SELECT partida_id, estrelas FROM silver.fato_partida ORDER BY 1").fetchall() == [(2333124, 0), (2367598, 1)]
    con.close()


def test_mudanca_de_esquema_forca_releitura(tmp_path):
    _, db, export, root = _build(tmp_path)
    con = warehouse.connect(db)
    con.execute("ALTER TABLE staging.match_vetos ADD COLUMN coluna_antiga VARCHAR")
    con.close()
    again = warehouse.build(bronze_root=root, db_path=db, export_dir=export)
    assert again["partidas_interpretadas"] == 2 and again["partidas_na_silver"] == 2


def test_horario_de_brasilia_segue_o_horario_de_verao(tmp_path):
    con = warehouse.connect(tmp_path / "t.duckdb")
    warehouse.run_sql_layer(con, "silver")
    # 2018-12-15 01:30 UTC: 23:30 do dia 14 em horário de verão (UTC-2); 2023-12-15 01:30 UTC: 22:30 (UTC-3)
    rows = con.execute("SELECT CAST(data_hora_brt(1544837400000) AS VARCHAR), CAST(data_hora_brt(1702603800000) AS VARCHAR)").fetchone()
    con.close()
    assert rows == ("2018-12-14 23:30:00", "2023-12-14 22:30:00")
