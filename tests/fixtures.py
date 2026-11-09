"""HTML mínimo montado com a mesma estrutura e classes das páginas reais da HLTV."""


def _player_row(pid, nick, nome, kd, ekd, mid_cls, mid, adr, eadr, kast, ekast, rating):
    return (
        f'<tr><td class="players"><div class="flagAlign"><a href="/player/{pid}/{nick.lower()}" class="text-ellipsis">'
        f'<div class="gtSmartphone-only statsPlayerName text-ellipsis">{nome.split()[0]} \'<span class="player-nick">{nick}</span>\' {nome.split()[-1]}</div>'
        f'<div class="smartphone-only statsPlayerName text-ellipsis">{nick}</div></a></div></td>'
        f'<td class="kd text-center traditional-data">{kd}</td>'
        f'<td class="kd text-center eco-adjusted-data hidden">{ekd}</td>'
        f'<td class="{mid_cls} text-center">{mid}</td>'
        f'<td class="adr text-center traditional-data">{adr}</td>'
        f'<td class="adr text-center eco-adjusted-data hidden">{eadr}</td>'
        f'<td class="kast text-center traditional-data">{kast}</td>'
        f'<td class="kast text-center eco-adjusted-data hidden">{ekast}</td>'
        f'<td class="rating text-center ratingPositive">{rating}</td></tr>'
    )


def _table(side_cls, team, mid_cls, mid_label, rating_label, rows):
    hidden = "" if side_cls == "totalstats" else " hidden"
    return (
        f'<table class="table {side_cls}{hidden}"><tbody><tr class="header-row"><td class="players">{team}</td>'
        f'<td class="kd text-center traditional-data">K-D</td><td class="kd text-center eco-adjusted-data hidden">eK-eD</td>'
        f'<td class="{mid_cls} text-center">{mid_label}</td>'
        f'<td class="adr text-center traditional-data">ADR</td><td class="adr text-center eco-adjusted-data hidden">eADR</td>'
        f'<td class="kast text-center traditional-data">KAST</td><td class="kast text-center eco-adjusted-data hidden">eKAST</td>'
        f'<td class="rating text-center">{rating_label}</td></tr>{"".join(rows)}</tbody></table>'
    )


def _content(content_id, tables):
    return f'<div class="stats-content" id="{content_id}-content">{"".join(tables)}</div>'


def _mapholder(name, left, lscore, lcls, right, rscore, rcls, mapstats=None, half=""):
    if mapstats is None:
        return (
            f'<div class="mapholder"><div class="optional"><div class="map-name-holder"><div class="mapname">{name}</div></div></div>'
            f'<div class="results optional"><div class="results-left tie "><div class="results-teamname text-ellipsis">{left}</div>'
            f'<div class="results-team-score">-</div></div><div class="results-center"></div>'
            f'<span class="results-right tie "><div class="results-teamname text-ellipsis">{right}</div>'
            f'<div class="results-team-score">-</div></span></div></div>'
        )
    return (
        f'<div class="mapholder"><div class="played"><div class="map-name-holder"><div class="mapname">{name}</div></div></div>'
        f'<div class="results played"><div class="results-left {lcls} "><div class="results-teamname text-ellipsis">{left}</div>'
        f'<div class="results-team-score">{lscore}</div></div><div class="results-center"><div class="results-center-stats">'
        f'<a href="/stats/matches/mapstatsid/{mapstats}/x-vs-y" class="results-stats">STATS</a></div>'
        f'<div class="results-center-half-score">{half}</div></div>'
        f'<span class="results-right {rcls}"><div class="results-teamname text-ellipsis">{right}</div>'
        f'<div class="results-team-score">{rscore}</div></span></div></div>'
    )


def _half(a, b, c, d, first_left="t", ot=None):
    other = "ct" if first_left == "t" else "t"
    html = (
        f'<span> (</span><span class="{first_left}">{a}</span><span class="">:</span><span class="{other}">{b}</span>'
        f'<span>; </span><span class="{other}">{c}</span><span class="">:</span><span class="{first_left}">{d}</span><span></span><span>)</span>'
    )
    if ot:
        html += f'<span> (</span><span>{ot[0]}</span><span class="">:</span><span>{ot[1]}</span><span>)</span>'
    return html


def _page(match_id, slug, t1, t2, unix, event, vetos, info, maps, contents):
    def team(t, grad):
        return (
            f'<div class="team"><div class="{grad}-gradient"><a href="/team/{t["id"]}/{t["nome"].lower()}">'
            f'<div class="teamName">{t["nome"]}</div></a><div class="{t["res"]}">{t["score"]}</div></div></div>'
        )

    veto_lines = "".join(f"<div>{v}</div>" for v in vetos)
    return (
        f'<html><head><title>{t1["nome"]} vs. {t2["nome"]} | HLTV.org</title>'
        f'<link rel="canonical" href="https://www.hltv.org/matches/{match_id}/{slug}"></head><body>'
        f'<div class="standard-box teamsBox">{team(t1, "team1")}'
        f'<div class="timeAndEvent"><div class="time" data-unix="{unix}">06:00</div><div class="date" data-unix="{unix}">x</div>'
        f'<div class="event text-ellipsis"><a href="/events/{event[0]}/{event[1]}" title="{event[2]}">{event[2]}</a></div>'
        f'<div class="countdown">Match over</div></div>{team(t2, "team2")}</div>'
        f'<div class="standard-box veto-box real-veto-only"><div class="padding">{veto_lines}</div></div>'
        f'<div class="standard-box veto-box"><div class="padding preformatted-text">{info}</div></div>'
        f'{"".join(maps)}{"".join(contents)}</body></html>'
    )


def match_new_layout() -> str:
    """Nouns 0 x 2 FURIA (2023): layout atual, com Swing e Rating 3.0; FURIA é o time 2."""
    new = ("roundSwing", "Swing", "Rating 3.0")

    def nouns(kd, ekd, swing, adr, eadr, kast, ekast, rt):
        return _player_row(17918, "nosraC", "Carson O'Reilly", kd, ekd, "roundSwing", swing, adr, eadr, kast, ekast, rt)

    def furia(kd, ekd, swing, adr, eadr, kast, ekast, rt):
        return _player_row(15631, "KSCERATO", "Kaike Cerato", kd, ekd, "roundSwing", swing, adr, eadr, kast, ekast, rt)

    def content(cid, n, f, n_ct, f_ct, n_t, f_t):
        return _content(cid, [
            _table("totalstats", "Nouns", *new, [nouns(*n)]),
            _table("ctstats", "Nouns", *new, [nouns(*n_ct)]),
            _table("tstats", "Nouns", *new, [nouns(*n_t)]),
            _table("totalstats", "FURIA", *new, [furia(*f)]),
            _table("ctstats", "FURIA", *new, [furia(*f_ct)]),
            _table("tstats", "FURIA", *new, [furia(*f_t)]),
        ])

    n1 = ("14-16", "16-16", "+0.80%", "78.1", "83.8", "61.1%", "71.4%", "1.22")
    f1 = ("17-7", "17-9", "+6.52%", "109.3", "105.5", "77.8%", "71.7%", "1.71")
    side = ("8-8", "8-8", "+0.40%", "80.0", "80.0", "60.0%", "60.0%", "1.10")
    return _page(
        2367598, "nouns-vs-furia-thunderpick-world-championship-2023",
        {"id": 11948, "nome": "Nouns", "res": "lost", "score": 0},
        {"id": 8297, "nome": "FURIA", "res": "won", "score": 2},
        1698742800000, (7289, "thunderpick-world-championship-2023", "Thunderpick World Championship 2023"),
        ["1. FURIA removed Anubis", "2. Nouns removed Overpass", "3. FURIA picked Vertigo", "4. Nouns picked Mirage",
         "5. FURIA removed Inferno", "6. Nouns removed Ancient", "7. Nuke was left over"],
        "Best of 3 (Online)\n\n* Group D elimination Match",
        [
            _mapholder("Vertigo", "Nouns", 5, "lost", "FURIA", 13, "won pick", 165657, _half(2, 10, 3, 3, "t")),
            _mapholder("Mirage", "Nouns", 7, "lost pick", "FURIA", 13, "won", 165660, _half(2, 10, 5, 3, "t")),
            _mapholder("Nuke", "Nouns", "-", "tie", "FURIA", "-", "tie"),
        ],
        [
            _content("all", [_table("totalstats", "Nouns", *new, [nouns("28-30", "30-31", "+2.04%", "78.0", "80.2", "55.3%", "59.4%", "1.20")])]),
            content(165657, n1, f1, side, side, side, side),
            content(165660, ("14-14", "14-15", "+3.17%", "77.9", "76.9", "50.0%", "48.6%", "1.19"),
                    ("15-9", "16-8", "+2.90%", "73.3", "73.1", "70.0%", "70.0%", "1.27"), side, side, side, side),
        ],
    )


def match_old_layout() -> str:
    """Lazarus 2 x 1 FURIA (2019): layout antigo (+/-, Rating 2.0, sem dados eco) e prorrogação."""
    old = ("plus-minus", "+/-", "Rating\n2.0")

    def laz(kd, pm, adr, kast, rt):
        return _player_row(8523, "Subroza", "Yassine Taoufik", kd, "null-null", "plus-minus", pm, adr, "0.0", kast, "0.0%", rt)

    def fur(kd, pm, adr, kast, rt):
        return _player_row(8564, "arT", "Andrei Piovezan", kd, "null-null", "plus-minus", pm, adr, "0.0", kast, "0.0%", rt)

    def content(cid, l, f):
        return _content(cid, [_table("totalstats", "Lazarus", *old, [laz(*l)]), _table("totalstats", "FURIA", *old, [fur(*f)])])

    return _page(
        2333124, "lazarus-vs-furia-esl-one-cologne-2019-north-america-closed-qualifier",
        {"id": 9945, "nome": "Lazarus", "res": "won", "score": 2},
        {"id": 8297, "nome": "FURIA", "res": "lost", "score": 1},
        1557432000000, (4586, "esl-one-cologne-2019-na-closed-qualifier", "ESL One Cologne 2019 North America Closed Qualifier"),
        ["1. FURIA removed Dust2", "2. Lazarus removed Nuke", "3. FURIA picked Overpass", "4. Lazarus picked Mirage",
         "5. FURIA removed Train", "6. Lazarus removed Cache", "7. Inferno was left over"],
        "Best of 3\n\n* Upper bracket quarter-final",
        [
            _mapholder("Overpass", "Lazarus", 10, "lost", "FURIA", 16, "won pick", 85615, _half(7, 8, 3, 8, "ct")),
            _mapholder("Mirage", "Lazarus", 19, "won pick", "FURIA", 15, "lost", 85627, _half(10, 5, 5, 10, "t", ot=(4, 0))),
            _mapholder("Inferno", "Lazarus", 16, "won", "FURIA", 9, "lost", 85630, _half(9, 6, 7, 3, "ct")),
        ],
        [
            content(85615, ("18-20", "-2", "70.1", "65.4%", "0.95"), ("25-15", "+10", "95.2", "76.9%", "1.45")),
            content(85627, ("28-18", "+10", "90.0", "79.4%", "1.38"), ("22-24", "-2", "80.3", "67.6%", "1.02")),
            content(85630, ("20-15", "+5", "88.0", "80.0%", "1.30"), ("12-19", "-7", "60.5", "56.0%", "0.71")),
        ],
    )


def results_page() -> str:
    def con(mid, slug, unix, t1, s1, c1, t2, s2, c2, event, fmt, stars):
        return (
            f'<div class="result-con" data-zonedgrouping-entry-unix="{unix}"><a href="/matches/{mid}/{slug}" class="a-reset">'
            f'<div class="result"><table><tbody><tr><td class="team-cell"><div class="line-align team1"><div class="team ">{t1}</div></div></td>'
            f'<td class="result-score"><span class="score-{c1}">{s1}</span> - <span class="score-{c2}">{s2}</span></td>'
            f'<td class="team-cell"><div class="line-align team2"><div class="team team-won">{t2}</div></div></td>'
            f'<td class="event"><span class="event-name">{event}</span></td><td class="star-cell"><div class="map-and-stars">'
            f'<div class="stars">{"<i class=\'fa fa-star star\'></i>" * stars}</div><div class="map map-text">{fmt}</div></div></td>'
            f'</tr></tbody></table></div></a></div>'
        )

    rows = "".join([
        con(2367598, "nouns-vs-furia-thunderpick-world-championship-2023", 1698742800000,
            "Nouns", 0, "lost", "FURIA", 2, "won", "Thunderpick World Championship 2023", "bo3", 1),
        con(2333124, "lazarus-vs-furia-esl-one-cologne-2019-north-america-closed-qualifier", 1557432000000,
            "Lazarus", 2, "won", "FURIA", 1, "lost", "ESL One Cologne 2019 North America Closed Qualifier", "bo3", 0),
    ])
    return (
        '<html><head><title>Counter-Strike Results | HLTV.org</title></head><body>'
        '<span class="pagination-data">1 - 2 of 2</span>'
        f'<div class="results-holder allres"><div class="results-all">{rows}</div></div></body></html>'
    )


def events_page() -> str:
    return (
        '<html><body><table class="stats-table"><thead><tr><th>Placement</th><th>Event</th></tr></thead><tbody>'
        '<tr><td>5-8th</td><td><a href="/stats/teams/8297/furia?event=7289">Thunderpick World Championship 2023</a></td></tr>'
        '<tr><td>1st</td><td><a href="/stats/teams/8297/furia?event=9999">Outro Campeonato 2020</a></td></tr>'
        '</tbody></table></body></html>'
    )


def challenge_page() -> str:
    return "<html><head><title>Just a moment...</title></head><body>Verify you are human</body></html>"
