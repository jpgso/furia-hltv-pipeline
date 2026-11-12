// Análise completa: as abas e as tabelas que respondem aos filtros.
const ABAS = [['resumo', 'Resumo'], ['mapas', 'Mapas'], ['jogadores', 'Jogadores'], ['vetos', 'Vetos'], ['adversarios', 'Adversários'],
  ['grandes', 'Jogos grandes'], ['placares', 'Placares'], ['campeonatos', 'Campeonatos'], ['partidas', 'Partidas']];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

let aba = ABAS.some(a => a[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'resumo';
let lado = 'TOTAL', pagina = 0;
const ordem = {};                 // ordenação de cada tabela
const paginacao = {};             // total de linhas e tamanho da página de cada tabela

carregaBase().then(() => {
  ligaDicas();
  $('filtros').innerHTML = htmlFiltros();
  montaFiltros(() => { pagina = 0; render(); });
  $('abas').innerHTML = ABAS.map(a => `<button type="button" role="tab" class="aba" data-a="${a[0]}">${a[1]}</button>`).join('');
  $('abas').onclick = e => { if (e.target.dataset.a) { aba = e.target.dataset.a; pagina = 0; history.replaceState(null, '', '#' + aba); render(); } };
  $('atualizado').textContent = B.meta.atualizado_em ? 'Atualizado em ' + dataBR(B.meta.atualizado_em) : '';
  render();
}).catch(e => falhaDeCarga(e, $('conteudo')));

function render() {
  document.querySelectorAll('.aba').forEach(a => { a.classList.toggle('on', a.dataset.a === aba); a.setAttribute('aria-selected', a.dataset.a === aba); });
  const R = recorte(), ativos = filtrosAtivos();
  $('h-n').textContent = fmt(R.mapas.length);
  $('h-s').textContent = `${R.mapas.length === 1 ? 'Jogado' : 'Jogados'} em ${fmt(R.partidas.length)} ${R.partidas.length === 1 ? 'partida' : 'partidas'}` +
    (ativos.length ? `, no recorte: ${ativos.join(', ')}.` : ' desde 2017. Use os filtros para recortar; todas as abas respondem a eles.');
  $('conta').innerHTML = `<b>${fmt(R.partidas.length)}</b> partidas e <b>${fmt(R.mapas.length)}</b> mapas no recorte` + (R.nivelMapa ? ' <span class="nota">(as partidas contam quando têm ao menos um mapa no filtro)</span>' : '');
  if (!R.partidas.length) { $('conteudo').innerHTML = '<div class="vazio">Nenhuma partida com esses filtros. Remova algum para ampliar o recorte.</div>'; return; }
  ({resumo, mapas: abaMapas, jogadores, vetos, adversarios, grandes, placares, campeonatos, partidas: abaPartidas})[aba](R);
}

// ---------------------------------------------------------------- utilidades
// Marca-texto amarelo para o que passa de 50%, cinza para o que fica abaixo.
const tinta = v => v == null ? '' : `background:${v >= 50 ? `rgba(246,201,21,${Math.min(.95, .1 + (v - 50) / 32).toFixed(2)})` : `rgba(20,18,16,${Math.min(.3, (50 - v) / 110).toFixed(2)})`}`;
const tintaRating = v => v == null ? '' : `background:${v >= 1 ? `rgba(246,201,21,${Math.min(.95, .1 + (v - 1) * 2.6).toFixed(2)})` : `rgba(20,18,16,${Math.min(.3, (1 - v) * .9).toFixed(2)})`}`;
const selo = r => `<span class="r${r === 'V' ? ' v' : ''}">${esc(r)}</span>`;
const sinal = v => (v > 0 ? '+' : '') + fmt(v);
const p1 = v => fmt(v, 1);
const cifras = itens => `<div class="cifras">${itens.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>`;
// Coluna com uma barra antes do número, proporcional ao maior valor da coluna.
const comBarra = (linhas, k) => { const max = Math.max(1, ...linhas.map(l => l[k] || 0)); return v => `<i class="bi" style="width:${Math.round(54 * (v || 0) / max)}px"></i>${fmt(v)}`; };

function tabela(id, cols, linhas, padrao, limite) {
  const o = ordem[id] || (ordem[id] = {k: padrao, d: -1});
  linhas = linhas.slice().sort((a, b) => {
    const x = a[o.k], y = b[o.k];
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * o.d;
  });
  const total = linhas.length;
  if (limite) linhas = linhas.slice(pagina * limite, pagina * limite + limite);
  paginacao[id] = {total, limite};
  return `<div class="tw"><table data-t="${id}"><thead><tr>${cols.map(x => `<th class="${x.e ? 'e' : ''}" data-k="${x.k}"${x.k === o.k ? ` aria-sort="${o.d < 0 ? 'descending' : 'ascending'}"` : ''}>${x.t}${x.k === o.k ? (o.d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>` +
    linhas.map(l => `<tr>${cols.map(x => `<td class="${x.e ? 'e' : ''}${x.q ? ' q' : ''}" style="${x.c ? x.c(l[x.k]) : ''}">${x.f ? x.f(l[x.k], l) : esc(l[x.k] ?? '–')}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>' +
    (limite && total > limite ? `<div class="pag" data-t="${id}"><span>${pagina * limite + 1} a ${Math.min(total, (pagina + 1) * limite)} de ${fmt(total)}</span><button class="limpar" data-p="-1">Anterior</button><button class="limpar" data-p="1">Próxima</button></div>` : '');
}

// Grade de calor: `celula(linha, coluna)` devolve {v, txt, tip} ou nada.
function calor(linhas, colunas, celula, cor) {
  return `<div class="heat" style="--n:${colunas.length}"><span></span>${colunas.map(c => `<span>${esc(c)}</span>`).join('')}${linhas.map(l =>
    `<b>${esc(l)}</b>` + colunas.map(c => { const x = celula(l, c); return x ? `<div style="${cor(x.v)}" data-tip="${esc(x.tip)}">${esc(x.txt)}</div>` : '<div></div>'; }).join('')).join('')}</div>`;
}

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
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h !== aba && ABAS.some(a => a[0] === h) && B.partidas) { aba = h; pagina = 0; render(); } });

// --------------------------------------------------------------------- abas
function resumo(R) {
  const sp = somaPartidas(R.partidas), sm = somaMapas(R.mapas);
  const mapasDoAno = agrupa(R.mapas, m => m.data.slice(0, 4));
  const porAno = [...agrupa(R.partidas, p => p.data.slice(0, 4))].map(([ano, ps]) => {
    const s = somaPartidas(ps), m = somaMapas(mapasDoAno.get(ano) || []);
    return {ano, partidas: s.partidas, v: s.v, d: s.d, ap: s.ap, mapas: m.jogados, apm: m.ap, saldo: m.saldo, ct: m.ct, tr: m.tr};
  });
  let ano = '', campo = '';
  R.mapas.forEach(m => {
    const a = m.data.slice(0, 4); if (a !== ano) { ano = a; campo += `<b>${a}</b>`; }
    campo += `<i class="${m.resultado === 'V' ? '' : 'd'}" style="--c:var(--${m.lado_inicial_furia === 'TR' ? 'tr' : 'ct'})" data-tip="${esc(`${dataBR(m.data)}\n${m.mapa}: FURIA ${m.rounds_furia} x ${m.rounds_adversario} ${m.p.adversario}\nComeçou de ${m.lado_inicial_furia}`)}"></i>`;
  });
  const porMes = agrupa(R.partidas, p => p.data.slice(0, 7)), maxMes = Math.max(...[...porMes.values()].map(x => x.length));
  const anos = [...new Set(R.partidas.map(p => p.data.slice(0, 4)))].sort();
  const cal = `<div class="cal"><span></span>${MESES.map(m => `<span>${m}</span>`).join('')}${anos.map(a => `<b>${a}</b>` + MESES.map((nome, i) => {
    const ps = porMes.get(a + '-' + String(i + 1).padStart(2, '0')); if (!ps) return '<div></div>';
    const s = somaPartidas(ps);
    return `<div data-tip="${nome} de ${a}\n${s.partidas} partidas, ${s.v} vitórias"><i class="${s.ap >= 50 ? '' : 'd'}" style="--t:${Math.round(22 + 70 * Math.sqrt(s.partidas / maxMes))}%"></i></div>`;
  }).join('')).join('')}</div>`;
  $('conteudo').innerHTML = cifras([
      [p1(sp.ap) + '%', 'das partidas vencidas'], [`${fmt(sp.v)} a ${fmt(sp.d)}`, `vitórias e derrotas${sp.e ? ', mais ' + sp.e + ' empates' : ''}`],
      [p1(sm.ap) + '%', 'dos mapas vencidos'], [sinal(sm.saldo), 'saldo de rounds'], [p1(sm.ct) + '%', 'dos rounds de CT'], [p1(sm.tr) + '%', 'dos rounds de TR'],
      [fmt(maiorSequencia(R.partidas)), 'vitórias seguidas, no máximo']]) + `
    <h2>Todos os mapas do recorte, na ordem em que foram jogados</h2>
    <div class="leg"><span><i style="background:var(--ct);border-color:var(--ct)"></i>começou de CT</span><span><i style="background:var(--tr);border-color:var(--tr)"></i>começou de TR</span><span><i></i>vazado é mapa perdido</span></div>
    <div class="campo">${campo}</div>
    <h2>Calendário</h2><p class="nota">O tamanho do quadrado é o número de partidas no mês. Cheio quando a FURIA venceu pelo menos metade delas.</p>${cal}
    <h2>Ano a ano</h2>${tabela('ano', [
      {k: 'ano', t: 'Ano', e: 1}, {k: 'partidas', t: 'Partidas', f: fmt}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'},
      {k: 'ap', t: '% partidas', f: p1, c: tinta}, {k: 'mapas', t: 'Mapas', f: fmt}, {k: 'apm', t: '% mapas', f: p1, c: tinta},
      {k: 'saldo', t: 'Saldo de rounds', f: sinal}, {k: 'ct', t: '% CT', f: p1, c: tinta}, {k: 'tr', t: '% TR', f: p1, c: tinta}], porAno, 'ano')}`;
}

function abaMapas(R) {
  const linhas = [...agrupa(R.mapas, m => m.mapa)].map(([mapa, ms]) => {
    const ct = ms.filter(m => m.lado_inicial_furia === 'CT'), tr = ms.filter(m => m.lado_inicial_furia === 'TR'), v = l => l.filter(m => m.resultado === 'V').length;
    return Object.assign({mapa, ict: pct(v(ct), ct.length), itr: pct(v(tr), tr.length)}, somaMapas(ms));
  });
  const ord = linhas.slice().sort((a, b) => b.jogados - a.jogados), anos = [...new Set(R.mapas.map(m => m.data.slice(0, 4)))].sort();
  const ma = agrupa(R.mapas, m => m.mapa + '|' + m.data.slice(0, 4));
  const x = v => Math.max(0, Math.min(100, (v - 30) * 2.5));   // régua de 30% a 70%
  const ini = l => { const ms = R.mapas.filter(m => m.lado_inicial_furia === l); return [p1(pct(ms.filter(m => m.resultado === 'V').length, ms.length)) + '%', `dos mapas vencidos começando de ${l} (${fmt(ms.length)})`]; };
  $('conteudo').innerHTML = `
    <h2>Desempenho por mapa</h2>${tabela('mapas', [
      {k: 'mapa', t: 'Mapa', e: 1}, {k: 'jogados', t: 'Jogados', f: comBarra(linhas, 'jogados')}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'}, {k: 'ap', t: '% vitórias', f: p1, c: tinta},
      {k: 'saldo', t: 'Saldo de rounds', f: sinal}, {k: 'apr', t: '% rounds', f: p1, c: tinta}, {k: 'ct', t: '% CT', f: p1, c: tinta}, {k: 'tr', t: '% TR', f: p1, c: tinta},
      {k: 'ict', t: '% começando CT', f: p1, c: tinta}, {k: 'itr', t: '% começando TR', f: p1, c: tinta}, {k: 'ot', t: 'Prorrogações'}], linhas, 'jogados')}
    <p class="nota">% CT e % TR são rounds vencidos sobre rounds disputados em cada lado. As duas últimas porcentagens são mapas vencidos conforme o lado em que a FURIA começou.</p>
    <div class="g2"><div><h2>CT contra TR</h2><p class="nota">Rounds vencidos em cada lado, numa régua de 30% a 70%. O traço do meio é 50%.</p>
      <div class="regua">${ord.map(l => `<div><span>${esc(l.mapa)}</span><div class="tr"><u style="--a:${Math.min(x(l.ct), x(l.tr))}%;--w:${Math.abs(x(l.ct) - x(l.tr))}%"></u><i style="--x:${x(l.ct)}%;background:var(--ct)"></i><i style="--x:${x(l.tr)}%;background:var(--tr)"></i></div><small><b style="color:var(--ct)">${fmt(l.ct)}%</b> e <b style="color:var(--tr)">${fmt(l.tr)}%</b></small></div>`).join('')}</div>
      <div class="leg"><span><i style="background:var(--ct);border-color:var(--ct);border-radius:50%"></i>CT</span><span><i style="background:var(--tr);border-color:var(--tr);border-radius:50%"></i>TR</span></div></div>
    <div><h2>O lado em que começa</h2>${cifras([ini('CT'), ini('TR')])}
      <h2>Taxa de vitória por mapa e ano</h2>${calor(ord.map(l => l.mapa), anos, (mp, a) => { const ms = ma.get(mp + '|' + a); if (!ms) return null; const v = pct(ms.filter(m => m.resultado === 'V').length, ms.length); return {v, txt: fmt(v), tip: `${mp} em ${a}\n${fmt(v)}% em ${ms.length} mapas`}; }, tinta)}</div></div>`;
}

function jogadores(R) {
  const todas = []; R.mapas.forEach(m => m.jg[lado].forEach(j => todas.push(Object.assign({m}, j))));
  if (!todas.length) { $('conteudo').innerHTML = '<div class="vazio">Sem estatísticas individuais neste recorte.</div>'; return; }
  const linhas = [...agrupa(todas, j => j.jogador)].map(([jogador, ls]) => Object.assign({jogador, apm: pct(ls.filter(l => l.m.resultado === 'V').length, ls.length), melhor: Math.max(...ls.map(l => l.rating || 0))}, somaJog(ls)));
  const nomesMapa = [...agrupa(R.mapas, m => m.mapa)].sort((a, b) => b[1].length - a[1].length).map(x => x[0]);
  const jm = agrupa(todas, j => j.jogador + '|' + j.m.mapa);
  const corte = Math.min(10, Math.max(...linhas.map(x => x.mapas)));
  const nj = linhas.slice().sort((a, b) => b.mapas - a.mapas).filter(l => l.mapas >= corte).map(l => l.jogador);
  $('conteudo').innerHTML = `
    <div class="seg" id="seg">${['TOTAL', 'CT', 'TR'].map(l => `<button type="button" data-l="${l}" class="${l === lado ? 'on' : ''}">${l === 'TOTAL' ? 'Geral' : 'Só de ' + l}</button>`).join('')}</div>
    <h2>Desempenho individual${lado === 'TOTAL' ? '' : ' de ' + lado}</h2>${tabela('jog', [
      {k: 'jogador', t: 'Jogador', e: 1}, {k: 'mapas', t: 'Mapas', f: comBarra(linhas, 'mapas')}, {k: 'apm', t: '% vitórias', f: p1, c: tinta},
      {k: 'rating', t: 'Rating', f: v => fmt(v, 2), c: tintaRating}, {k: 'kd', t: 'K/D', f: v => fmt(v, 2), c: tintaRating}, {k: 'adr', t: 'ADR', f: p1}, {k: 'kast_pct', t: 'KAST', f: v => p1(v) + '%'},
      {k: 'kills', t: 'Abates', f: fmt}, {k: 'deaths', t: 'Mortes', f: fmt}, {k: 'saldo', t: 'Saldo', f: sinal}, {k: 'melhor', t: 'Melhor rating', f: v => fmt(v, 2)}], linhas, 'mapas')}
    <p class="nota">ADR, KAST e rating são médias ponderadas pelos rounds de cada mapa.</p>
    <h2>Rating por jogador e mapa</h2><p class="nota">Só combinações com pelo menos três mapas jogados.</p>
    ${calor(nj, nomesMapa, (n, mp) => { const ls = jm.get(n + '|' + mp); if (!ls || ls.length < 3) return null; const s = somaJog(ls); return s.rating == null ? null : {v: s.rating, txt: fmt(s.rating, 2), tip: `${n} em ${mp}\nRating ${fmt(s.rating, 2)} em ${ls.length} mapas`}; }, tintaRating)}`;
  $('seg').onclick = async e => {
    const l = e.target.dataset.l; if (!l) return;
    if (l !== 'TOTAL') await carregaLados();
    lado = l; render();
  };
}

function vetos(R) {
  const vs = B.vetos.filter(v => R.ids.has(v.partida_id));
  const series = new Set(vs.map(v => v.partida_id)).size;
  if (!series) { $('conteudo').innerHTML = '<div class="vazio">Sem vetos registrados neste recorte.</div>'; return; }
  const linhas = [...agrupa(vs, v => v.mapa)].map(([mapa, l]) => {
    const c = (a, ac) => l.filter(v => v.autor === a && v.acao === ac).length;
    return {mapa, bf: c('FURIA', 'BAN'), pf: c('FURIA', 'PICK'), ba: c('ADVERSARIO', 'BAN'), pa: c('ADVERSARIO', 'PICK')};
  });
  const maior = k => esc(linhas.slice().sort((a, b) => b[k] - a[k])[0].mapa);
  const por = e => { const ms = R.mapas.filter(m => m.escolha === e); return ms.length ? p1(pct(ms.filter(m => m.resultado === 'V').length, ms.length)) + '%' : '–'; };
  $('conteudo').innerHTML = cifras([[fmt(series), 'séries com veto registrado'], [maior('bf'), 'é o mapa que a FURIA mais bane'], [maior('pf'), 'é o que a FURIA mais escolhe'], [maior('ba'), 'é o que os adversários mais banem']]) + `
    <h2>Quem escolheu o mapa pesa no resultado</h2>${cifras([[por('FURIA'), 'de vitórias no mapa escolhido pela FURIA'], [por('ADVERSARIO'), 'no mapa escolhido pelo adversário'], [por('DECISIVO'), 'no mapa que sobrou, o decisivo']])}
    <h2>Bans e escolhas por mapa</h2>${tabela('vetos', [
      {k: 'mapa', t: 'Mapa', e: 1}, {k: 'bf', t: 'Banido pela FURIA', f: comBarra(linhas, 'bf')}, {k: 'pf', t: 'Escolhido pela FURIA', f: comBarra(linhas, 'pf')},
      {k: 'ba', t: 'Banido pelo adversário', f: comBarra(linhas, 'ba')}, {k: 'pa', t: 'Escolhido pelo adversário', f: comBarra(linhas, 'pa')}], linhas, 'bf')}
    <p class="nota">Os vetos consideram a série inteira, mesmo quando há filtro de mapa. Partidas antigas sem veto registrado ficam de fora.</p>`;
}

function adversarios(R) {
  const linhas = [...agrupa(R.partidas, p => p.adversario)].map(([adversario, ps]) => {
    const s = somaPartidas(ps);
    return {adversario, partidas: s.partidas, v: s.v, d: s.d, ap: s.ap, mv: s.mv, mp: s.mp, sm: s.mv - s.mp, ultima: ps[0].data, ult: ps[0].resultado};
  });
  const min = Math.min(5, Math.max(...linhas.map(l => l.partidas))), fortes = linhas.filter(l => l.partidas >= min);
  const bloco = ls => barras(ls.slice(0, 8).map(l => ({rot: l.adversario, extra: `${l.v} a ${l.d}`, txt: fmt(l.ap) + '%', val: l.ap})));
  $('conteudo').innerHTML = `<div class="g2">
      <div><h2>Fregueses</h2><p class="nota">Adversários com pelo menos ${min} partidas contra quem a FURIA mais vence.</p>${bloco(fortes.slice().sort((a, b) => b.ap - a.ap || b.partidas - a.partidas))}</div>
      <div><h2>Carrascos</h2><p class="nota">E aqueles contra quem ela menos vence.</p>${bloco(fortes.slice().sort((a, b) => a.ap - b.ap || b.partidas - a.partidas))}</div></div>
    <h2>Histórico contra cada adversário (${fmt(linhas.length)})</h2>${tabela('adv', [
      {k: 'adversario', t: 'Adversário', e: 1}, {k: 'partidas', t: 'Partidas', f: comBarra(linhas, 'partidas')}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'}, {k: 'ap', t: '% vitórias', f: p1, c: tinta},
      {k: 'mv', t: 'Mapas vencidos'}, {k: 'mp', t: 'Mapas perdidos'}, {k: 'sm', t: 'Saldo de mapas', f: sinal}, {k: 'ultima', t: 'Última', f: dataBR}, {k: 'ult', t: 'Resultado', f: selo}], linhas, 'partidas', 25)}`;
}

function grandes(R) {
  const bloco = (chave, nomes) => {
    const g = agrupa(R.partidas, chave);
    return barras(nomes.filter(([k]) => g.has(k)).map(([k, rot]) => { const s = somaPartidas(g.get(k)); return {rot, extra: `${fmt(s.partidas)} partidas`, txt: fmt(s.ap) + '%', val: s.ap}; }));
  };
  const semAmb = R.partidas.filter(p => p.online == null).length;
  $('conteudo').innerHTML = `<p class="nota" style="margin-bottom:22px;max-width:80ch">Porcentagem de partidas vencidas em cada situação. A HLTV dá de zero a cinco estrelas a uma partida conforme a posição dos dois times no ranking.</p>
    <div class="g3">
      <div><h2>Pelo peso da partida</h2>${bloco(p => p.estrelas, [[5, 'Cinco estrelas'], [4, 'Quatro estrelas'], [3, 'Três estrelas'], [2, 'Duas estrelas'], [1, 'Uma estrela'], [0, 'Sem estrela']])}</div>
      <div><h2>No palco ou de casa</h2>${bloco(p => p.online == null ? null : p.online, [[false, 'LAN'], [true, 'Online']])}
        <p class="nota" style="margin-top:10px">${semAmb ? fmt(semAmb) + ' partidas do recorte não têm o ambiente informado, quase todas de antes de 2021.' : ''}</p></div>
      <div><h2>Pelo formato</h2>${bloco(p => p.formato, [['bo1', 'Melhor de um'], ['bo3', 'Melhor de três'], ['bo5', 'Melhor de cinco']])}</div>
    </div>`;
}

function placares(R) {
  const ot = R.mapas.filter(m => m.teve_prorrogacao), otv = ot.filter(m => m.resultado === 'V').length;
  const conta = res => { const g = [...agrupa(R.mapas.filter(m => m.resultado === res && !m.teve_prorrogacao), m => `${m.rounds_furia} a ${m.rounds_adversario}`)].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
    return barras(g.map(([rot, ms]) => ({rot, txt: fmt(ms.length), val: ms.length})), Math.max(1, ...g.map(x => x[1].length))); };
  const porMapa = [...agrupa(ot, m => m.mapa)].sort((a, b) => b[1].length - a[1].length);
  const apertados = R.mapas.filter(m => Math.abs(m.rounds_furia - m.rounds_adversario) <= 3), apv = apertados.filter(m => m.resultado === 'V').length;
  $('conteudo').innerHTML = cifras([[fmt(ot.length), 'mapas foram para a prorrogação'], [ot.length ? p1(pct(otv, ot.length)) + '%' : '–', 'deles a FURIA venceu'],
      [fmt(apertados.length), 'mapas decididos por até três rounds'], [apertados.length ? p1(pct(apv, apertados.length)) + '%' : '–', 'desses apertados a FURIA venceu']]) + `
    <div class="g3">
      <div><h2>Vitórias mais comuns</h2><p class="nota">Placar do mapa, sem contar prorrogações.</p>${conta('V')}</div>
      <div><h2>Derrotas mais comuns</h2><p class="nota">FURIA primeiro, adversário depois.</p>${conta('D')}</div>
      <div><h2>Prorrogações por mapa</h2><p class="nota">Quantas houve e quantas a FURIA levou.</p>${barras(porMapa.map(([rot, ms]) => ({rot, extra: `${ms.filter(m => m.resultado === 'V').length} vencidas`, txt: fmt(ms.length), val: ms.length})), Math.max(1, ...porMapa.map(x => x[1].length)))}</div>
    </div>
    <p class="nota" style="margin-top:18px">Até 2023 o mapa ia a 16 rounds (CS:GO); desde então vai a 13 (CS2).</p>`;
}

function campeonatos(R) {
  const linhas = [...agrupa(R.partidas, p => p.evento)].map(([evento, ps]) => {
    const s = somaPartidas(ps), c = B.colocacao.get(evento) || {};
    return {evento, fim: ps[0].data, partidas: s.partidas, v: s.v, d: s.d, ap: s.ap, colocacao: c.colocacao || null, pos: c.pior_posicao ?? null, mp: c.melhor_posicao ?? null};
  });
  const tit = linhas.filter(l => l.pos === 1).length, top4 = linhas.filter(l => l.mp != null && l.mp <= 4).length;
  $('conteudo').innerHTML = cifras([[fmt(linhas.length), 'campeonatos no recorte'], [fmt(tit), 'troféus'], [fmt(top4), 'vezes entre as quatro melhores']]) + `
    <h2>Campanhas</h2>${tabela('camp', [
      {k: 'evento', t: 'Campeonato', e: 1, q: 1}, {k: 'fim', t: 'Última partida', f: dataBR}, {k: 'colocacao', t: 'Colocação', f: (v, l) => v ? (l.pos === 1 ? `<b style="background:var(--holo);padding:1px 8px;border-radius:10px">${esc(v)}</b>` : esc(v)) : '–'},
      {k: 'partidas', t: 'Partidas'}, {k: 'v', t: 'V'}, {k: 'd', t: 'D'}, {k: 'ap', t: '% vitórias', f: p1, c: tinta}], linhas, 'fim', 25)}
    <p class="nota">A colocação é a final do campeonato; partidas, vitórias e derrotas seguem o recorte.</p>`;
}

function abaPartidas(R) {
  $('conteudo').innerHTML = `<h2>Partidas (${fmt(R.partidas.length)})</h2>${tabela('part', [
    {k: 'data', t: 'Data', e: 1, f: dataBR}, {k: 'resultado', t: '', f: selo}, {k: 'adversario', t: 'Adversário', e: 1},
    {k: 'placar_furia', t: 'Placar', f: (v, l) => `${v} x ${l.placar_adversario}`}, {k: 'mapas', t: 'Mapas', e: 1, f: v => esc(v || '–')},
    {k: 'evento', t: 'Campeonato', e: 1, q: 1}, {k: 'formato', t: 'Formato'}, {k: 'online', t: 'Ambiente', f: v => v == null ? '–' : v ? 'Online' : 'LAN'},
    {k: 'url', t: 'HLTV', f: v => /^https:\/\/www\.hltv\.org\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">abrir</a>` : '–'}], R.partidas, 'data', 50)}`;
}
