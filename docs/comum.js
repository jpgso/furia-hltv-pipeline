// Base de dados, filtros e agregações compartilhados pelas duas páginas do dashboard.
const D = 'data/';
const get = f => fetch(D + f + '.json').then(r => r.json());
const $ = id => document.getElementById(id);
const fmt = (n, d) => { d = typeof d === 'number' ? d : 0; return n == null || isNaN(n) ? '–' : Number(n).toLocaleString('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d}); };
const pct = (a, b) => b ? 100 * a / b : null;
const dataBR = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);

const B = {};                     // base carregada
const F = {mapas: new Set()};     // mapas marcados (os demais filtros ficam nos próprios campos)

async function carregaBase() {
  const [partidas, mapas, jog, vetos, lineups, eventos] = await Promise.all(
    ['partidas', 'detalhe_mapas', 'detalhe_jogadores', 'detalhe_vetos', 'lineups', 'desempenho_por_evento'].map(get));
  B.partida = new Map(partidas.map(p => [p.partida_id, p]));
  B.partidas = partidas;                                   // da mais recente para a mais antiga
  B.jog = new Map();
  jog.forEach(j => { let o = B.jog.get(j.mapstats_id); if (!o) B.jog.set(j.mapstats_id, o = {TOTAL: [], CT: [], TR: []}); o[j.lado].push(j); });
  B.mapas = mapas.map(m => ({...m, p: B.partida.get(m.partida_id), jg: B.jog.get(m.mapstats_id) || {TOTAL: [], CT: [], TR: []}}));  // ordem cronológica
  B.comMapa = new Set(mapas.map(m => m.partida_id));
  B.vetos = vetos; B.lineups = lineups; B.linhasJog = jog;
  B.colocacao = new Map(eventos.map(e => [e.evento, e]));
  B.min = partidas[partidas.length - 1].data; B.max = partidas[0].data;
  B.meta = await get('meta').catch(() => ({}));       // quando os dados foram publicados
}

function htmlFiltros() {
  return `
    <div class="fl">
      <div><label>Período</label><select id="f-pre"></select></div>
      <div><label>De</label><input type="date" id="f-de"></div>
      <div><label>Até</label><input type="date" id="f-ate"></div>
      <div style="grid-column:span 2"><label>Lineup</label><select id="f-lineup"></select></div>
      <div><label>Jogador</label><select id="f-jog"></select></div>
      <div><label>Adversário</label><input type="text" id="f-adv" list="l-adv" placeholder="Todos"><datalist id="l-adv"></datalist></div>
      <div><label title="A HLTV só informa LAN ou online em parte das partidas, quase todas de 2021 em diante">Ambiente (desde 2021)</label><select id="f-amb"><option value="">Todos</option><option value="lan">LAN</option><option value="online">Online</option></select></div>
      <div><label>Formato</label><select id="f-fmt"><option value="">Todos</option><option>bo1</option><option>bo3</option><option>bo5</option></select></div>
    </div>
    <div class="chips" id="f-mapas"><span class="rot">Mapas</span></div>
    <div class="barra"><div class="conta" id="conta"></div><button class="limpar" id="limpar">Limpar filtros</button></div>`;
}

// Preenche os campos e liga os eventos; `aoMudar` roda a cada alteração.
function montaFiltros(aoMudar) {
  const anos = [...new Set(B.partidas.map(p => p.data.slice(0, 4)))].sort().reverse();
  $('f-pre').innerHTML = '<option value="">Todo o período</option><option value="m3">Últimos 3 meses</option><option value="m12">Últimos 12 meses</option>' + anos.map(a => `<option value="${a}">${a}</option>`).join('') + '<option value="x">Personalizado</option>';
  $('f-de').min = $('f-ate').min = B.min; $('f-de').max = $('f-ate').max = B.max;
  $('f-lineup').innerHTML = '<option value="">Todas</option>' + B.lineups.slice().sort((a, b) => b.ultima_partida.localeCompare(a.ultima_partida)).map(l =>
    `<option value="${l.lineup_id}">${l.jogadores} (${l.primeira_partida.slice(0, 4)}${l.ultima_partida.slice(0, 4) !== l.primeira_partida.slice(0, 4) ? '–' + l.ultima_partida.slice(2, 4) : ''} · ${l.mapas} mapas)</option>`).join('');
  const cont = {}; B.linhasJog.forEach(j => { if (j.lado === 'TOTAL') cont[j.jogador] = (cont[j.jogador] || 0) + 1; });
  $('f-jog').innerHTML = '<option value="">Todos</option>' + Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<option value="${n}">${n} (${c})</option>`).join('');
  $('l-adv').innerHTML = [...new Set(B.partidas.map(p => p.adversario))].sort().map(a => `<option value="${a}">`).join('');
  const cm = {}; B.mapas.forEach(m => cm[m.mapa] = (cm[m.mapa] || 0) + 1);
  $('f-mapas').insertAdjacentHTML('beforeend', Object.entries(cm).sort((a, b) => b[1] - a[1]).map(([n]) => `<span class="chip" data-m="${n}">${n}</span>`).join(''));
  $('f-mapas').onclick = e => { const m = e.target.dataset.m; if (!m) return; F.mapas.has(m) ? F.mapas.delete(m) : F.mapas.add(m); e.target.classList.toggle('on'); aoMudar(); };
  $('f-pre').onchange = () => {
    const v = $('f-pre').value;
    if (v === '') { $('f-de').value = $('f-ate').value = ''; }
    else if (v[0] === 'm') { const d = new Date(B.max); d.setMonth(d.getMonth() - +v.slice(1)); $('f-de').value = d.toISOString().slice(0, 10); $('f-ate').value = B.max; }
    else if (v !== 'x') { $('f-de').value = v + '-01-01'; $('f-ate').value = v + '-12-31'; }
    aoMudar();
  };
  ['f-de', 'f-ate'].forEach(i => $(i).onchange = () => { $('f-pre').value = 'x'; aoMudar(); });
  ['f-lineup', 'f-jog', 'f-amb', 'f-fmt'].forEach(i => $(i).onchange = aoMudar);
  $('f-adv').oninput = aoMudar;
  $('limpar').onclick = () => {
    ['f-pre', 'f-de', 'f-ate', 'f-lineup', 'f-jog', 'f-adv', 'f-amb', 'f-fmt'].forEach(i => $(i).value = '');
    F.mapas.clear(); document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on')); aoMudar();
  };
}

// Aplica os filtros: devolve os mapas e as partidas do recorte.
function recorte() {
  const de = $('f-de').value, ate = $('f-ate').value, lin = +$('f-lineup').value || 0, jg = $('f-jog').value;
  const adv = $('f-adv').value.trim().toLowerCase(), amb = $('f-amb').value, fm = $('f-fmt').value;
  const okPartida = p => (!de || p.data >= de) && (!ate || p.data <= ate) && (!adv || (p.adversario || '').toLowerCase().includes(adv)) &&
    (!amb || p.online === (amb === 'online')) && (!fm || p.formato === fm);   // sem informação de ambiente, a partida sai do filtro
  const nivelMapa = !!(F.mapas.size || lin || jg);
  const mapas = B.mapas.filter(m => okPartida(m.p) && (!F.mapas.size || F.mapas.has(m.mapa)) && (!lin || m.lineup_id === lin) &&
    (!jg || m.jg.TOTAL.some(j => j.jogador === jg)));
  const ids = new Set(mapas.map(m => m.partida_id));
  const partidas = B.partidas.filter(p => ids.has(p.partida_id) || (!nivelMapa && !B.comMapa.has(p.partida_id) && okPartida(p)));
  return {mapas, partidas, ids: new Set(partidas.map(p => p.partida_id)), nivelMapa, jg};
}

// Texto curto de cada filtro ativo, para mostrar o recorte em uma linha.
function filtrosAtivos() {
  const a = [], de = $('f-de').value, ate = $('f-ate').value, pre = $('f-pre');
  if (de || ate) a.push(pre.value && pre.value !== 'x' ? pre.options[pre.selectedIndex].text : `${de ? dataBR(de) : 'início'} a ${ate ? dataBR(ate) : 'hoje'}`);
  if ($('f-lineup').value) a.push((B.lineups.find(l => l.lineup_id === +$('f-lineup').value) || {}).jogadores);
  if (F.mapas.size) a.push([...F.mapas].join(', '));
  if ($('f-jog').value) a.push($('f-jog').value);
  if ($('f-adv').value.trim()) a.push('contra ' + $('f-adv').value.trim());
  if ($('f-amb').value) a.push($('f-amb').value === 'lan' ? 'LAN' : 'Online');
  if ($('f-fmt').value) a.push($('f-fmt').value);
  return a;
}

// ------------------------------------------------------------- agregações
function agrupa(lista, chave) { const m = new Map(); lista.forEach(x => { const k = chave(x); if (k == null) return; (m.get(k) || m.set(k, []).get(k)).push(x); }); return m; }

function somaMapas(ms) {
  const s = {jogados: ms.length, v: 0, d: 0, rv: 0, rp: 0, ctv: 0, ctd: 0, trv: 0, trd: 0, pf: 0, pfv: 0, pa: 0, pav: 0, ot: 0};
  ms.forEach(m => {
    if (m.resultado === 'V') s.v++; else if (m.resultado === 'D') s.d++;
    s.rv += m.rounds_furia || 0; s.rp += m.rounds_adversario || 0;
    s.ctv += m.rounds_ct_furia || 0; s.ctd += (m.rounds_ct_furia || 0) + (m.rounds_tr_adversario || 0);
    s.trv += m.rounds_tr_furia || 0; s.trd += (m.rounds_tr_furia || 0) + (m.rounds_ct_adversario || 0);
    if (m.escolha === 'FURIA') { s.pf++; if (m.resultado === 'V') s.pfv++; }
    if (m.escolha === 'ADVERSARIO') { s.pa++; if (m.resultado === 'V') s.pav++; }
    if (m.teve_prorrogacao) s.ot++;
  });
  return Object.assign(s, {ap: pct(s.v, s.jogados), apr: pct(s.rv, s.rv + s.rp), ct: pct(s.ctv, s.ctd), tr: pct(s.trv, s.trd), apf: pct(s.pfv, s.pf), apa: pct(s.pav, s.pa), saldo: s.rv - s.rp});
}

function somaPartidas(ps) {
  const s = {partidas: ps.length, v: 0, d: 0, e: 0, mv: 0, mp: 0};
  ps.forEach(p => { s[p.resultado === 'V' ? 'v' : p.resultado === 'D' ? 'd' : 'e']++; s.mv += p.mapas_vencidos || 0; s.mp += p.mapas_perdidos || 0; });
  s.ap = pct(s.v, s.partidas); return s;
}

// ADR, KAST e rating: médias ponderadas pelos rounds de cada mapa.
function somaJog(linhas) {
  const s = {mapas: linhas.length, kills: 0, deaths: 0}, w = {adr: [0, 0], kast_pct: [0, 0], rating: [0, 0]};
  linhas.forEach(j => {
    s.kills += j.kills || 0; s.deaths += j.deaths || 0;
    for (const k in w) if (j[k] != null && j.rounds > 0) { w[k][0] += j[k] * j.rounds; w[k][1] += j.rounds; }
  });
  for (const k in w) s[k] = w[k][1] ? w[k][0] / w[k][1] : null;
  s.kd = s.deaths ? s.kills / s.deaths : null; s.saldo = s.kills - s.deaths; return s;
}

// Maior sequência de vitórias; `ps` vem da mais recente para a mais antiga.
function maiorSequencia(ps) { let seq = 0, maior = 0; for (let i = ps.length - 1; i >= 0; i--) { seq = ps[i].resultado === 'V' ? seq + 1 : 0; if (seq > maior) maior = seq; } return maior; }
