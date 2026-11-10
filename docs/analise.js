// Análise detalhada: as abas e as tabelas que respondem aos filtros.
const ABAS = [['resumo', 'Resumo'], ['mapas', 'Mapas'], ['jogadores', 'Jogadores'], ['vetos', 'Vetos'], ['adversarios', 'Adversários'], ['campeonatos', 'Campeonatos'], ['partidas', 'Partidas']];

let aba = (location.hash.slice(1) && ABAS.some(a => a[0] === location.hash.slice(1))) ? location.hash.slice(1) : 'resumo';
let lado = 'TOTAL', pagina = 0, graficos = [];
const ordem = {};                 // ordenação de cada tabela
const paginacao = {};             // total de linhas e tamanho da página de cada tabela

carregaBase().then(() => {
  $('filtros').innerHTML = htmlFiltros();
  montaFiltros(() => { pagina = 0; render(); });
  $('abas').innerHTML = ABAS.map(a => `<div class="aba" data-a="${a[0]}">${a[1]}</div>`).join('');
  $('abas').onclick = e => { if (e.target.dataset.a) { aba = e.target.dataset.a; pagina = 0; history.replaceState(null, '', '#' + aba); render(); } };
  render();
}).catch(e => falhaDeCarga(e, $('conteudo')));

function render() {
  graficos.forEach(g => g.dispose()); graficos = [];
  document.querySelectorAll('.aba').forEach(a => a.classList.toggle('on', a.dataset.a === aba));
  const R = recorte();
  $('conta').innerHTML = `<b>${fmt(R.partidas.length)}</b> partidas · <b>${fmt(R.mapas.length)}</b> mapas no recorte` + (R.nivelMapa ? ' <span class="nota">· séries contam partidas com ao menos um mapa no filtro</span>' : '');
  if (!R.partidas.length) { $('conteudo').innerHTML = '<div class="vazio">Nenhuma partida com esses filtros. Remova algum para ampliar o recorte.</div>'; return; }
  ({resumo, mapas: abaMapas, jogadores, vetos, adversarios, campeonatos, partidas: abaPartidas})[aba](R);
}

// ---------------------------------------------------------------- utilidades
const cor = v => v == null ? '' : `background:${v >= 50 ? `rgba(43,213,118,${Math.min(.3, (v - 50) / 100)})` : `rgba(255,71,87,${Math.min(.3, (50 - v) / 100)})`}`;
const corRating = v => v == null ? '' : `background:${v >= 1 ? `rgba(43,213,118,${Math.min(.32, (v - 1) * 1.1)})` : `rgba(255,71,87,${Math.min(.32, (1 - v) * 1.1)})`}`;
const selo = r => `<span class="r" style="background:${corResultado(r)}">${r}</span>`;

function tabela(id, cols, linhas, padrao, limite) {
  const o = ordem[id] || (ordem[id] = {k: padrao, d: -1});
  const c = cols.find(x => x.k === o.k) || cols[0];
  linhas = linhas.slice().sort((a, b) => {
    const x = a[o.k], y = b[o.k];
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * o.d;
  });
  const total = linhas.length;
  if (limite) linhas = linhas.slice(pagina * limite, pagina * limite + limite);
  const html = `<div class="tw"><table data-t="${id}"><thead><tr>${cols.map(x => `<th class="${x.e ? 'e ' : ''}${x.k === o.k ? 's' : ''}" data-k="${x.k}">${x.t}${x.k === o.k ? (o.d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>` +
    linhas.map(l => `<tr>${cols.map(x => `<td class="${x.e ? 'e' : ''}" style="${x.c ? x.c(l[x.k]) : ''}">${x.f ? x.f(l[x.k], l) : esc(l[x.k] ?? '–')}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>' +
    (limite && total > limite ? `<div class="pag" data-t="${id}"><span>${pagina * limite + 1}–${Math.min(total, (pagina + 1) * limite)} de ${fmt(total)}</span><button class="limpar" data-p="-1">Anterior</button><button class="limpar" data-p="1">Próxima</button></div>` : '');
  paginacao[id] = {total, limite};
  return html;
}

function grafico(id, opt) {
  const g = echarts.init($(id)); graficos.push(g);
  g.setOption(Object.assign({textStyle: {fontFamily: 'system-ui, sans-serif'}, animationDuration: 300}, opt));
  return g;
}
const eixo = {axisLine: {lineStyle: {color: LINE}}, axisTick: {show: false}, axisLabel: {color: MUT}, splitLine: {lineStyle: {color: '#1c1c22'}}};
const dica = {backgroundColor: '#000', borderColor: LINE, textStyle: {color: TXT, fontSize: 12}};
$('conteudo').onclick = e => {
  const th = e.target.closest('th[data-k]'), botao = e.target.closest('[data-p]');
  if (th) {
    const o = ordem[th.closest('table').dataset.t], k = th.dataset.k;
    o.d = o.k === k ? -o.d : -1; o.k = k; pagina = 0; render();
  } else if (botao) {
    const {total, limite} = paginacao[botao.parentElement.dataset.t], nova = pagina + +botao.dataset.p;
    if (nova >= 0 && nova * limite < total) { pagina = nova; render(); }
  }
};
addEventListener('resize', () => graficos.forEach(g => g.resize()));
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h !== aba && ABAS.some(a => a[0] === h) && B.partidas) { aba = h; pagina = 0; render(); } });

// --------------------------------------------------------------------- abas
function resumo(R) {
  const sp = somaPartidas(R.partidas), sm = somaMapas(R.mapas);
  const maior = maiorSequencia(R.partidas);
  const meses = [...agrupa(R.partidas, p => p.data.slice(0, 7))].sort((a, b) => a[0].localeCompare(b[0]));
  const mapasDoAno = agrupa(R.mapas, m => m.data.slice(0, 4));
  const porAno = [...agrupa(R.partidas, p => p.data.slice(0, 4))].map(([ano, ps]) => {
    const s = somaPartidas(ps), m = somaMapas(mapasDoAno.get(ano) || []);
    return {ano, partidas: s.partidas, v: s.v, d: s.d, ap: s.ap, mapas: m.jogados, apm: m.ap, saldo: m.saldo, ct: m.ct, tr: m.tr};
  });
  $('conteudo').innerHTML = `
    <div class="kpis">
      <div><div class="n">${fmt(sp.ap, 1)}<small>%</small></div><div class="l">Aproveitamento em séries</div></div>
      <div><div class="n">${fmt(sp.v)}<small>V</small> ${fmt(sp.d)}<small>D</small></div><div class="l">${fmt(sp.partidas)} partidas${sp.e ? ' · ' + sp.e + ' empates' : ''}</div></div>
      <div><div class="n">${fmt(sm.ap, 1)}<small>%</small></div><div class="l">Aproveitamento em mapas</div></div>
      <div><div class="n">${fmt(sm.v)}<small>V</small> ${fmt(sm.d)}<small>D</small></div><div class="l">${fmt(sm.jogados)} mapas disputados</div></div>
      <div><div class="n">${sm.saldo > 0 ? '+' : ''}${fmt(sm.saldo)}</div><div class="l">Saldo de rounds</div></div>
      <div><div class="n">${fmt(sm.ct, 1)}<small>%</small></div><div class="l">Rounds vencidos de CT</div></div>
      <div><div class="n">${fmt(sm.tr, 1)}<small>%</small></div><div class="l">Rounds vencidos de TR</div></div>
      <div><div class="n">${fmt(maior)}</div><div class="l">Maior sequência de vitórias</div></div>
    </div>
    <div class="card"><h3>Resultado por mês</h3><div class="ch" id="g-mes"></div></div>
    <div class="card"><h3>Ano a ano</h3>${tabela('ano', [
      {k: 'ano', t: 'Ano', e: 1}, {k: 'partidas', t: 'Partidas', f: fmt}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'},
      {k: 'ap', t: '% séries', f: v => fmt(v, 1), c: cor}, {k: 'mapas', t: 'Mapas', f: fmt}, {k: 'apm', t: '% mapas', f: v => fmt(v, 1), c: cor},
      {k: 'saldo', t: 'Saldo rounds', f: v => (v > 0 ? '+' : '') + fmt(v)}, {k: 'ct', t: '% CT', f: v => fmt(v, 1), c: cor}, {k: 'tr', t: '% TR', f: v => fmt(v, 1), c: cor}], porAno, 'ano')}</div>`;
  grafico('g-mes', {
    grid: {left: 40, right: 44, top: 28, bottom: 30}, tooltip: Object.assign({trigger: 'axis'}, dica), legend: {textStyle: {color: MUT}, top: 0, right: 0},
    xAxis: Object.assign({type: 'category', data: meses.map(m => m[0])}, eixo),
    yAxis: [Object.assign({type: 'value'}, eixo), Object.assign({type: 'value', min: 0, max: 100, axisLabel: {color: MUT, formatter: '{value}%'}}, {splitLine: {show: false}})],
    series: [
      {name: 'Vitórias', type: 'bar', stack: 'r', itemStyle: {color: ACC}, data: meses.map(m => m[1].filter(p => p.resultado === 'V').length)},
      {name: 'Derrotas', type: 'bar', stack: 'r', itemStyle: {color: LOSS}, data: meses.map(m => m[1].filter(p => p.resultado === 'D').length)},
      {name: 'Aproveitamento', type: 'line', yAxisIndex: 1, smooth: .3, symbol: 'none', lineStyle: {color: '#fff', width: 1.5}, itemStyle: {color: '#fff'},
        data: meses.map(m => +pct(m[1].filter(p => p.resultado === 'V').length, m[1].length).toFixed(1))}]});
}

function abaMapas(R) {
  const linhas = [...agrupa(R.mapas, m => m.mapa)].map(([mapa, ms]) => Object.assign({mapa}, somaMapas(ms)));
  const anos = [...new Set(R.mapas.map(m => m.data.slice(0, 4)))].sort();
  const nomes = linhas.slice().sort((a, b) => a.jogados - b.jogados).map(l => l.mapa);
  const ma = agrupa(R.mapas, m => m.mapa + '|' + m.data.slice(0, 4));
  $('conteudo').innerHTML = `
    <div class="card"><h3>Desempenho por mapa</h3>${tabela('mapas', [
      {k: 'mapa', t: 'Mapa', e: 1}, {k: 'jogados', t: 'Jogados', f: fmt}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'}, {k: 'ap', t: '% vitórias', f: v => fmt(v, 1), c: cor},
      {k: 'saldo', t: 'Saldo rounds', f: v => (v > 0 ? '+' : '') + fmt(v)}, {k: 'apr', t: '% rounds', f: v => fmt(v, 1), c: cor},
      {k: 'ct', t: '% CT', f: v => fmt(v, 1), c: cor}, {k: 'tr', t: '% TR', f: v => fmt(v, 1), c: cor},
      {k: 'pf', t: 'Pick FURIA'}, {k: 'apf', t: '% no pick', f: v => fmt(v, 1), c: cor}, {k: 'pa', t: 'Pick adv.'}, {k: 'apa', t: '% pick adv.', f: v => fmt(v, 1), c: cor}, {k: 'ot', t: 'Prorrog.'}], linhas, 'jogados')}
      <div class="nota">% CT e % TR são rounds vencidos sobre rounds disputados em cada lado.</div></div>
    <div class="g2"><div class="card"><h3>CT x TR por mapa</h3><div class="ch" id="g-lados"></div></div>
    <div class="card"><h3>Taxa de vitória por mapa e ano</h3><div class="ch" id="g-heat"></div></div></div>`;
  const ord = linhas.slice().sort((a, b) => b.jogados - a.jogados);
  grafico('g-lados', {
    grid: {left: 40, right: 10, top: 28, bottom: 30}, tooltip: Object.assign({trigger: 'axis', valueFormatter: v => fmt(v, 1) + '%'}, dica), legend: {textStyle: {color: MUT}, top: 0, right: 0},
    xAxis: Object.assign({type: 'category', data: ord.map(l => l.mapa)}, eixo, {axisLabel: {color: MUT, rotate: ord.length > 7 ? 30 : 0}}),
    yAxis: Object.assign({type: 'value', min: 30, max: 70}, eixo, {axisLabel: {color: MUT, formatter: '{value}%'}}),
    series: [{name: 'CT', type: 'bar', itemStyle: {color: COR_CT}, data: ord.map(l => l.ct)}, {name: 'TR', type: 'bar', itemStyle: {color: COR_TR}, data: ord.map(l => l.tr)}]});
  const dados = []; nomes.forEach((n, y) => anos.forEach((a, x) => { const ms = ma.get(n + '|' + a); if (ms) dados.push([x, y, +pct(ms.filter(m => m.resultado === 'V').length, ms.length).toFixed(0), ms.length]); }));
  grafico('g-heat', {
    grid: {left: 76, right: 10, top: 10, bottom: 30}, tooltip: Object.assign({formatter: p => `${esc(nomes[p.data[1]])} · ${anos[p.data[0]]}<br><b>${p.data[2]}%</b> em ${p.data[3]} mapas`}, dica),
    xAxis: Object.assign({type: 'category', data: anos}, eixo, {splitLine: {show: false}}), yAxis: Object.assign({type: 'category', data: nomes}, eixo, {splitLine: {show: false}}),
    visualMap: {min: 20, max: 80, dimension: 2, show: false, inRange: {color: ['#ff4757', '#2a1418', '#1e1e24', '#124a2c', '#2bd576']}},
    series: [{type: 'heatmap', data: dados, label: {show: true, color: '#fff', fontSize: 11, formatter: p => p.data[2]}, itemStyle: {borderColor: '#0a0a0c', borderWidth: 2}}]});
}

function jogadores(R) {
  const todas = []; R.mapas.forEach(m => m.jg[lado].forEach(j => todas.push(Object.assign({m}, j))));
  if (!todas.length) { $('conteudo').innerHTML = '<div class="vazio">Sem estatísticas individuais neste recorte.</div>'; return; }
  const linhas = [...agrupa(todas, j => j.jogador)].map(([jogador, ls]) => Object.assign({jogador, apm: pct(ls.filter(l => l.m.resultado === 'V').length, ls.length), melhor: Math.max(...ls.map(l => l.rating || 0))}, somaJog(ls)));
  const top = linhas.slice().sort((a, b) => b.mapas - a.mapas).slice(0, 6).map(l => l.jogador);
  const tri = d => d.slice(0, 4) + ' T' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
  const periodos = [...new Set(todas.map(j => tri(j.m.data)))].sort();
  const nomesMapa = [...agrupa(R.mapas, m => m.mapa)].sort((a, b) => b[1].length - a[1].length).map(x => x[0]);
  const jm = agrupa(todas, j => j.jogador + '|' + j.m.mapa);
  const nj = linhas.slice().sort((a, b) => a.mapas - b.mapas).filter(l => l.mapas >= Math.min(10, Math.max(...linhas.map(x => x.mapas)))).map(l => l.jogador);
  $('conteudo').innerHTML = `
    <div class="seg" id="seg">${['TOTAL', 'CT', 'TR'].map(l => `<span data-l="${l}" class="${l === lado ? 'on' : ''}">${l === 'TOTAL' ? 'Geral' : l}</span>`).join('')}</div>
    <div class="card"><h3>Desempenho individual${lado === 'TOTAL' ? '' : ' de ' + lado}</h3>${tabela('jog', [
      {k: 'jogador', t: 'Jogador', e: 1}, {k: 'mapas', t: 'Mapas', f: fmt}, {k: 'apm', t: '% vitórias', f: v => fmt(v, 1), c: cor},
      {k: 'rating', t: 'Rating', f: v => fmt(v, 2), c: corRating}, {k: 'kd', t: 'K/D', f: v => fmt(v, 2), c: corRating}, {k: 'adr', t: 'ADR', f: v => fmt(v, 1)}, {k: 'kast_pct', t: 'KAST', f: v => fmt(v, 1) + '%'},
      {k: 'kills', t: 'Kills', f: fmt}, {k: 'deaths', t: 'Mortes', f: fmt}, {k: 'saldo', t: 'Saldo', f: v => (v > 0 ? '+' : '') + fmt(v)}, {k: 'melhor', t: 'Melhor rating', f: v => fmt(v, 2)}], linhas, 'mapas')}
      <div class="nota">ADR, KAST e rating são médias ponderadas pelos rounds de cada mapa.</div></div>
    <div class="g2"><div class="card"><h3>Rating por trimestre (6 com mais mapas)</h3><div class="ch" id="g-evo"></div></div>
    <div class="card"><h3>Rating por jogador e mapa</h3><div class="ch" id="g-jm"></div></div></div>`;
  $('seg').onclick = async e => {
    const l = e.target.dataset.l; if (!l) return;
    if (l !== 'TOTAL') await carregaLados();
    lado = l; render();
  };
  const cores = [ACC, COR_CT, COR_TR, LOSS, '#c58bff', '#3ee6c1'];
  grafico('g-evo', {
    grid: {left: 40, right: 10, top: 34, bottom: 30}, tooltip: Object.assign({trigger: 'axis', valueFormatter: v => v == null ? '–' : fmt(v, 2)}, dica), legend: {textStyle: {color: MUT}, top: 0, type: 'scroll'},
    xAxis: Object.assign({type: 'category', data: periodos}, eixo), yAxis: Object.assign({type: 'value', scale: true}, eixo),
    series: top.map((n, i) => {
      const g = agrupa(todas.filter(j => j.jogador === n), j => tri(j.m.data));
      return {name: n, type: 'line', smooth: .3, symbolSize: 4, connectNulls: false, lineStyle: {width: 2}, color: cores[i],
        data: periodos.map(p => { const ls = g.get(p); return ls && ls.length >= 3 ? +somaJog(ls).rating.toFixed(2) : null; })};
    })});
  const dados = []; nj.forEach((n, y) => nomesMapa.forEach((mp, x) => { const ls = jm.get(n + '|' + mp); if (ls && ls.length >= 3) { const s = somaJog(ls); if (s.rating != null) dados.push([x, y, +s.rating.toFixed(2), ls.length]); } }));
  grafico('g-jm', {
    grid: {left: 84, right: 10, top: 10, bottom: 44}, tooltip: Object.assign({formatter: p => `${esc(nj[p.data[1]])} · ${esc(nomesMapa[p.data[0]])}<br><b>${fmt(p.data[2], 2)}</b> em ${p.data[3]} mapas`}, dica),
    xAxis: Object.assign({type: 'category', data: nomesMapa}, eixo, {splitLine: {show: false}, axisLabel: {color: MUT, rotate: 30}}), yAxis: Object.assign({type: 'category', data: nj}, eixo, {splitLine: {show: false}}),
    visualMap: {min: .8, max: 1.3, dimension: 2, show: false, inRange: {color: ['#ff4757', '#2a1418', '#1e1e24', '#124a2c', '#2bd576']}},
    series: [{type: 'heatmap', data: dados, label: {show: nj.length <= 12, color: '#fff', fontSize: 10, formatter: p => p.data[2].toFixed(2)}, itemStyle: {borderColor: '#0a0a0c', borderWidth: 2}}]});
}

function vetos(R) {
  const vs = B.vetos.filter(v => R.ids.has(v.partida_id));
  const series = new Set(vs.map(v => v.partida_id)).size;
  if (!series) { $('conteudo').innerHTML = '<div class="vazio">Sem vetos registrados neste recorte.</div>'; return; }
  const linhas = [...agrupa(vs, v => v.mapa)].map(([mapa, l]) => {
    const c = (a, ac) => l.filter(v => v.autor === a && v.acao === ac).length;
    const o = {mapa, bf: c('FURIA', 'BAN'), pf: c('FURIA', 'PICK'), ba: c('ADVERSARIO', 'BAN'), pa: c('ADVERSARIO', 'PICK')};
    return Object.assign(o, {pbf: pct(o.bf, series), ppf: pct(o.pf, series), pba: pct(o.ba, series), ppa: pct(o.pa, series)});
  });
  const ord = linhas.slice().sort((a, b) => (b.bf + b.pf + b.ba + b.pa) - (a.bf + a.pf + a.ba + a.pa));
  $('conteudo').innerHTML = `
    <div class="kpis"><div><div class="n">${fmt(series)}</div><div class="l">Séries com veto registrado</div></div>
      <div><div class="n">${esc(ord.slice().sort((a, b) => b.bf - a.bf)[0].mapa)}</div><div class="l">Mapa mais banido pela FURIA</div></div>
      <div><div class="n">${esc(ord.slice().sort((a, b) => b.pf - a.pf)[0].mapa)}</div><div class="l">Mapa mais escolhido pela FURIA</div></div>
      <div><div class="n">${esc(ord.slice().sort((a, b) => b.ba - a.ba)[0].mapa)}</div><div class="l">Mais banido pelos adversários</div></div></div>
    <div class="card"><h3>Bans e picks por mapa</h3><div class="ch" id="g-vetos"></div></div>
    <div class="card"><h3>Detalhe</h3>${tabela('vetos', [
      {k: 'mapa', t: 'Mapa', e: 1}, {k: 'bf', t: 'Bans FURIA'}, {k: 'pbf', t: '% séries', f: v => fmt(v, 1)}, {k: 'pf', t: 'Picks FURIA'}, {k: 'ppf', t: '% séries', f: v => fmt(v, 1)},
      {k: 'ba', t: 'Bans adv.'}, {k: 'pba', t: '% séries', f: v => fmt(v, 1)}, {k: 'pa', t: 'Picks adv.'}, {k: 'ppa', t: '% séries', f: v => fmt(v, 1)}], linhas, 'bf')}
      <div class="nota">Os vetos consideram a série inteira, mesmo quando há filtro de mapa. Partidas antigas sem veto registrado ficam de fora.</div></div>`;
  const s = (n, k, c) => ({name: n, type: 'bar', itemStyle: {color: c}, data: ord.map(l => l[k])});
  grafico('g-vetos', {
    grid: {left: 40, right: 10, top: 28, bottom: 30}, tooltip: Object.assign({trigger: 'axis'}, dica), legend: {textStyle: {color: MUT}, top: 0, right: 0},
    xAxis: Object.assign({type: 'category', data: ord.map(l => l.mapa)}, eixo), yAxis: Object.assign({type: 'value'}, eixo),
    series: [s('Ban FURIA', 'bf', LOSS), s('Pick FURIA', 'pf', ACC), s('Ban adversário', 'ba', '#7a2a33'), s('Pick adversário', 'pa', '#6f8320')]});
}

function adversarios(R) {
  const linhas = [...agrupa(R.partidas, p => p.adversario)].map(([adversario, ps]) => {
    const s = somaPartidas(ps);
    return {adversario, partidas: s.partidas, v: s.v, d: s.d, ap: s.ap, mv: s.mv, mp: s.mp, ultima: ps[0].data, ult: ps[0].resultado};
  });
  $('conteudo').innerHTML = `<div class="card"><h3>Histórico contra cada adversário (${fmt(linhas.length)})</h3>${tabela('adv', [
    {k: 'adversario', t: 'Adversário', e: 1}, {k: 'partidas', t: 'Partidas'}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'}, {k: 'ap', t: '% vitórias', f: v => fmt(v, 1), c: cor},
    {k: 'mv', t: 'Mapas V'}, {k: 'mp', t: 'Mapas D'}, {k: 'ultima', t: 'Última', f: dataBR}, {k: 'ult', t: 'Resultado', f: selo}], linhas, 'partidas', 25)}</div>`;
}

function campeonatos(R) {
  const linhas = [...agrupa(R.partidas, p => p.evento)].map(([evento, ps]) => {
    const s = somaPartidas(ps), c = B.colocacao.get(evento) || {};
    return {evento, fim: ps[0].data, partidas: s.partidas, v: s.v, d: s.d, ap: s.ap, colocacao: c.colocacao || null, pos: c.pior_posicao ?? null};
  });
  const tit = linhas.filter(l => l.pos === 1).length, top4 = linhas.filter(l => l.pos != null && l.pos <= 4).length;
  $('conteudo').innerHTML = `
    <div class="kpis"><div><div class="n">${fmt(linhas.length)}</div><div class="l">Campeonatos no recorte</div></div>
      <div><div class="n" style="color:var(--gold)">${fmt(tit)}</div><div class="l">Títulos</div></div><div><div class="n">${fmt(top4)}</div><div class="l">Top 4</div></div></div>
    <div class="card"><h3>Campanhas</h3>${tabela('camp', [
      {k: 'evento', t: 'Campeonato', e: 1}, {k: 'fim', t: 'Última partida', f: dataBR}, {k: 'colocacao', t: 'Colocação', f: (v, l) => v ? (l.pos === 1 ? `<b style="color:var(--gold)">${esc(v)}</b>` : esc(v)) : '–'},
      {k: 'partidas', t: 'Partidas'}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'}, {k: 'ap', t: '% vitórias', f: v => fmt(v, 1), c: cor}], linhas, 'fim', 25)}
      <div class="nota">A colocação é a final do campeonato; partidas, vitórias e derrotas seguem o recorte.</div></div>`;
}

function abaPartidas(R) {
  $('conteudo').innerHTML = `<div class="card"><h3>Partidas (${fmt(R.partidas.length)})</h3>${tabela('part', [
    {k: 'data', t: 'Data', e: 1, f: dataBR}, {k: 'resultado', t: '', f: selo}, {k: 'adversario', t: 'Adversário', e: 1},
    {k: 'placar_furia', t: 'Placar', f: (v, l) => `${v} × ${l.placar_adversario}`}, {k: 'mapas', t: 'Mapas', e: 1, f: v => esc(v || '–')},
    {k: 'evento', t: 'Campeonato', e: 1}, {k: 'formato', t: 'Formato'}, {k: 'online', t: 'Ambiente', f: v => v == null ? '–' : v ? 'Online' : 'LAN'},
    {k: 'url', t: 'HLTV', f: v => /^https:\/\/www\.hltv\.org\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">abrir ↗</a>` : '–'}], R.partidas, 'data', 50)}</div>`;
}
