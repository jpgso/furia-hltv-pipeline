// Visão geral: indicadores, linha do tempo, forma, mapas e elenco.
const dna = {cron: [], tit: [], passo: 1};
let forma;

carregaBase().then(() => {
  $('filtros').innerHTML = htmlFiltros();
  montaFiltros(atualiza);
  $('f-abre').onclick = () => { $('filtros').classList.toggle('aberto'); $('f-abre').classList.toggle('on'); document.querySelector('.fbar').classList.toggle('aberta'); };
  preparaDna(); preparaForma();
  $('pipe').innerHTML = [
    ['01', 'Bronze', 'HTML bruto', 'Cada página da HLTV é baixada uma única vez e guardada compactada.', fmt(B.partidas.length) + ' páginas de partida'],
    ['02', 'Silver', 'Modelo estrela', 'Fatos e dimensões em DuckDB, sempre na ótica da FURIA.', 'fatos e dimensões'],
    ['03', 'Gold', 'Agregações', 'Tabelas prontas para análise, escritas em SQL puro.', 'agregadas e por mapa'],
    ['04', 'n8n', 'Atualização', 'Carga incremental automática, com aviso por WhatsApp e e-mail.', 'a cada vez que o PC liga'],
  ].map(s => `<div class="card step"><div class="k">${s[0]}</div><div class="t"><small>${s[1]}</small>${s[2]}</div><p>${s[3]}</p><div class="v mono">${s[4]}</div></div>`).join('');
  $('atualizado').textContent = B.meta.atualizado_em ? 'atualizado em ' + dataBR(B.meta.atualizado_em) : 'última partida em ' + dataBR(B.max);
  atualiza();
}).catch(e => {
  console.error(e);
  $('atualizado').textContent = 'dados indisponíveis';
  $('conta2').textContent = 'Não foi possível carregar os dados. Recarregue a página em instantes.';
});

// Recalcula toda a página para o recorte dos filtros.
function atualiza() {
  const R = recorte(), ativos = filtrosAtivos();
  $('f-ativos').innerHTML = ativos.map(a => `<span>${esc(a)}</span>`).join('');
  $('conta2').innerHTML = `<b>${fmt(R.partidas.length)}</b> partidas · <b>${fmt(R.mapas.length)}</b> mapas`;
  const sp = somaPartidas(R.partidas), sm = somaMapas(R.mapas);
  const eventos = [...new Set(R.partidas.map(p => p.evento))].map(e => B.colocacao.get(e)).filter(e => e && e.pior_posicao === 1);
  $('h-part').textContent = fmt(sp.partidas); $('h-pal').textContent = sp.partidas === 1 ? 'partida' : 'partidas';
  $('k-ap').textContent = fmt(sp.ap || 0, 1); $('k-tit').textContent = fmt(eventos.length);
  $('k-seq').textContent = fmt(maiorSequencia(R.partidas)); $('k-rd').textContent = fmt(sm.rv + sm.rp);
  // Placar geral: a barra reparte a largura entre vitórias, empates e derrotas.
  [['v', sp.v], ['e', sp.e], ['d', sp.d]].forEach(([k, n]) => { $('b-' + k).style.flex = n; $('b-' + k).style.display = n ? '' : 'none'; });
  $('l-v').textContent = fmt(sp.v); $('l-d').textContent = fmt(sp.d);
  $('l-e').textContent = sp.e ? `${sp.e} ${sp.e === 1 ? 'empate' : 'empates'}` : '';
  const anos = R.partidas.length ? [R.partidas[R.partidas.length - 1].data.slice(0, 4), R.partidas[0].data.slice(0, 4)] : null;
  $('kicker').textContent = 'Counter-Strike · ' + (anos ? (anos[0] === anos[1] ? anos[0] : anos[0] + ' a ' + anos[1]) : 'sem partidas') + (ativos.length ? ' · recorte filtrado' : '');
  $('t-dna').textContent = ativos.length ? 'O recorte em uma linha' : 'Toda a história em uma linha';

  dna.cron = R.partidas.slice().reverse();
  dna.tit = eventos.map(e => { let i = -1; dna.cron.forEach((p, k) => { if (p.evento === e.evento) i = k; }); return i; }).filter(i => i >= 0);
  pintaDna();

  let v = 0; const jan = [];
  forma.setOption({xAxis: {data: dna.cron.map(p => p.data)}, series: [{data: dna.cron.map(p => { jan.push(p.resultado === 'V' ? 1 : 0); v += jan[jan.length - 1]; if (jan.length > 10) v -= jan.shift(); return +(100 * v / jan.length).toFixed(1); })}]});

  $('ultimas').innerHTML = R.partidas.slice(0, 6).map(p => `
    <div class="row" style="--c:${corResultado(p.resultado)}"><div class="sc">${p.placar_furia}×${p.placar_adversario}</div>
    <div><div class="who">${esc(p.adversario)}</div><div class="ev">${esc(p.evento)}</div></div>
    <div class="ev mono">${dataBR(p.data).slice(0, 5)}/${p.data.slice(2, 4)}</div></div>`).join('') || '<div class="vazio">Nenhuma partida com esses filtros.</div>';

  const porMapa = [...agrupa(R.mapas, m => m.mapa)].map(([mapa, ms]) => Object.assign({mapa}, somaMapas(ms))).sort((a, b) => b.jogados - a.jogados);
  const corte = ativos.length ? 1 : 30;
  $('maps').innerHTML = porMapa.filter(m => m.jogados >= corte).slice(0, 12).map(m => `
    <div class="card map"><div class="ring" style="--p:${m.ap.toFixed(1)};--c:${m.ap >= 50 ? ACC : LOSS}"><span>${fmt(m.ap)}%</span></div>
    <div class="nm">${esc(m.mapa)}</div><div class="mt">${fmt(m.jogados)} jogados · ${m.v}V ${m.d}D</div>
    <div class="sides"><i style="width:${(m.ct || 0) / 2}%;background:${COR_CT}"></i><i style="width:${(m.tr || 0) / 2}%;background:${COR_TR}"></i></div>
    <div class="mt">CT ${fmt(m.ct)}% · TR ${fmt(m.tr)}%</div></div>`).join('') || '<div class="vazio">Nenhum mapa com esses filtros.</div>';

  // Elenco: a escalação mais recente do recorte, com as estatísticas dentro dele.
  let nomes = [];
  for (let i = R.mapas.length - 1; i >= 0 && !nomes.length; i--) nomes = R.mapas[i].jg.TOTAL.map(j => j.jogador);
  const linhas = []; R.mapas.forEach(m => m.jg.TOTAL.forEach(j => { if (nomes.includes(j.jogador)) linhas.push(j); }));
  const elenco = [...agrupa(linhas, j => j.jogador)].map(([jogador, ls]) => Object.assign({jogador}, somaJog(ls))).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  $('t-elenco').textContent = ativos.length ? 'Elenco do recorte' : 'Elenco atual';
  $('s-elenco').textContent = ativos.length ? 'A escalação mais recente dentro do recorte, com as médias calculadas só nele.' : 'Rating médio da HLTV em todos os mapas jogados pela FURIA.';
  $('players').innerHTML = elenco.map(j => `
    <div class="card pl" style="--c:${j.rating >= 1 ? ACC : LOSS}"><div class="nick">${esc(j.jogador)}</div><div class="rt">${fmt(j.rating, 2)}</div><div class="mt">rating · ${fmt(j.mapas)} mapas</div>
    <div class="st"><span><b>${fmt(j.kd, 2)}</b>K/D</span><span><b>${fmt(j.adr, 1)}</b>ADR</span><span><b>${fmt(j.kast_pct, 1)}%</b>KAST</span></div></div>`).join('') || '<div class="vazio">Sem estatísticas individuais neste recorte.</div>';
}

function preparaDna() {
  const cv = $('dna'), tip = $('tip');
  addEventListener('resize', () => pintaDna());
  cv.addEventListener('mousemove', e => {
    if (!dna.cron.length) return;
    const r = cv.getBoundingClientRect(), i = Math.floor((e.clientX - r.left) / dna.passo), p = dna.cron[i];
    if (!p) { tip.style.opacity = 0; pintaDna(); return; }
    pintaDna(i);
    tip.innerHTML = `<div style="color:${MUT}">${dataBR(p.data)} · ${esc(p.evento)}</div><b>FURIA ${p.placar_furia} × ${p.placar_adversario} ${esc(p.adversario)}</b><div style="color:${MUT};margin-top:4px">${esc(p.mapas)}</div>`;
    tip.style.opacity = 1;
    tip.style.left = Math.min(innerWidth - 240, e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 16) + 'px';
  });
  cv.addEventListener('mouseleave', () => { tip.style.opacity = 0; pintaDna(); });
}

function pintaDna(destaque = -1) {
  const cv = $('dna'), cron = dna.cron, r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const W = r.width, H = r.height, pad = 22, meio = (H - pad) / 2 + 6;
  c.fillStyle = LINE; c.fillRect(0, meio, W, 1);
  if (!cron.length) { c.fillStyle = MUT; c.font = '13px system-ui, sans-serif'; c.fillText('Nenhuma partida com esses filtros.', 12, meio - 12); return; }
  const passo = Math.min(18, W / cron.length), larg = Math.max(1, passo - (passo > 3 ? 1.5 : .6)), maxS = 26, escala = (meio - 14) / maxS;
  dna.passo = passo;
  let marca = '', ultimoX = -99;
  const porMes = cron.length < 120;
  cron.forEach((p, i) => {
    const x = i * passo, rot = porMes ? p.data.slice(5, 7) + '/' + p.data.slice(2, 4) : p.data.slice(0, 4);
    if (rot !== marca) {
      marca = rot;
      if (x - ultimoX > 46) { c.fillStyle = '#1c1c22'; c.fillRect(x, 0, 1, H - pad); c.fillStyle = MUT; c.font = '11px system-ui, sans-serif'; c.fillText(rot, x + 4, H - 6); ultimoX = x; }
    }
    const saldo = Math.max(-maxS, Math.min(maxS, (p.rounds_vencidos || 0) - (p.rounds_perdidos || 0)));
    const h = Math.max(3, Math.abs(saldo) * escala), v = p.resultado === 'V';
    c.globalAlpha = destaque < 0 || destaque === i ? 1 : .35;
    c.fillStyle = corResultado(p.resultado);
    c.fillRect(x, v ? meio - h : meio + 1, larg, h);
  });
  c.globalAlpha = 1;
  dna.tit.forEach(i => { c.fillStyle = GOLD; c.beginPath(); c.arc(i * passo + larg / 2, 7, 3.2, 0, 7); c.fill(); });
}

function preparaForma() {
  forma = echarts.init($('forma'));
  forma.setOption({
    grid: {left: 38, right: 12, top: 16, bottom: 28},
    tooltip: {trigger: 'axis', backgroundColor: '#000', borderColor: LINE, textStyle: {color: TXT, fontSize: 12},
      formatter: a => `${dataBR(a[0].axisValue)}<br><b>${fmt(a[0].data, 0)}%</b> nas últimas 10`},
    xAxis: {type: 'category', data: [], axisLine: {lineStyle: {color: LINE}}, axisTick: {show: false},
      axisLabel: {color: MUT, hideOverlap: true, formatter: v => dna.cron.length < 120 ? v.slice(5, 7) + '/' + v.slice(2, 4) : v.slice(0, 4)}},
    yAxis: {type: 'value', min: 0, max: 100, splitLine: {lineStyle: {color: '#1c1c22'}}, axisLabel: {color: MUT, formatter: '{value}%'}},
    series: [{type: 'line', data: [], smooth: .35, symbol: 'none',
      lineStyle: {color: ACC, width: 2.5},
      areaStyle: {color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(43,213,118,.34)'}, {offset: 1, color: 'rgba(43,213,118,0)'}])},
      markLine: {silent: true, symbol: 'none', lineStyle: {color: '#6b6b76', type: 'dashed'}, label: {color: MUT, formatter: '50%'}, data: [{yAxis: 50}]}}],
    animationDuration: 300,
  });
  addEventListener('resize', () => forma.resize());
}
