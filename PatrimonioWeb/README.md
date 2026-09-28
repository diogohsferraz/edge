# Patrimônio — versões Windows e Web (Google Apps Script)

Aplicação de controle de finanças e investimentos feita com HTML, CSS e JavaScript para rodar no **Windows** e no **navegador**. Uma única interface em `web/` gera as três versões:

| Versão | Onde roda | Onde ficam os dados | Pasta |
|---|---|---|---|
| **Google Apps Script** | Qualquer navegador: PC, iPhone (Adicionar à Tela de Início) e Android | Numa **Planilha Google** sua | `appscript/` ([instalação](appscript/README.md)) |
| **Windows** (app instalável) | Windows 10 e 11 | `%APPDATA%\Patrimonio\dados.json`, com backup diário automático | `windows/` |
| **Arquivo único** | Qualquer navegador, sem instalar nada: é só abrir o arquivo | No próprio navegador (localStorage) | `dist/Patrimonio.html` |

Para passar os dados de uma versão para outra, use **Ajustes › Exportar backup (.json)** numa e **Restaurar backup** na outra.

## Funcionalidades

- **Início (dashboards):**
  - Patrimônio total, variação e rentabilidade do mês e do ano, valor investido e ganho total.
  - Gráfico da evolução patrimonial com a linha de valor investido, total ou empilhado por classe, nos períodos 6M / 1A / 2A / 5A / Tudo.
  - Distribuição por classe de ativo e por instituição.
  - Rentabilidade mensal e acumulada comparada com **CDI** e **IPCA** (API do Banco Central), com o "% do CDI".
  - Aportes, resgates e proventos dos últimos 12 meses, totais por banco e meta de patrimônio com estimativa de prazo.
  - **Filtros dinâmicos:** filtre por classe e instituição, ou clique na rosca, no comparativo e nas listas. A tela inteira (resumo, evolução, rentabilidade, aportes) passa a mostrar só aquela parte da carteira.
  - Evolução empilhada por classe, instituição ou investimento, e **Comparativo** da rentabilidade de cada grupo no período.
  - **Onde aportar:**
    - escolha um perfil (Conservador, Moderado, Arrojado) ou monte sua alocação-alvo por classe;
    - o app divide o aporte do mês entre as classes abaixo do alvo, sem precisar vender nada, e indica os seus investimentos para reforçar ou ideias de investimentos que você ainda não tem (Tesouro IPCA+, FIIs, ETFs…);
    - mostra quanto tempo falta para a meta mantendo a carteira, seguindo a sugestão, aportando 25% a mais ou aplicando o dinheiro parado em conta;
    - avisa sobre concentração num único investimento e sobre valores acima do limite do FGC por instituição;
    - a rentabilidade esperada de cada classe parte do CDI e pode ser ajustada. É uma estimativa educativa, não recomendação de investimento.
- **Carteira:** investimentos agrupados por instituição ou por classe, com busca, filtros e detalhe de cada ativo (gráfico, histórico, vencimento) e opção de arquivar.
  - Marque ✓ nos investimentos (ou "✓ todos" de um grupo) para compará-los **somados ou separados**, em R$ ou em rentabilidade acumulada (%), com a tabela-resumo do período.
  - "Analisar no Início" leva a seleção para os painéis do Início.
- **Atualizar:** o "fechamento do mês". Uma tabela com todos os investimentos agrupados por banco, onde você digita os saldos de uma vez e, se quiser, os aportes e resgates. O botão "=" repete o saldo anterior.
- **Orçamento:** receitas e despesas por categoria, taxa de poupança e comparativo de 6 meses.
  - **Interativo:** clique na rosca, nas categorias, nos totais, nas barras de mês ou de dia para filtrar a tela inteira.
  - **Categorias e subcategorias próprias** (ex.: Moradia › Condomínio), criadas em Ajustes › Categorias ou direto no lançamento ("+ Nova categoria…"). Ao clicar numa categoria com subcategorias, a rosca abre o detalhamento dela.
  - **Importar extrato bancário (CSV)**, testado com o extrato de conta corrente do **Banco do Brasil**:
    - as linhas de saldo são ignoradas;
    - movimentações de investimento (BB Rende Fácil, poupança, Tesouro) vêm desmarcadas;
    - a categoria é sugerida pela descrição (posto → Transporte, condomínio → Moradia, fatura → Cartão…);
    - o app lembra a categoria que você escolher para cada favorecido;
    - importar o mesmo extrato de novo não duplica os lançamentos.
  - **Importar fatura do cartão (PDF)**, testado com a fatura **Ourocard (BB)**:
    - as compras são distribuídas nas categorias de despesa, pela seção da fatura (Restaurantes, Saúde, Supermercados…) ou pela descrição;
    - parcelas ("PARC 17/21") entram no mês da fatura;
    - estornos que anulam uma cobrança (ex.: anuidade + desconto) vêm desmarcados;
    - o total selecionado é conferido com o "Total da Fatura".
    - **Compras parceladas:** a categoria escolhida para uma parcela vale para todas as parcelas da mesma compra, as já lançadas e as das próximas faturas.
    - **Sem duplicidade:** ao importar faturas, o pagamento da fatura ("Pagto cartão crédito" no extrato) deixa de ser despesa. A prévia oferece remover os pagamentos já lançados que batem com o valor da fatura, e os próximos extratos trazem essa linha desmarcada.
- **Ajustes:**
  - Importar a planilha do **Excel (.xlsx)** ou em **CSV**, no formato de colunas por mês ou de lançamentos.
  - **Planilha de evolução patrimonial** com um bloco por fechamento (data em cima; colunas Investimento, Banco e Valor; linha TOTAL):
    - cada investimento vira um ativo com todo o histórico de saldos;
    - "BB" vira Banco do Brasil e a classe é sugerida pelo nome (LCA → Renda Fixa, ticker → Ações…). Dá para ajustar a classe na prévia;
    - a soma de cada fechamento é conferida com a linha TOTAL;
    - investimentos repetidos no mesmo fechamento são somados; os que somem da planilha ficam com saldo zero e são arquivados;
    - aportes e resgates são estimados a partir dos saldos, para a rentabilidade não contar dinheiro novo como ganho;
    - importar de novo a mesma planilha não duplica nada.
  - Exportar os dados em CSV e fazer backup e restauração em JSON.
  - Cadastrar bancos, definir a meta, ocultar valores e carregar dados de exemplo.

## Windows

### Instalar
Baixe o instalador na página **[Releases › Patrimônio para Windows](https://github.com/diogohsferraz/edge/releases/tag/patrimonio-windows)**, atualizada a cada versão nova. Também fica em **GitHub › Actions › "Patrimônio web, Apps Script e Windows" › execução mais recente › Artifacts › Patrimonio-Windows** (um .zip). São dois arquivos:
- `Patrimonio-Instalador-1.0.0.exe`: instala e cria um atalho no Menu Iniciar.
- `Patrimonio-Portatil-1.0.0.exe`: roda direto, sem instalar (dá até para levar num pendrive).

O executável não tem assinatura digital, então o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações › Executar assim mesmo**.

### Gerar você mesmo
```bash
cd PatrimonioWeb/windows
npm install
npm start          # abre o app em modo de desenvolvimento
npm run dist       # gera o instalador e o portátil em windows/dist/
```

## Desenvolvimento

```bash
cd PatrimonioWeb
node tools/build.mjs          # gera appscript/*.html, windows/web/ e dist/Patrimonio.html a partir de web/
node --test tests/*.test.js   # testes do núcleo (cálculos, CSV) e do Code.gs com planilha simulada
```

Testes de ponta a ponta, que precisam do `playwright-core` e do Chromium:
```bash
node tests/e2e/appscript.e2e.js          # interface do Apps Script + Code.gs via google.script.run simulado
xvfb-run node tests/e2e/windows.e2e.js   # app Electron: gravação, reabertura e backup
```

Estrutura de `web/`:
```
web/
├── index.html, styles.css
├── vendor/chart.umd.min.js    # Chart.js 4.5.1 (MIT)
└── js/
    ├── util.js       # formatação R$, datas, números pt-BR
    ├── model.js      # classes de ativo, categorias, bancos e o armazenamento
    ├── analytics.js  # evolução, rentabilidade (Modified Dietz), alocação
    ├── csv.js        # importação e exportação de planilhas
    ├── xlsx.js       # leitor de arquivos do Excel (.xlsx)
    ├── blocks.js     # planilha de evolução patrimonial em blocos por data
    ├── planner.js    # "Onde aportar": alocação-alvo, divisão do aporte e prazo da meta
    ├── statement.js  # extrato bancário (CSV)
    ├── invoice.js    # fatura do cartão (PDF)
    ├── backends.js   # Planilha Google / arquivo no Windows / navegador
    ├── charts.js     # gráficos
    ├── sample.js     # dados de exemplo
    └── app.js        # telas
```
