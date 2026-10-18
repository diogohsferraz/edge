# Kart Turbo

Jogo de kart 3D original (personagens, pistas e visual próprios) para Android, feito
para rodar no projetor **Wanbo Cube 2**, em outras TVs/projetores Android e em **celulares
Android** (com controles na tela). Também roda no navegador do PC.

- **5 pistas**: Circuito Coqueiral (praia), Vale Neblina (montanha, com planador), Cidade Neon
  (noite), Dunas do Sol (deserto, cheia de rampas) e Pico Nevado (neve, com planador)
- **12 pilotos** com atributos diferentes (velocidade, aceleração e curvas)
- Corrida de 3 voltas contra 7 adversários da CPU, nas classes **50cc, 100cc e 150cc**
- **Drift com 3 níveis de turbo** (faíscas azuis, laranja e roxas) e turbo de largada
- **Roleta de itens por posição**: ⚡ Nitro e Nitro ×3, 🛢️ Óleo, 💣 Bomba que quica, 🚀 Míssil que
  persegue quem está à frente, 🛡️ Escudo e 🔥 Supercarga
- **Moedas**: cada uma aumenta a velocidade máxima (até 10); ser atingido faz perder 3
- **Rampas com manobra no ar** (turbo ao pousar), **rampas de planador** e **placas de turbo**
- **2 jogadores em tela dividida**, um controle para cada
- Funciona com controle Bluetooth/USB (inclusive Joy-Con e Pro Controller do Switch) e com o
  **controle remoto do projetor** (aceleração automática)

## Instalar no projetor

1. Copie `KartTurbo.apk` para um pendrive (ou cartão de memória).
2. Conecte no projetor e abra o **gerenciador de arquivos** (no Wanbo costuma se chamar
   *Arquivos*, *File Manager* ou *Media Center*).
3. Selecione `KartTurbo.apk` e escolha **Instalar**. Se aparecer um aviso de
   "fontes desconhecidas", permita a instalação para o gerenciador de arquivos.
4. O jogo aparece como **Kart Turbo** na lista de aplicativos.

Se o projetor não tiver gerenciador de arquivos, instale um pela loja do aparelho
(por exemplo *File Commander* ou *X-plore*) ou envie o APK pela rede com o app
*Send Files to TV*.

## Instalar no celular Android

1. Envie `KartTurbo.apk` para o celular (WhatsApp, Google Drive, cabo USB…) e toque no arquivo.
2. Permita "instalar apps desconhecidos" para o app usado para abrir o arquivo, quando o Android pedir.
3. Abra **Kart Turbo** e jogue com o celular deitado.

No celular o kart **acelera sozinho**. Na tela ficam os botões **◀ ▶** (virar), **DRIFT**
(segurar), **ITEM**, **FREIO** e **❚❚** (pausa). Em **Opções → Direção no celular** dá para trocar
os botões de direção por **inclinar o celular**, como um volante. Os menus funcionam por toque.

Também dá para conectar um controle Bluetooth (inclusive Joy-Con) no celular, e no modo
2 Jogadores um jogador usa a tela de toque e o outro um controle.

## iPhone e iPad (app de tela inicial)

O iOS não instala APK. No iPhone, o jogo roda como **app web de tela inicial**:

1. Abra o endereço do jogo no **Safari**: https://diogohsferraz.github.io/edge/kart/web/
   (depois de publicado no GitHub Pages).
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. Abra o **Kart Turbo** pelo ícone: ele roda em tela cheia e, depois da primeira vez,
   funciona até sem internet.

Os controles são os mesmos do celular Android (botões na tela ou inclinação). Na primeira vez
que escolher a inclinação, o iPhone pede permissão para usar o sensor de movimento. Controles
Bluetooth também funcionam (o iOS 16 ou mais novo aceita Joy-Con e Pro Controller; ligue
**Opções → Botões estilo Nintendo** se o A e o B ficarem trocados).

Um app nativo para a App Store exigiria um Mac com Xcode e uma conta de desenvolvedor Apple.

## Controles

| Ação | Controle (Bluetooth/USB) | Controle remoto do projetor | Teclado (PC) J1 / J2 |
|---|---|---|---|
| Virar | Analógico ou direcional | ◀ ▶ | Setas / A D |
| Acelerar | A ou R2 | automático | ↑ / W |
| Frear / ré | B ou L2 | ▼ | ↓ / S |
| Drift / manobra no ar | R1 (segurar) | ▲ (segurar) | Espaço / Q |
| Usar item | X, Y ou L1 | OK | X / E |
| Pausar | Start | Voltar | P / T |

### Controles do Nintendo Switch (Joy-Con e Pro Controller)

1. No projetor, abra **Configurações → Bluetooth** (ou *Controle remoto e acessórios*) e procure dispositivos.
2. No Joy-Con, segure o botãozinho redondo de sincronizar (na lateral, entre SL e SR) até as luzes
   correrem. No Pro Controller, o botão fica em cima, ao lado do USB-C.
3. Escolha o modo em **Opções → Joy-Con**:
   - **Juntos (1 jogador)**: o Joy-Con esquerdo e o direito funcionam como um controle só.
     Analógico vira, **A/ZR** acelera, **B/ZL** freia, **R** faz drift, **X/Y/L** usa item e **+/−** pausa.
     Com quatro Joy-Cons, os pares se formam na ordem em que foram conectados (esquerdo e direito
     do jogador 1 primeiro).
   - **Separados, deitados (1 por jogador)**: cada Joy-Con é o controle de um jogador, segurado na
     horizontal. O jogo gira o analógico e os botões: o botão da direita acelera, o de baixo freia,
     **SR** faz drift, **SL** usa item e **+/−** pausa. Ideal para 2 jogadores com um par de Joy-Con.
4. O A e o B já seguem o padrão da Nintendo automaticamente. Use **Opções → Testar controle** para
   ver o que o projetor recebe de cada botão e quais Joy-Cons estão em par.

Pro Controller e controles conjugados no grip com cabo funcionam como um controle comum.

Se o Android não identificar qual Joy-Con é o esquerdo e qual é o direito, use
**Opções → Juntar 2 controles**: aperte um botão no esquerdo e depois no direito. Em corridas de
**1 jogador**, todos os controles conectados pilotam o mesmo kart, então o par funciona mesmo sem isso.

O suporte do Android aos controles da Nintendo depende da versão do sistema. No Android 12
ou mais novo, Joy-Con e Pro Controller funcionam bem. Em versões mais antigas, o Pro Controller
costuma funcionar, mas um Joy-Con sozinho pode parear com o analógico "deitado" (virar
vira subir e descer). Nesse caso, a tela *Testar controle* mostra o que chega, e dá para ajustar.

Para jogar em dois: em **2 Jogadores**, o segundo jogador aperta OK/A no próprio controle.
Cada jogador precisa de um dispositivo (por exemplo, um controle Bluetooth e o controle
remoto, ou dois controles).

Se a imagem engasgar, use **Opções → Qualidade gráfica → Baixa**.

## Como foi feito

O jogo é HTML5 + WebGL ([three.js](https://threejs.org) r149, licença MIT, em `web/lib/`)
dentro de um app Android mínimo (`android/`), que abre a página em tela cheia e repassa
controles e controle remoto para o JavaScript, identificando cada dispositivo.

```
kart/
  KartTurbo.apk           APK pronto para instalar
  web/                    o jogo (abre em qualquer navegador)
    js/tracks-data.js     traçado das pistas
    js/track.js           geração 3D das pistas
    js/kart.js            pilotos, física e CPU
    js/race.js            regras da corrida, itens, câmeras e HUD
    js/menu.js, main.js   menus e laço principal
    js/input.js           controles, controle remoto e teclado
    js/sound.js           sons sintetizados
  android/                app Android (WebView) e script de build
  tools/validate-tracks.js  confere se as pistas não se cruzam
```

### Testar no PC

```bash
cd kart/web && python3 -m http.server 8000
# abra http://localhost:8000
```

### Gerar o APK de novo

Precisa de Docker (usa a imagem `cimg/android`, com o SDK do Android):

```bash
kart/android/build.sh
```

O APK é assinado com `android/kart.keystore` (chave de teste, senha `kartturbo`). Use
sempre a mesma chave, senão o Android não instala a atualização por cima da versão antiga.
