"""Leitura do HTML da HLTV em registros estruturados.

Funções puras (HTML entra, dicionários saem), sem rede e sem banco,
para poderem ser testadas e executadas em paralelo. As células são localizadas
pela classe CSS, nunca pela posição: a HLTV mantém colunas ocultas (eK-eD,
eADR, eKAST) e mudou o layout ao longo dos anos.
"""
import re

from bs4 import BeautifulSoup

from extract import bronze

_MATCH_HREF = re.compile(r"/matches/(\d+)/([^/?#\"]+)")
_VETO_ACTION = re.compile(r"^(\d+)\.\s+(.+?)\s+(removed|picked)\s+(.+)$", re.I)
_VETO_LEFT = re.compile(r"^(\d+)\.\s+(.+?)\s+was left over$", re.I)
_SIDES = {"totalstats": "TOTAL", "ctstats": "CT", "tstats": "TR"}


# ------------------------------------------------------------------ utilidades
def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def _text(el) -> str | None:
    if el is None:
        return None
    return el.get_text(" ", strip=True) or None


def _int(value) -> int | None:
    try:
        return int(str(value).strip().replace("+", ""))
    except (TypeError, ValueError):
        return None


def _float(value) -> float | None:
    try:
        return float(str(value).strip().replace("%", "").replace("+", ""))
    except (TypeError, ValueError):
        return None


def _pair(value) -> tuple[int | None, int | None]:
    """'14-16' -> (14, 16); 'null-null' -> (None, None)."""
    m = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", value or "")
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def _href_id(el, kind: str) -> tuple[int | None, str | None]:
    """Extrai (id, slug) de um link como /team/8297/furia."""
    href = el.get("href", "") if el is not None else ""
    m = re.search(rf"/{kind}/(\d+)(?:/([^/?#]+))?", href)
    return (int(m.group(1)), m.group(2)) if m else (None, None)


def _same(a: str | None, b: str | None) -> bool:
    return bool(a) and bool(b) and a.strip().casefold() == b.strip().casefold()


# --------------------------------------------------------- página de resultados
def parse_results_page(html: str) -> dict:
    """Lista de partidas de /results?team=...; `total` vem da paginação."""
    soup = _soup(html)
    cons = soup.select(".results-all .result-con") or soup.select(".result-con")
    matches, seen = [], set()
    for con in cons:
        link = con.select_one("a[href*='/matches/']")
        m = _MATCH_HREF.search(link.get("href", "")) if link else None
        if not m or int(m.group(1)) in seen:
            continue
        match_id = int(m.group(1))
        seen.add(match_id)
        scores = [_int(s.get_text()) for s in con.select(".result-score span")]
        matches.append({
            "match_id": match_id,
            "match_url": f"/matches/{match_id}/{m.group(2)}",
            "unix_ms": _int(con.get("data-zonedgrouping-entry-unix")),
            "team1_nome": _text(con.select_one(".team1 .team")),
            "team2_nome": _text(con.select_one(".team2 .team")),
            "team1_score": scores[0] if len(scores) > 0 else None,
            "team2_score": scores[1] if len(scores) > 1 else None,
            "evento_nome": _text(con.select_one(".event-name")),
            "formato": _text(con.select_one(".map-text")),
            "estrelas": len(con.select(".stars i")),
        })
    total = None
    pagination = _text(soup.select_one(".pagination-data"))
    if pagination:
        m = re.search(r"of\s+(\d+)", pagination)
        total = int(m.group(1)) if m else None
    return {"total": total, "matches": matches}


# ----------------------------------------------------------- página de partida
def _parse_teams(soup) -> list[dict]:
    teams = []
    for box in soup.select(".teamsBox .team")[:2]:
        team_id, slug = _href_id(box.select_one("a[href*='/team/']"), "team")
        score_el = box.select_one(".won, .lost, .tie")
        result = None
        if score_el is not None:
            result = next((c for c in ("won", "lost", "tie") if c in score_el.get("class", [])), None)
        teams.append({
            "id": team_id,
            "slug": slug,
            "nome": _text(box.select_one(".teamName")),
            "score": _int(_text(score_el)),
            "resultado": result,
        })
    while len(teams) < 2:
        teams.append({"id": None, "slug": None, "nome": None, "score": None, "resultado": None})
    return teams


def _team_id_by_name(name: str | None, teams: list[dict]) -> int | None:
    for team in teams:
        if _same(name, team["nome"]):
            return team["id"]
    return None


def _parse_format_and_vetos(soup, match_id: int, teams: list[dict]):
    vetos, info_lines = [], []
    for box in soup.select(".veto-box"):
        for line in box.stripped_strings:
            for piece in (p.strip() for p in line.split("\n")):
                if not piece:
                    continue
                action, left = _VETO_ACTION.match(piece), _VETO_LEFT.match(piece)
                if action:
                    vetos.append({
                        "match_id": match_id,
                        "ordem": int(action.group(1)),
                        "team_id": _team_id_by_name(action.group(2), teams),
                        "acao": action.group(3).lower(),
                        "mapa": action.group(4).strip(),
                    })
                elif left:
                    vetos.append({
                        "match_id": match_id,
                        "ordem": int(left.group(1)),
                        "team_id": None,
                        "acao": "left over",
                        "mapa": left.group(2).strip(),
                    })
                else:
                    info_lines.append(piece)
    info = " ".join(info_lines)
    best_of = re.search(r"best of (\d+)", info, re.I)
    place = re.search(r"\((online|lan)\)", info, re.I)
    stage = re.search(r"\*\s*(.+)$", info)
    return vetos, {
        "melhor_de": int(best_of.group(1)) if best_of else None,
        "online": (place.group(1).lower() == "online") if place else None,
        "fase": stage.group(1).strip() if stage else None,
    }


def _parse_half_scores(center) -> dict:
    """'(2:10; 3:3) (4:0)': os spans trazem a classe do lado (ct/t) de cada metade."""
    out = dict.fromkeys(
        ["left_ct", "left_tr", "right_ct", "right_tr", "left_ot", "right_ot", "left_first_side"]
    )
    half = center.select_one(".results-center-half-score") if center else None
    if half is None:
        return out
    numbers = [(s.get("class") or [], _int(s.get_text())) for s in half.find_all("span")]
    numbers = [(cls, n) for cls, n in numbers if n is not None]
    for idx, (cls, n) in enumerate(numbers):
        side = "left" if idx % 2 == 0 else "right"
        if "ct" in cls:
            key = f"{side}_ct"
        elif "t" in cls:
            key = f"{side}_tr"
        else:
            key = f"{side}_ot"
        out[key] = (out[key] or 0) + n
        if idx == 0:
            out["left_first_side"] = "CT" if "ct" in cls else "TR" if "t" in cls else None
    return out


def _parse_maps(soup, match_id: int, teams: list[dict]) -> list[dict]:
    maps = []
    for ordem, holder in enumerate(soup.select(".mapholder"), start=1):
        results = holder.select_one(".results")
        left = results.select_one(".results-left") if results else None
        right = results.select_one(".results-right") if results else None
        left_score = _int(_text(left.select_one(".results-team-score"))) if left else None
        right_score = _int(_text(right.select_one(".results-team-score"))) if right else None
        stats_link = holder.select_one("a.results-stats[href*='mapstatsid']")
        mapstats = re.search(r"mapstatsid/(\d+)", stats_link.get("href", "")) if stats_link else None
        halves = _parse_half_scores(results.select_one(".results-center") if results else None)

        # A esquerda costuma ser o time 1; confere pelo nome para não inverter.
        swapped = _same(_text(left.select_one(".results-teamname")) if left else None, teams[1]["nome"])
        l, r = ("team2", "team1") if swapped else ("team1", "team2")
        picker = None
        if left is not None and "pick" in left.get("class", []):
            picker = teams[1 if swapped else 0]["id"]
        elif right is not None and "pick" in right.get("class", []):
            picker = teams[0 if swapped else 1]["id"]
        first_side = halves["left_first_side"]
        if swapped and first_side:
            first_side = "TR" if first_side == "CT" else "CT"

        maps.append({
            "match_id": match_id,
            "ordem": ordem,
            "mapa": _text(holder.select_one(".mapname")),
            "mapstats_id": int(mapstats.group(1)) if mapstats else None,
            "jogado": left_score is not None and right_score is not None,
            f"{l}_score": left_score,
            f"{r}_score": right_score,
            f"{l}_ct": halves["left_ct"],
            f"{l}_tr": halves["left_tr"],
            f"{l}_ot": halves["left_ot"],
            f"{r}_ct": halves["right_ct"],
            f"{r}_tr": halves["right_tr"],
            f"{r}_ot": halves["right_ot"],
            "team1_lado_inicial": first_side,
            "escolhido_por_team_id": picker,
        })
    return maps


def _cell(row, cls: str, variant: str | None = None) -> str | None:
    fallback = None
    for td in row.find_all("td"):
        classes = td.get("class") or []
        if cls not in classes:
            continue
        if variant is None or variant in classes:
            return td.get_text(strip=True)
        if fallback is None and "eco-adjusted-data" not in classes:
            fallback = td.get_text(strip=True)
    return fallback if variant == "traditional-data" else None


def _parse_player_stats(soup, match_id: int, teams: list[dict]) -> list[dict]:
    """Uma linha por jogador x mapa x lado (TOTAL, CT, TR)."""
    rows = []
    for content in soup.select("div.stats-content"):
        m = re.fullmatch(r"(\d+)-content", content.get("id", ""))
        if not m:  # 'all-content' é o agregado da série; o grão aqui é o mapa
            continue
        mapstats_id = int(m.group(1))
        order: list[str] = []
        for table in content.find_all("table"):
            classes = table.get("class") or []
            side = next((v for k, v in _SIDES.items() if k in classes), None)
            if side is None:
                continue
            header = table.select_one("tr.header-row")
            team_name = _text(header.select_one(".players")) if header else None
            team_id = _team_id_by_name(team_name, teams)
            if team_id is None and team_name:
                if team_name not in order:
                    order.append(team_name)
                idx = order.index(team_name)
                team_id = teams[idx]["id"] if idx < 2 else None
            version = re.search(r"(\d\.\d)", _text(header.select_one(".rating")) or "") if header else None

            for tr in table.find_all("tr"):
                if "header-row" in (tr.get("class") or []):
                    continue
                link = tr.select_one("a[href*='/player/']")
                player_id, _ = _href_id(link, "player")
                if player_id is None:
                    continue
                nick = _text(tr.select_one(".player-nick")) or _text(tr.select_one(".smartphone-only"))
                kills, deaths = _pair(_cell(tr, "kd", "traditional-data"))
                ekills, edeaths = _pair(_cell(tr, "kd", "eco-adjusted-data"))
                has_eco = ekills is not None
                rows.append({
                    "match_id": match_id,
                    "mapstats_id": mapstats_id,
                    "team_id": team_id,
                    "player_id": player_id,
                    "nick": nick,
                    "nome_completo": _text(tr.select_one(".gtSmartphone-only")) or nick,
                    "lado": side,
                    "kills": kills,
                    "deaths": deaths,
                    "ekills": ekills,
                    "edeaths": edeaths,
                    "swing_pct": _float(_cell(tr, "roundSwing")),
                    "adr": _float(_cell(tr, "adr", "traditional-data")),
                    "eadr": _float(_cell(tr, "adr", "eco-adjusted-data")) if has_eco else None,
                    "kast_pct": _float(_cell(tr, "kast", "traditional-data")),
                    "ekast_pct": _float(_cell(tr, "kast", "eco-adjusted-data")) if has_eco else None,
                    "rating": _float(_cell(tr, "rating")),
                    "rating_versao": version.group(1) if version else None,
                })
    return rows


def parse_match_page(html: str, match_id: int) -> dict:
    soup = _soup(html)
    teams = _parse_teams(soup)
    event_link = soup.select_one(".timeAndEvent .event a")
    event_id, _ = _href_id(event_link, "events")
    time_el = soup.select_one(".timeAndEvent .time[data-unix]") or soup.select_one(".timeAndEvent [data-unix]")
    canonical = soup.select_one("link[rel='canonical']")
    url = _MATCH_HREF.search(canonical.get("href", "")) if canonical else None
    vetos, fmt = _parse_format_and_vetos(soup, match_id, teams)

    match = {
        "match_id": match_id,
        "match_url": f"/matches/{match_id}/{url.group(2)}" if url else f"/matches/{match_id}/_",
        "unix_ms": _int(time_el.get("data-unix")) if time_el else None,
        "event_id": event_id,
        "event_nome": _text(event_link),
        "team1_id": teams[0]["id"],
        "team1_nome": teams[0]["nome"],
        "team1_score": teams[0]["score"],
        "team1_resultado": teams[0]["resultado"],
        "team2_id": teams[1]["id"],
        "team2_nome": teams[1]["nome"],
        "team2_score": teams[1]["score"],
        "team2_resultado": teams[1]["resultado"],
        "encerrada": teams[0]["resultado"] is not None and teams[1]["resultado"] is not None,
        **fmt,
    }
    return {
        "match": match,
        "maps": _parse_maps(soup, match_id, teams),
        "vetos": vetos,
        "player_stats": _parse_player_stats(soup, match_id, teams),
    }


def parse_match_file(path) -> dict:
    """Ponto de entrada para processamento paralelo: lê o .html.gz e interpreta."""
    match_id = int(str(path).replace("\\", "/").rsplit("/", 1)[-1].split(".")[0])
    return parse_match_page(bronze.load(path), match_id)


# ----------------------------------------------------------- página de eventos
def parse_events_page(html: str) -> list[dict]:
    """Colocações da tabela de /stats/teams/events/...: (colocação, campeonato)."""
    rows = []
    table = _soup(html).select_one("table.stats-table")
    if table is None:
        return rows
    for tr in table.find_all("tr"):
        cols = tr.find_all("td")
        if len(cols) < 2:
            continue
        link = cols[1].find("a")
        href = link.get("href", "") if link else ""
        m = re.search(r"/events/(\d+)", href) or re.search(r"[?&]event=(\d+)", href)
        placement, name = _text(cols[0]), _text(cols[1])
        if placement and name:
            rows.append({
                "event_id": int(m.group(1)) if m else None,
                "evento_nome": name,
                "colocacao": placement,
            })
    return rows
