# Patrimônio — versões Windows e Web (Google Apps Script)

A mesma aplicação do app iOS (`../PatrimonioApp`), feita com HTML, CSS e JavaScript para rodar no **Windows** e no **navegador**. Uma única interface em `web/` gera as três versões:

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
- **Carteira:** investimentos agrupados por instituição ou por classe, com busca, detalhe de cada ativo (gráfico, histórico, vencimento) e opção de arquivar.
- **Atualizar:** o "fechamento do mês". Uma tabela com todos os investimentos agrupados por banco, onde você digita os saldos de uma vez e, se quiser, os aportes e resgates. O botão "=" repete o saldo anterior.
- **Orçamento:** receitas e despesas por categoria, taxa de poupança e comparativo de 6 meses.
  - **Importar extrato bancário (CSV)**, testado com o extrato de conta corrente do **Banco do Brasil**:
    - as linhas de saldo são ignoradas;
    - movimentações de investimento (BB Rende Fácil, poupança, Tesouro) vêm desmarcadas;
    - a categoria é sugerida pela descrição (posto → Transporte, condomínio → Moradia, fatura → Cartão…);
    - o app lembra a categoria que você escolher para cada favorecido;
    - importar o mesmo extrato de novo não duplica os lançamentos.
- **Ajustes:**
  - Importar a planilha em **CSV**, no formato de colunas por mês ou de lançamentos.
  - Exportar os dados em CSV e fazer backup e restauração em JSON.
  - Cadastrar bancos, definir a meta, ocultar valores e carregar dados de exemplo.

## Windows

### Instalar
Baixe o instalador em **GitHub › Actions › "Patrimônio web, Apps Script e Windows" › execução mais recente › Artifacts › Patrimonio-Windows**. O pacote traz dois arquivos:
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
    ├── backends.js   # Planilha Google / arquivo no Windows / navegador
    ├── charts.js     # gráficos
    ├── sample.js     # dados de exemplo
    └── app.js        # telas
```
