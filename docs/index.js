// O álbum: capa, uma figurinha por partida, capítulos por formação, trajetórias e prateleira de troféus.
const EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze'];
const MIN_CAPITULO = 50;          // partidas para uma formação ganhar página própria
const MIN_TRAJETORIA = 100;       // mapas para um jogador entrar nas trajetórias

carregaBase().then(() => {
  ligaDicas();
  const cron = B.partidas.slice().reverse();
  const formacaoDa = new Map();                    // partida -> formação do primeiro mapa
  B.mapas.forEach(m => { if (!formacaoDa.has(m.partida_id)) formacaoDa.set(m.partida_id, m.lineup_id); });
  const finais = new Map();                        // partida que fechou um troféu -> campeonato
  const ultimaDo = new Map(); cron.forEach(p => ultimaDo.set(p.evento, p));
  ultimaDo.forEach((p, ev) => { const c = B.colocacao.get(ev); if (c && c.pior_posicao === 1) finais.set(p.partida_id, ev); });

  const eras = B.lineups.map(l => {
    const mapas = B.mapas.filter(m => m.lineup_id === l.lineup_id), ids = new Set(mapas.map(m => m.partida_id));
    const partidas = cron.filter(p => formacaoDa.get(p.partida_id) === l.lineup_id);
    return {l, id: l.lineup_id, nomes: nomesDe(l), mapas, ids, partidas, sp: somaPartidas(partidas),
      trofeus: partidas.filter(p => finais.has(p.partida_id)).map(p => p.evento)};
  });
  const capitulos = eras.filter(e => e.partidas.length >= MIN_CAPITULO);

  capa(cron, eras[eras.length - 1], finais.size);
  fita(cron, formacaoDa, finais);
  $('caps').innerHTML = capitulos.map((e, i) => capitulo(e, capitulos[i - 1])).join('');
  outras(eras.filter(e => e.partidas.length < MIN_CAPITULO));
  acendeAoRolar(capitulos);
  trajetorias(eras[eras.length - 1].nomes);
  prateleira();
  $('f-bronze').textContent = `Já são ${fmt(B.partidas.length)}.`;
  $('atualizado').textContent = B.meta.atualizado_em ? 'Atualizado em ' + dataBR(B.meta.atualizado_em) : 'Última partida em ' + dataBR(B.max);
}).catch(e => { $('atualizado').textContent = 'Dados indisponíveis'; falhaDeCarga(e, $('capa-figs')); });

// ------------------------------------------------------------------ peças
const angulo = nome => [...nome].reduce((s, c) => s + c.charCodeAt(0), 0) * 37 % 180;
const torto = i => [-2, 1.5, -1, 2, -1.5, 2.5][i % 6];

function figurinha(j, numero, i) {
  return `<div class="fig" style="--r:${torto(i)}deg;--a:${angulo(j.jogador)}deg;--i:${i}"><div class="arte" data-l="${esc(j.jogador[0])}"><span class="num">${numero}</span>
    <span class="rt n">${fmt(j.rating, 2)}</span><span class="nick">${esc(j.jogador)}</span></div>
    <div class="pe"><span>${fmt(j.mapas)} mapas</span><span>${fmt(j.kd, 2)} K/D</span></div></div>`;
}

// Estatísticas dos jogadores `nomes` dentro dos mapas `ms`, na ordem dos nomes.
function jogadoresEm(nomes, ms) {
  const linhas = new Map(nomes.map(n => [n, []]));
  ms.forEach(m => m.jg.TOTAL.forEach(j => { if (linhas.has(j.jogador)) linhas.get(j.jogador).push(j); }));
  return nomes.map(n => Object.assign({jogador: n}, somaJog(linhas.get(n))));
}

function capa(cron, atual, trofeus) {
  const sp = somaPartidas(cron), anos = +B.max.slice(0, 4) - +B.min.slice(0, 4);
  $('titulo').textContent = `O álbum de ${EXTENSO[anos] || anos} anos da FURIA`;
  $('lide').textContent = `São ${fmt(sp.partidas)} partidas, ${fmt(sp.v)} vitórias, ${trofeus} troféus e ${B.lineups.length} formações, tiradas da HLTV e coladas aqui uma por uma.`;
  $('capa-t').textContent = `Página ${atual.id}, a formação de agora`;
  $('capa-s').textContent = `${fmt(atual.partidas.length)} partidas juntos. Nas figurinhas, o rating e os mapas de toda a passagem de cada um pela FURIA.`;
  const ultimo = cron.filter(p => { const c = B.colocacao.get(p.evento); return c && c.pior_posicao === 1; }).pop();
  $('capa-figs').innerHTML = jogadoresEm(atual.nomes, B.mapas).map((j, i) => figurinha(j, atual.id * 10 + i + 1, i)).join('') +
    `<div class="fig holo" style="--r:${torto(5)}deg;--i:5"><div class="arte" data-l="${trofeus}"><span class="num">brilhante</span><span class="rt n">${trofeus}</span><span class="nick">troféus</span></div>
     <div class="pe"><span>${ultimo ? 'O mais recente: ' + esc(ultimo.evento) : ''}</span></div></div>`;
}

function fita(cron, formacaoDa, finais) {
  let ano = '', html = '';
  cron.forEach(p => {
    const a = p.data.slice(0, 4); if (a !== ano) { ano = a; html += `<b>${a}</b>`; }
    const trofeu = finais.has(p.partida_id);
    html += `<i class="e${formacaoDa.get(p.partida_id) || 0}${trofeu ? ' t' : p.resultado === 'V' ? ' v' : ''}" data-tip="${esc(`${dataBR(p.data)}\nFURIA ${p.placar_furia} x ${p.placar_adversario} ${p.adversario}\n${p.evento}${trofeu ? '\nPartida do troféu' : ''}`)}"></i>`;
  });
  $('q').innerHTML = html;
  $('onde-n').textContent = `${fmt(cron.length)} partidas, de ${cron[0].data.slice(0, 4)} a ${cron[cron.length - 1].data.slice(0, 4)}`;
}

function capitulo(e, anterior) {
  const sm = somaMapas(e.mapas);
  const chegou = anterior ? e.nomes.filter(n => !anterior.nomes.includes(n)) : [], saiu = anterior ? anterior.nomes.filter(n => !e.nomes.includes(n)) : [];
  const troca = !anterior ? 'É a primeira formação a passar de cinquenta partidas.'
    : `${chegou.length > 1 ? 'Chegaram' : 'Chegou'} ${lista(chegou)} no lugar de ${lista(saiu)}.`;
  const porMapa = [...agrupa(e.mapas, m => m.mapa)].map(([mapa, ms]) => Object.assign({mapa}, somaMapas(ms))).filter(m => m.jogados >= 8).sort((a, b) => b.ap - a.ap);
  return `<article class="cap pag" id="pagina-${e.id}" data-era="${e.id}">
    <header><h3>${periodo(e.l.primeira_partida, e.l.ultima_partida)}</h3><span>Página ${e.id}</span></header>
    <p class="conto">${fmt(e.sp.partidas)} partidas e ${fmt(e.sp.v)} vitórias entre ${dataBR(e.l.primeira_partida)} e ${dataBR(e.l.ultima_partida)}, com ${fmt(sm.ap, 1)}% dos mapas vencidos. ${esc(troca)}</p>
    <div class="figs cinco">${jogadoresEm(e.nomes, e.mapas).map((j, i) => figurinha(j, e.id * 10 + i + 1, i)).join('')}</div>
    <div class="extra">
      <div><h4>Mapas desta formação</h4>${barras(porMapa.map(m => ({rot: m.mapa, extra: `${m.jogados} jogados`, txt: fmt(m.ap) + '%', val: m.ap})))}</div>
      <div><h4>${e.trofeus.length === 1 ? '1 troféu' : e.trofeus.length + ' troféus'}</h4>${e.trofeus.length
        ? `<ul class="trofeus">${e.trofeus.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>Esta página ficou sem figurinha brilhante.</p>'}</div>
    </div></article>`;
}

function outras(eras) {
  $('outras').innerHTML = `<h4 style="font-weight:800;font-size:18px">As outras ${eras.length} páginas</h4>
    <p class="sub">Formações de passagem, com menos de ${MIN_CAPITULO} partidas: substituições, testes e empréstimos.</p>
    <table><thead><tr><th>Jogadores</th><th>Quando</th><th class="d">Partidas</th><th class="d">Mapas vencidos</th></tr></thead><tbody>${eras.map(e =>
      `<tr><td>${esc(e.nomes.join(', '))}</td><td>${periodo(e.l.primeira_partida, e.l.ultima_partida)}</td><td class="d">${e.l.partidas}</td><td class="d">${fmt(e.l.aproveitamento_mapas, 1)}%</td></tr>`).join('')}</tbody></table>`;
}

// Enquanto um capítulo está no meio da tela, só as partidas daquela formação ficam acesas na fita.
function acendeAoRolar(capitulos) {
  const q = $('q'), porId = new Map(capitulos.map(e => [String(e.id), e]));
  let ativa = null;
  const acende = id => {
    if (id === ativa) return; ativa = id;
    q.querySelectorAll('i.on').forEach(i => i.classList.remove('on'));
    q.classList.toggle('foco', !!id);
    const e = id && porId.get(id);
    if (e) q.querySelectorAll('i.e' + id).forEach(i => i.classList.add('on'));
    $('onde').textContent = e ? `Página ${e.id}: ${e.nomes.join(', ')}` : 'Todas as formações';
    $('onde-n').textContent = e ? `${fmt(e.sp.partidas)} partidas, ${fmt(e.sp.v)} vitórias` : `${fmt(B.partidas.length)} partidas, de ${B.min.slice(0, 4)} a ${B.max.slice(0, 4)}`;
  };
  const visiveis = new Set();
  const obs = new IntersectionObserver(es => {
    es.forEach(x => x.isIntersecting ? visiveis.add(x.target.dataset.era) : visiveis.delete(x.target.dataset.era));
    acende([...visiveis].sort((a, b) => a - b)[0] || null);
  }, {rootMargin: '-45% 0px -45% 0px'});
  document.querySelectorAll('.cap').forEach(c => obs.observe(c));
}

// Um gráfico pequeno por jogador, todos na mesma escala de tempo e de rating.
function trajetorias(atuais) {
  const sem = d => d.slice(0, 4) + (+d.slice(5, 7) <= 6 ? 'a' : 'b');
  const eixo = []; for (let a = +B.min.slice(0, 4); a <= +B.max.slice(0, 4); a++) eixo.push(a + 'a', a + 'b');
  const linhas = []; B.mapas.forEach(m => m.jg.TOTAL.forEach(j => linhas.push(Object.assign({s: sem(m.data), data: m.data}, j))));
  const W = 260, H = 84, MIN = .75, MAX = 1.45, x = i => 4 + (W - 8) * i / (eixo.length - 1), y = r => H - 6 - (H - 12) * (Math.max(MIN, Math.min(MAX, r)) - MIN) / (MAX - MIN);
  const jogadores = [...agrupa(linhas, j => j.jogador)].filter(([, ls]) => ls.length >= MIN_TRAJETORIA).map(([nome, ls]) => {
    const porSem = agrupa(ls, j => j.s), pontos = eixo.map((s, i) => { const g = porSem.get(s); return g && g.length >= 5 ? [x(i), y(somaJog(g).rating), s, somaJog(g).rating, g.length] : null; });
    return {nome, pontos, total: somaJog(ls), de: ls[0].data, ate: ls[ls.length - 1].data};
  }).sort((a, b) => a.de.localeCompare(b.de));
  $('traj').innerHTML = jogadores.map(j => {
    let d = '', solto = true;
    j.pontos.forEach(p => { if (!p) { solto = true; return; } d += (solto ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); solto = false; });
    return `<div><h4>${esc(j.nome)}<span>${atuais.includes(j.nome) ? 'no elenco' : periodo(j.de, j.ate)}</span></h4>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rating de ${esc(j.nome)} por semestre">
        <line x1="0" x2="${W}" y1="${y(1)}" y2="${y(1)}" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/>
        <path d="${d}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
        ${j.pontos.filter(Boolean).map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6" fill="var(--am)" stroke="currentColor" stroke-width="2" data-tip="${p[2].slice(0, 4)}, ${p[2][4] === 'a' ? '1º' : '2º'} semestre\nRating ${fmt(p[3], 2)} em ${p[4]} mapas"/>`).join('')}
      </svg><p><span>${B.min.slice(0, 4)}</span><span class="n"><b>${fmt(j.total.rating, 2)}</b> em ${fmt(j.total.mapas)} mapas</span><span>${B.max.slice(0, 4)}</span></p></div>`;
  }).join('');
}

function prateleira() {
  const eventos = [...B.colocacao.values()].filter(e => e.partidas).sort((a, b) => (a.data_fim || '').localeCompare(b.data_fim || ''));
  $('estante').innerHTML = [...agrupa(eventos, e => e.ano)].sort((a, b) => a[0] - b[0]).map(([ano, es]) => {
    const t = es.filter(e => e.pior_posicao === 1).length;
    return `<div><b>${ano}</b><p>${es.map(e => `<i class="${e.pior_posicao === 1 ? 't' : e.colocacao == null ? 's' : e.melhor_posicao <= 4 ? 'p' : ''}" data-tip="${esc(`${e.evento}\n${e.colocacao ? 'Colocação: ' + e.colocacao : 'Sem colocação registrada'}\n${e.vitorias} vitórias e ${e.derrotas} derrotas`)}"></i>`).join('')}</p>
      <span>${t ? (t === 1 ? '1 troféu' : t + ' troféus') : es.length + ' campeonatos'}</span></div>`;
  }).join('');
}
