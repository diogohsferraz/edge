# Patrimônio — app iOS de controle de finanças e investimentos

App nativo para iPhone (SwiftUI + SwiftData + Swift Charts) para **concentrar investimentos espalhados em vários bancos e corretoras**, substituir a planilha de acompanhamento e ver a **evolução patrimonial em dashboards**.

A ideia combina o que os apps mais baixados do Brasil fazem melhor:

| Referência | O que foi aproveitado |
|---|---|
| **Kinvo / Gorila** (consolidação de investimentos) | Carteira única por instituição e classe de ativo, rentabilidade mensal e acumulada, comparação com CDI e IPCA, proventos |
| **Mobills / Organizze** (controle financeiro) | Aba de orçamento com receitas e despesas por categoria, saldo do mês e taxa de poupança |
| **Nubank / apps de banco** | Botão de olho para ocultar valores e bloqueio com Face ID |
| **Sua planilha** | Tela "Atualizar" para lançar os saldos do mês de uma vez, e importação/exportação em CSV |

## Funcionalidades

### Início (dashboard)
- **Patrimônio total**, variação e rentabilidade do mês, valor investido, ganho total e rentabilidade no ano.
- **Evolução patrimonial**: gráfico do patrimônio mês a mês com a linha de *valor investido* (mostra quanto é aporte e quanto é rendimento). Também há a visão empilhada **por classe**. Períodos 6M / 1A / 2A / 5A / Tudo, e é só tocar no gráfico para ver o valor de cada mês.
- **Distribuição da carteira**: gráfico de rosca por classe de ativo ou por instituição.
- **Rentabilidade**: barras mensais e curva acumulada da carteira × **CDI** × **IPCA**, com o "% do CDI". Os índices vêm da API pública do Banco Central (SGS 4391 e 433).
- **Aportes, resgates e proventos** dos últimos 12 meses.
- **Por instituição**: quanto você tem em cada banco e a variação desde o fim do mês passado.
- **Meta de patrimônio**: progresso e estimativa de quando você chega lá, com base na sua média de aportes e de rentabilidade.

### Carteira
- Investimentos agrupados por instituição ou por classe, com subtotais, percentual da carteira e resultado de cada um.
- Classes: Conta/Poupança, Renda Fixa (CDB, LCI, LCA…), Tesouro Direto, Ações, FIIs, Fundos, Previdência, Cripto, Exterior e Outros.
- Detalhe do ativo com gráfico próprio, indexador, vencimento, histórico de saldos e movimentações.
- Arquivar investimentos resgatados, sem perder o histórico nos gráficos.
- Mais de 20 bancos e corretoras sugeridos com cores (Nubank, Itaú, XP, BTG, Inter, Rico, C6…).

### Atualizar (fechamento do mês)
Faz o papel da sua planilha: todos os investimentos ativos aparecem numa lista agrupada por banco. Você abre o app de cada banco e digita o saldo atual. Se quiser, registra também **aporte / resgate / provento** para a rentabilidade não confundir dinheiro novo com rendimento. O app avisa quais investimentos ainda não foram atualizados no mês.

### Orçamento
Receitas e despesas por categoria, resumo mensal, gráfico dos gastos por categoria e comparativo dos últimos 6 meses.

### Ajustes
- **Importar planilha (CSV)** do Excel ou Google Planilhas, em dois formatos:
  - *Saldos por mês* (colunas `01/2026; 02/2026; …`), que é o formato mais comum de planilha de patrimônio;
  - *Lançamentos* (`data; instituicao; ativo; classe; saldo; aporte; resgate; proventos`).
- Exportar investimentos e orçamento em CSV.
- Ocultar valores, bloqueio com Face ID, meta de patrimônio, dados de exemplo e apagar tudo.

Os dados ficam **somente no aparelho** (SwiftData). O app não pede senha de banco.

## Como rodar

Requisitos: **Mac com Xcode 16 ou superior**; iOS 17+ no iPhone ou no simulador.

1. Abra `PatrimonioApp/Patrimonio.xcodeproj` no Xcode.
2. Em *Signing & Capabilities*, selecione o seu *Team* (uma conta Apple gratuita basta para instalar no seu próprio iPhone) e, se precisar, troque o *Bundle Identifier*.
3. Escolha um simulador ou o seu iPhone e rode com **⌘R**. Os testes rodam com **⌘U**.
4. No primeiro uso, toque em **"Explorar com dados de exemplo"** para ver os dashboards preenchidos, ou em **Ajustes › Importar planilha** para trazer os seus dados.

> Alternativa: com o [XcodeGen](https://github.com/yonaskolb/XcodeGen) instalado, rode `xcodegen generate` dentro de `PatrimonioApp/` para gerar o projeto a partir do `project.yml`.

## Como a rentabilidade é calculada

- O saldo de cada ativo num mês é o **último saldo informado** até o fim daquele mês. Se você pular um mês, o app repete o saldo anterior.
- **Resultado do mês** = saldo final − saldo inicial − (aportes − resgates − proventos).
- **Rentabilidade do mês** pelo método *Modified Dietz*: cada aporte ou resgate é ponderado pelos dias em que ficou aplicado no mês.
- A **rentabilidade acumulada** é composta mês a mês. O **% do CDI** é a rentabilidade acumulada da carteira dividida pela do CDI no mesmo período.
- Na importação, se um investimento não tiver nenhum aporte registrado, o primeiro saldo é considerado aporte inicial.

## Estrutura

```
PatrimonioApp/
├── Patrimonio.xcodeproj
├── project.yml                  # alternativa via XcodeGen
├── Patrimonio/
│   ├── App/                     # entrada do app, abas, tela de bloqueio
│   ├── Models/                  # SwiftData: Institution, Asset, BalanceSnapshot, Movement, CashTransaction
│   ├── Services/                # cálculos (PortfolioAnalytics), CSV, CDI/IPCA, Face ID, dados de exemplo
│   ├── Utilities/               # formatação em R$, datas e cores
│   └── Views/                   # Dashboard, Carteira, Atualizar, Orçamento, Ajustes
└── PatrimonioTests/             # testes de rentabilidade, parsing de valores e importação CSV
```

## Próximos passos possíveis
- Sincronizar entre aparelhos via iCloud (CloudKit).
- Buscar a cotação de ações e FIIs automaticamente pelo ticker.
- Widget na tela inicial com o patrimônio total.
- Integração com o Open Finance, que exige uma empresa participante ou agregadora credenciada.
