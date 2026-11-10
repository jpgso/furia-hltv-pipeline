# FURIA x HLTV, esteira de dados em arquitetura medalhão

Coleta o histórico de partidas de CS da FURIA na [HLTV](https://www.hltv.org) e o organiza em três camadas, prontas para alimentar um dashboard. Tudo roda localmente, só com ferramentas gratuitas.

| Camada | O que guarda | Onde |
|---|---|---|
| **Bronze** | HTML bruto de cada página, compactado, baixado uma única vez | `data/bronze/**/*.html.gz` |
| **Silver** | Modelo estrela (fatos e dimensões), na ótica da FURIA | `data/furia.duckdb`, schema `silver` |
| **Gold** | Tabelas agregadas para o dashboard | schema `gold` + `data/gold_export/*.json` e `.parquet` |

Como a bronze guarda o HTML original, corrigir ou ampliar o que é lido não exige raspar de novo: basta `python main.py reconstruir`.

## Modelo de dados

**Silver**, dimensões: `dim_time`, `dim_jogador`, `dim_evento`, `dim_mapa`, `dim_data`. Fatos:

| Tabela | Grão |
|---|---|
| `fato_partida` | uma linha por partida (série) |
| `fato_mapa` | uma linha por mapa jogado, com rounds por lado (CT/TR) e prorrogação |
| `fato_veto` | uma linha por ação de veto (ban, pick, mapa que sobrou) |
| `fato_jogador_mapa` | uma linha por jogador × mapa × lado (TOTAL, CT, TR) |
| `fato_colocacao_evento` | uma linha por campeonato disputado |

**Gold**, `kpis_gerais`, `partidas`, `desempenho_mensal`, `confronto_direto`, `desempenho_por_evento`, `desempenho_por_mapa`, `desempenho_por_mapa_ano`, `vetos`, `jogadores`, `jogador_por_mapa`, `jogador_por_lado`, `jogador_mensal`.

As transformações estão em SQL puro, em [`sql/silver`](sql/silver) e [`sql/gold`](sql/gold).

## Como executar

1. Instale as dependências:

   ```bash
   pip install -r requirements.txt
   ```

2. Abra um Chrome em modo de depuração (PowerShell) e, nessa janela, acesse `https://www.hltv.org`. Se o Cloudflare pedir a verificação "Verify you are human", resolva-a manualmente e deixe a janela aberta:

   ```powershell
   Start-Process chrome -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=C:\chrome_furia_debug"
   ```

3. Rode a esteira:

   ```bash
   python main.py diario        # só partidas novas (padrão)
   python main.py historico     # todo o histórico; pode ser interrompido e retomado
   python main.py reconstruir   # refaz silver e gold a partir da bronze, sem acessar a internet
   ```

   `--limite N` restringe quantas partidas são baixadas na execução (útil para testar).

Se a verificação do Cloudflare aparecer durante a execução, a esteira pausa e aguarda você resolvê-la na janela do Chrome.

## Atualização automática com n8n (opcional)

O fluxo em [`n8n/workflow_furia_diario.json`](n8n/workflow_furia_diario.json) roda a carga diária em segundo plano e avisa por WhatsApp e e-mail quando há partida nova ou quando algo precisa de atenção. Ele dispara ao iniciar o n8n e a cada 3 horas, então não depende de o computador estar ligado em um horário fixo.

O n8n precisa rodar **na mesma máquina** da esteira, instalado via Node.js (no Docker ele não alcança o Python nem o Chrome).

1. Instale o [Node.js LTS](https://nodejs.org) e depois o n8n:

   ```bash
   npm install -g n8n
   ```

2. Inicie o n8n liberando o nó *Execute Command*, que vem bloqueado por padrão nas versões 2.x (PowerShell). Abra `http://localhost:5678` e crie a conta local:

   ```powershell
   $env:NODES_EXCLUDE = "[]"; n8n start
   ```

3. Importe o fluxo (menu do editor → *Import from File*) e ajuste o nó **Configuracao**: pasta do projeto, telefone com código do país e e-mails.

4. Credenciais (ficam só no seu n8n, nunca neste repositório):
   - **WhatsApp (CallMeBot)**, ative o serviço para o seu número seguindo as instruções em [callmebot.com](https://www.callmebot.com) (API de WhatsApp) e, no nó, crie uma credencial *Query Auth* com nome `apikey` e a chave recebida. É um serviço gratuito de terceiros, para uso pessoal.
   - **E-mail**, credencial *SMTP*. No Gmail: host `smtp.gmail.com`, porta 465, SSL, usuário = seu e-mail e uma [senha de app](https://myaccount.google.com/apppasswords).

5. Teste com *Execute workflow* e depois ative o fluxo.

6. Para o n8n subir junto com o Windows (PowerShell, uma única vez):

   ```powershell
   $acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -WindowStyle Hidden -Command "$env:NODES_EXCLUDE=''[]''; n8n start"'
   Register-ScheduledTask -TaskName "n8n" -Action $acao -Trigger (New-ScheduledTaskTrigger -AtLogOn)
   ```

O que o fluxo executa é [`scripts/run_diario.ps1`](scripts/run_diario.ps1): abre o Chrome de depuração minimizado se preciso, roda `python main.py diario --espera-desafio 30 --json` e devolve uma linha de JSON com `status` (`ok`, `cloudflare`, `sem_chrome`, `erro`) e as partidas novas. Se o Cloudflare pedir verificação, a janela do Chrome fica aberta para você resolvê-la, o aviso chega uma vez (no máximo um por dia para o mesmo problema) e a execução seguinte continua de onde parou.

## Estrutura

```
n8n/         fluxo de atualização automática (importável no n8n)
scripts/     execução em segundo plano para automatizadores
config/      caminhos, parâmetros e logging
extract/     navegação (browser), camada bronze e extração incremental (crawler)
transform/   leitura do HTML em registros (parsers)
load/        banco DuckDB, execução do SQL e exportação da gold (warehouse)
sql/         transformações silver e gold
tests/       testes dos parsers e da construção das camadas
```

## Testes

```bash
python -m pytest tests -q
```

## Observações sobre os dados

- Datas e horas estão no horário de Brasília (UTC-3).
- Estatísticas "eco-adjusted" (eK-eD, eADR, eKAST) e Swing só existem nas partidas mais recentes; nas antigas ficam nulas.
- O rating mistura versões da HLTV (2.0 nas partidas antigas, 3.0 nas novas); a coluna `rating_versao` identifica cada linha.
- O mapa `Default` (vantagem de mapa ou W.O.) conta no placar da série, mas fica fora das estatísticas por mapa (`sem_disputa`).
- Título é a colocação `1st`; faixas como `1-2nd` não contam como título.
- Fonte dos dados: HLTV.org. O conteúdo bruto (`data/`) não é versionado neste repositório.
