# Patrimônio no Google Apps Script

Web app que roda no navegador (computador, iPhone ou Android) e guarda os dados numa **Planilha Google** sua. Cada tipo de dado fica numa aba: Instituições, Investimentos, Saldos, Movimentações, Orçamento e Config.

Os arquivos desta pasta:

| Arquivo | Tipo no editor do Apps Script |
|---|---|
| `Code.gs` | Script (`Code.gs`) |
| `Index.html` | HTML (`Index`) |
| `Styles.html` | HTML (`Styles`) |
| `Scripts.html` | HTML (`Scripts`) |
| `appsscript.json` | Manifesto (opcional, veja o passo 3) |

> `Index.html`, `Styles.html` e `Scripts.html` são gerados a partir de `../web/` por `node tools/build.mjs`. Não edite esses arquivos à mão.

## Instalação (copiar e colar, cerca de 5 minutos)

1. Crie uma planilha nova em [sheets.new](https://sheets.new) e dê a ela o nome **Patrimônio**.
2. Na planilha, abra **Extensões › Apps Script**.
3. *(Opcional)* Em **Configurações do projeto** (ícone de engrenagem), marque "Mostrar arquivo de manifesto appsscript.json". Depois cole o conteúdo de `appsscript.json` para usar o fuso de São Paulo.
4. No arquivo `Código.gs`, apague o conteúdo e cole o de `Code.gs`.
5. Clique em **+ › HTML** e crie três arquivos com estes nomes exatos, sem ".html": **Index**, **Styles** e **Scripts**. Em cada um, cole o conteúdo do arquivo correspondente.
6. Clique em **Salvar** (ícone de disquete).
7. Clique em **Implantar › Nova implantação**. Em "Tipo", escolha **App da Web** e configure:
   - Executar como: **Eu**
   - Quem pode acessar: **Somente eu**
8. Clique em **Implantar** e autorize o acesso. O Google mostra o aviso "app não verificado" porque o script é seu. Clique em *Avançado › Acessar Patrimônio*.
9. Copie a **URL do app da Web** (termina em `/exec`). Esse é o seu app.

**No iPhone:** abra a URL no Safari e toque em **Compartilhar › Adicionar à Tela de Início**. O app ganha um ícone como qualquer outro.

**Atualizar para uma versão nova:** cole os arquivos de novo e use **Implantar › Gerenciar implantações › Editar (lápis) › Versão: Nova versão**. A URL continua a mesma.

### Alternativa com o clasp (linha de comando)

```bash
npm i -g @google/clasp
clasp login
cd PatrimonioWeb/appscript
cp .clasp.json.example .clasp.json   # coloque o ID do script (Configurações do projeto › ID)
clasp push
```

## Como os dados ficam guardados

- Se o script foi criado pela planilha (passo 2), os dados ficam **nessa planilha**.
- Se foi criado como projeto independente em script.google.com, o app cria automaticamente a planilha **"Patrimônio - Dados"** no seu Drive.
- Os arquivos exportados (CSV e backup) são salvos no seu Google Drive.
- CDI e IPCA são buscados no Banco Central pelo próprio script.

**Usuário e senha (opcional):** em **Ajustes › Segurança › Criar usuário e senha**, o app passa a pedir o acesso ao abrir, além do login do Google. Os dados passam a ficar criptografados numa aba única, **Cofre**, e as outras abas são apagadas: quem abrir a planilha não consegue ler nada. A senha não tem recuperação, então exporte um backup antes. Removendo a proteção, as abas legíveis voltam.

Sem senha, dá para editar os dados direto na planilha. Só não mude os nomes das abas nem a ordem das colunas, e mantenha a coluna **ID** preenchida.
