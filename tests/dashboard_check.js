// Roda as agregações do dashboard (docs/comum.js) fora do navegador e imprime o resultado em JSON.
// Uso: node tests/dashboard_check.js <pasta com os JSON exportados da gold>
// O teste em test_pipeline.py compara a saída com as tabelas gold.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pasta = process.argv[2];
const contexto = vm.createContext({
  console,
  // comum.js pede 'data/<tabela>.json'; aqui o arquivo vem da pasta de exportação.
  fetch: async url => {
    const arquivo = path.join(pasta, path.basename(url));
    if (!fs.existsSync(arquivo)) return {ok: false, status: 404};
    return {ok: true, json: async () => JSON.parse(fs.readFileSync(arquivo, 'utf8'))};
  },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'comum.js'), 'utf8'), contexto, {filename: 'comum.js'});

const calculo = `carregaBase().then(() => {
  const geral = somaPartidas(B.partidas), mapas = somaMapas(B.mapas);
  return {
    geral: {partidas: geral.partidas, vitorias: geral.v, derrotas: geral.d, aproveitamento: geral.ap,
            mapas_vencidos: mapas.v, mapas_perdidos: mapas.d, aproveitamento_mapas: mapas.ap, maior_sequencia: maiorSequencia(B.partidas)},
    mapas: [...agrupa(B.mapas, m => m.mapa)].map(([mapa, ms]) => {
      const s = somaMapas(ms);
      return {mapa, jogados: s.jogados, vitorias: s.v, aproveitamento: s.ap, ct: s.ct, tr: s.tr, prorrogacoes: s.ot};
    }),
    jogadores: [...agrupa(B.linhasJog, j => j.jogador)].map(([jogador, ls]) => {
      const s = somaJog(ls);
      return {jogador, mapas: s.mapas, kills: s.kills, deaths: s.deaths, kd: s.kd, adr: s.adr, kast_pct: s.kast_pct, rating: s.rating};
    }),
    adversarios: [...agrupa(B.partidas, p => p.adversario)].map(([adversario, ps]) => {
      const s = somaPartidas(ps);
      return {adversario, partidas: s.partidas, vitorias: s.v, derrotas: s.d, mapas_vencidos: s.mv, mapas_perdidos: s.mp};
    }),
  };
})`;
vm.runInContext(calculo, contexto).then(
  resultado => console.log(JSON.stringify(resultado)),
  erro => { console.error(erro); process.exit(1); });
