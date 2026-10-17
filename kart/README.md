# Kart Turbo

Jogo de kart 3D original (personagens, pistas e visual próprios) para Android, feito
para rodar no projetor **Wanbo Cube 2** e em outras TVs/projetores Android. Também roda
no navegador do PC.

- 3 pistas: **Circuito Coqueiral** (praia), **Vale Neblina** (montanha) e **Cidade Neon** (noite)
- 8 pilotos com atributos diferentes (velocidade, aceleração e curvas)
- Corrida de 3 voltas contra a CPU, com 3 dificuldades
- **Drift com turbo** (faíscas azuis e laranja) e turbo de largada
- Itens: ⚡ Nitro, 🛢️ Óleo, 💣 Bomba (quica nas barreiras) e 🚀 Míssil (persegue quem está à frente)
- **2 jogadores em tela dividida**, um controle para cada
- Funciona com controle Bluetooth/USB e com o **controle remoto do projetor** (aceleração automática)

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

## Controles

| Ação | Controle (Bluetooth/USB) | Controle remoto do projetor | Teclado (PC) J1 / J2 |
|---|---|---|---|
| Virar | Analógico ou direcional | ◀ ▶ | Setas / A D |
| Acelerar | A ou R2 | automático | ↑ / W |
| Frear / ré | B ou L2 | ▼ | ↓ / S |
| Drift | R1 (segurar) | ▲ (segurar) | Espaço / Q |
| Usar item | X, Y ou L1 | OK | X / E |
| Pausar | Start | Voltar | P / T |

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
