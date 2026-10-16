# Fluxo

Sistema de gestão de processos em **pipes**, inspirado no funcionamento do Pipefy,
feito em **Google Apps Script**. Os dados ficam numa planilha do Google Sheets e os
anexos numa pasta do Google Drive da conta que publica o app.

> Projeto de demonstração/estudo. É uma implementação própria, escrita do zero a
> partir do comportamento público do produto. Não usa código, marca nem layout do Pipefy.

## Funcionalidades

| Área | O que tem |
|---|---|
| **Pipes e kanban** | Pipes com fases ordenáveis; cards arrastáveis entre fases; busca e filtros por responsável, etiqueta e prazo |
| **Formulários** | Formulário inicial e um formulário por fase. 15 tipos de campo: texto curto/longo, número, moeda, data, data e hora, e-mail, telefone, lista suspensa, seleção única, checklist, sim/não, responsável, anexo e conexão com database |
| **Regras de fase** | Campos obrigatórios da fase precisam estar preenchidos para o card avançar; fases finais marcam o card como concluído |
| **Card** | Edição dos campos de todas as fases já visitadas, responsáveis, etiquetas, vencimento, comentários, anexos, tempo em cada fase e histórico completo |
| **SLA** | Limite de horas por fase; cards aparecem como *Expirando* (75% do limite), *Atrasado* ou *Vencido* |
| **Automações** | *Quando* (card criado, entrou na fase, campo alterado, SLA estourado, vencimento passou) + *se* (condições sobre campos) + *então* (mover, criar card em outro pipe, enviar e-mail, atribuir, preencher campo, etiquetar, comentar). E-mails aceitam `{{titulo}}`, `{{fase}}`, `{{pipe}}`, `{{link}}`, `{{vencimento}}`, `{{responsaveis}}`, `{{criador}}`, `{{campo:Nome do campo}}` |
| **Relatórios** | Visão em lista com colunas escolhidas e exportação CSV; dashboard com indicadores, cards por fase, tempo médio por fase, criados por semana e carga por responsável |
| **Formulário público** | Link por pipe para abrir cards sem login (com anexos) |
| **Databases** | Tabelas de registros (ex.: fornecedores) com campos próprios, busca, CSV e conexão com campos dos cards |
| **Usuários** | Login por e-mail e senha (hash SHA-256 com salt, sessões de 7 dias); papéis administrador e membro; membros por pipe |

## Instalação (cerca de 10 minutos)

### Opção A: copiar e colar no editor

1. Acesse <https://script.google.com> e clique em **Novo projeto**. Dê o nome *Fluxo*.
2. Em **Configurações do projeto** (engrenagem), marque **Mostrar o arquivo de manifesto
   "appsscript.json" no editor**.
3. Para cada arquivo de `fluxo/src/`, crie um arquivo com o **mesmo nome** no editor e cole o conteúdo:
   - Scripts (`+` → *Script*): `Code`, `Auth`, `Db`, `Pipes`, `Cards`, `Automations`, `Tables`, `Demo`
     (o editor acrescenta `.gs` sozinho).
   - HTML (`+` → *HTML*): `Index`, `Styles`, `App`.
   - Substitua o conteúdo de `appsscript.json` pelo do repositório.
4. Clique em **Implantar → Nova implantação → Tipo: App da Web**:
   - *Executar como*: **Eu**
   - *Quem pode acessar*: **Qualquer pessoa**. Isso é necessário porque o login é do
     próprio Fluxo (e-mail e senha) e o formulário público funciona sem conta Google.
5. Autorize as permissões pedidas (Planilhas, Drive, envio de e-mail e gatilhos).
6. Abra a URL do app da web. A primeira conta cadastrada vira **administradora**.
7. Na tela inicial, clique em **Carregar dados de exemplo** para ver tudo funcionando.
8. Em **Administração**, clique em **Ativar verificação automática de SLA**. Isso cria um gatilho de
   hora em hora que dispara as automações de SLA e de vencimento.

A planilha *Fluxo — Banco de dados* e a pasta *Fluxo — Anexos* são criadas no seu Drive no primeiro uso.

### Opção B: clasp (linha de comando)

```bash
npm install -g @google/clasp
clasp login
cd fluxo
clasp create --type webapp --title "Fluxo" --rootDir src
clasp push
clasp deploy
```

Depois siga os passos 4 a 8 da opção A. Para publicar uma nova versão do código,
use **Implantar → Gerenciar implantações → Editar → Nova versão**.

## Observações

- **Novos usuários**: o cadastro aberto vale só para o primeiro acesso. Depois, o
  administrador cria as contas em *Administração*. Para reabrir o autocadastro, crie a
  propriedade de script `ALLOW_SIGNUP = true`.
- **E-mails** saem da conta que publicou o app e seguem a cota diária do Apps Script
  (100/dia em contas gratuitas, 1.500/dia no Workspace).
- **Escala**: o Sheets atende bem a demonstrações e equipes pequenas (alguns milhares de
  cards). Para volumes maiores, troque `Db.gs` por um banco de verdade.
- **Links das automações**: `{{link}}` abre o card direto, no formato `URL-do-app#/card/ID`.

## Desenvolvimento local

`fluxo/dev/server.js` executa os arquivos `.gs` em Node, com simulações da planilha, do
Drive e do e-mail, e serve a interface:

```bash
node fluxo/dev/server.js        # http://localhost:8787
node fluxo/dev/api-test.js      # testes de ponta a ponta da API
```

Os dados da simulação ficam só na memória e são apagados quando o servidor para.

## Estrutura

```
fluxo/
  src/                  projeto Apps Script
    appsscript.json     manifesto (web app, fuso America/Maceio)
    Code.gs             doGet, roteador da API e bootstrap
    Auth.gs             cadastro, login, sessões e usuários
    Db.gs               camada de dados sobre o Sheets
    Pipes.gs            pipes, fases, campos e formulário público
    Cards.gs            cards, movimentação, comentários, SLA e anexos
    Automations.gs      motor de automações e verificação agendada
    Tables.gs           databases e registros
    Demo.gs             modelos de pipe e dados de exemplo
    Index.html          página
    Styles.html         estilos (tema claro e escuro)
    App.html            aplicação cliente (JavaScript puro)
  dev/                  servidor e testes locais
```
