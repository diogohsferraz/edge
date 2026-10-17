/* Inicialização, telas do jogo e laço principal. */
(function () {
  var el = Menu.el;
  var canvas = document.getElementById('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  var settings = loadSettings();
  var session = { players: [], trackIndex: 0, difficulty: '100' };
  var race = null;
  var menuScene = null;

  function loadSettings() {
    var s = { autoAccel: false, quality: 'medium', sound: true, music: true, nintendo: false, steer: 'buttons' };
    try { var saved = JSON.parse(localStorage.getItem('kart_settings')); if (saved) for (var k in saved) s[k] = saved[k]; } catch (e) { /* sem armazenamento */ }
    return s;
  }
  function saveSettings() {
    try { localStorage.setItem('kart_settings', JSON.stringify(settings)); } catch (e) { /* ok */ }
    applySettings();
  }
  function applySettings() {
    var scale = { low: 0.6, medium: 0.8, high: 1 }[settings.quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * scale);
    resize();
    Sound.setEnabled(settings.sound);
    Sound.setMusic(settings.music);
    Input.setNintendo(settings.nintendo);
  }
  function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); }
  window.addEventListener('resize', resize);

  /* ---------- Cenário de fundo dos menus ---------- */
  function buildMenuScene() {
    var def = TRACK_DEFS[session.trackIndex % TRACK_DEFS.length];
    var sc = new THREE.Scene();
    var track = new Track(def, 'low');
    sc.background = new THREE.Color(track.theme.sky);
    sc.fog = new THREE.Fog(track.theme.fog, 60, 260);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x6b8f4e, 0.8));
    var sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(80, 150, 40); sc.add(sun);
    sc.add(track.group);
    var karts = [0, 1, 2].map(function (i) {
      var k = new Kart(CHARACTERS[(i * 3) % CHARACTERS.length], { diff: DIFFICULTY['100'] });
      var s = track.sample(i * 40);
      k.x = s.x + s.nx * (i - 1) * 4; k.z = s.z + s.nz * (i - 1) * 4; k.heading = s.h;
      var p = track.project(k.x, k.z); k.idx = p.idx; k.lastS = p.s; k.y = p.y;
      k.ai.skill = 0.6; k.maxSpeed = 20;
      sc.add(k.mesh.root);
      return k;
    });
    var cam = new THREE.PerspectiveCamera(60, 1, 0.5, 400);
    var fake = { track: track, karts: karts, hazards: [], humanLeadDist: function () { return null; }, rankOf: function () { return 1; },
      someoneBehind: function () { return false; }, someoneAhead: function () { return false; }, useItem: function () {} };
    return { scene: sc, track: track, karts: karts, cam: cam, fake: fake, t: 0 };
  }
  function disposeScene(s) {
    s.scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); });
  }
  function stepMenuScene(dt) {
    var m = menuScene;
    m.t += dt;
    m.karts.forEach(function (k) { k.update(dt, k.aiControls(m.fake, dt), m.fake); k.place3d(m.track); });
    var k = m.karts[1];
    var a = m.t * 0.25;
    m.cam.position.set(k.x + Math.sin(a) * 14, k.y + 6, k.z + Math.cos(a) * 14);
    m.cam.lookAt(k.x, k.y + 1, k.z);
    var size = renderer.getSize(new THREE.Vector2());
    m.cam.aspect = size.x / size.y; m.cam.updateProjectionMatrix();
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.render(m.scene, m.cam);
  }

  /* ---------- Telas ---------- */
  function title() {
    if (!menuScene) menuScene = buildMenuScene();
    var s = new Menu.Screen({ cls: 'title', back: function () { if (window.AndroidApp) confirmExit(); } });
    var logo = el('div', 'logo'); logo.innerHTML = 'KART<span>TURBO</span>';
    s.root.appendChild(logo);
    var box = el('div', 'menu-col');
    s.root.appendChild(box);
    [
      ['1 Jogador', function (e) { session.players = [{ deviceId: e.device }]; chooseChars(); }],
      ['2 Jogadores', function (e) { session.players = [{ deviceId: e.device }]; joinP2(); }],
      ['Opções', options],
      ['Como jogar', help]
    ].concat(window.AndroidApp ? [['Sair', confirmExit]] : []).forEach(function (b) {
      var it = Menu.button(b[0], b[1]);
      box.appendChild(it.el);
      s.add([it]);
    });
    s.root.appendChild(el('div', 'foot', 'Use as setas e OK (ou A) para escolher'));
    Menu.show(s);
    Sound.startMusic();
  }

  function confirmExit() {
    var s = new Menu.Screen({ cls: 'dialog', back: title });
    s.root.appendChild(el('h2', '', 'Sair do jogo?'));
    var row = el('div', 'menu-row');
    var no = Menu.button('Não', title), yes = Menu.button('Sim', function () { window.AndroidApp.exit(); });
    row.appendChild(no.el); row.appendChild(yes.el);
    s.root.appendChild(row);
    s.add([no, yes]);
    Menu.show(s);
  }

  function joinP2() {
    var p1 = session.players[0].deviceId;
    var s = new Menu.Screen({
      cls: 'dialog',
      back: function (e) { if (e.device === p1) title(); },
      handle: function (e) {
        if (e.action === 'ok' && e.device !== p1) {
          Sound.play('confirm');
          session.players.push({ deviceId: e.device });
          chooseChars();
          return true;
        }
        if (e.action === 'ok') return true;
        return false;
      }
    });
    s.root.appendChild(el('h2', '', 'Jogador 2'));
    s.root.appendChild(el('p', 'big', 'Aperte OK ou A no segundo controle'));
    s.root.appendChild(el('p', 'muted', 'Jogador 1: ' + Input.describe(p1) + '. Cada jogador precisa do seu controle. No PC, o Jogador 2 usa WASD e aperta E.'));
    s.root.appendChild(el('p', 'muted', 'Voltar: B ou Voltar no controle do Jogador 1'));
    Menu.show(s);
  }

  function chooseChars() {
    var players = session.players;
    var cursors = players.map(function (p, i) { return { i: i === 0 ? 0 : 1, done: false }; });
    var s = new Menu.Screen({ cls: 'chars' });
    s.root.appendChild(el('h2', '', players.length > 1 ? 'Escolham seus pilotos' : 'Escolha seu piloto'));
    var grid = el('div', 'char-grid');
    s.root.appendChild(grid);
    var cards = CHARACTERS.map(function (ch) {
      var card = el('div', 'char');
      var hex = '#' + ch.color.toString(16).padStart(6, '0'), suit = '#' + ch.suit.toString(16).padStart(6, '0');
      card.innerHTML = '<div class="helmet" style="background:' + hex + ';box-shadow:inset 0 -14px 0 ' + suit + '"><div class="visor"></div></div>' +
        '<div class="cname"></div>' + bars(ch) + '<div class="tags"></div>';
      card.querySelector('.cname').textContent = ch.name;
      grid.appendChild(card);
      return card;
    });
    var status = el('p', 'muted', '');
    s.root.appendChild(status);
    function bars(ch) {
      function b(lbl, v) { var w = Math.round(50 + (v - 0.9) * 350); return '<div class="stat"><span>' + lbl + '</span><i style="width:' + Math.max(15, Math.min(100, w)) + '%"></i></div>'; }
      return b('Velocidade', ch.speed) + b('Aceleração', ch.accel) + b('Curvas', ch.handling);
    }
    function draw() {
      cards.forEach(function (c, ci) {
        var tags = c.querySelector('.tags');
        tags.innerHTML = '';
        c.className = 'char';
        cursors.forEach(function (cu, pi) {
          if (cu.i === ci) {
            c.classList.add('p' + (pi + 1));
            if (cu.done) c.classList.add('done');
            var t = el('span', 'tag p' + (pi + 1), 'J' + (pi + 1) + (cu.done ? ' ✓' : ''));
            tags.appendChild(t);
          }
        });
      });
      status.textContent = players.length > 1 ? 'Cada jogador escolhe com o seu controle e confirma com OK.' : 'OK confirma, Voltar retorna.';
    }
    s.opts.handle = function (e) {
      var pi = players.map(function (p) { return p.deviceId; }).indexOf(e.device);
      if (pi < 0) return true;
      var cu = cursors[pi];
      if (e.action === 'back') {
        if (cu.done) cu.done = false;
        else if (pi === 0) { title(); return true; }
        Sound.play('back');
      } else if (!cu.done) {
        var cols = 4;
        if (e.action === 'left' && cu.i % cols > 0) cu.i--;
        if (e.action === 'right' && cu.i % cols < cols - 1) cu.i++;
        if (e.action === 'up' && cu.i >= cols) cu.i -= cols;
        if (e.action === 'down' && cu.i + cols < CHARACTERS.length) cu.i += cols;
        if (['left', 'right', 'up', 'down'].indexOf(e.action) >= 0) Sound.play('select');
        if (e.action === 'ok') {
          var taken = cursors.some(function (o, oi) { return oi !== pi && o.done && o.i === cu.i; });
          if (!taken) { cu.done = true; Sound.play('confirm'); }
        }
      }
      draw();
      if (cursors.every(function (c) { return c.done; })) {
        players.forEach(function (p, i) { p.charId = CHARACTERS[cursors[i].i].id; });
        setTimeout(chooseTrack, 250);
      }
      return true;
    };
    cards.forEach(function (c, ci) {
      c.addEventListener('click', function () { cursors[0].i = ci; s.opts.handle({ device: players[0].deviceId, action: 'ok' }); });
    });
    draw();
    Menu.show(s);
  }

  function chooseTrack() {
    var s = new Menu.Screen({ cls: 'tracks', back: chooseChars });
    s.root.appendChild(el('h2', '', 'Escolha a pista'));
    var row = el('div', 'track-row');
    s.root.appendChild(row);
    var items = TRACK_DEFS.map(function (def, i) {
      var card = el('button', 'btn track-card');
      var cv = document.createElement('canvas'); cv.width = 220; cv.height = 150;
      drawTrackOutline(cv.getContext('2d'), sampleTrack(def).samples, 220, 150, 14, 7, '#ffffff');
      card.appendChild(cv);
      card.appendChild(el('div', 'tname', def.name));
      card.appendChild(el('div', 'muted', { beach: 'Praia', mountain: 'Montanha · planador', city: 'Cidade à noite', desert: 'Deserto · rampas', snow: 'Neve · planador' }[def.theme]));
      row.appendChild(card);
      var it = { el: card, ok: function () { session.trackIndex = i; startRace(); } };
      card.addEventListener('click', it.ok);
      return it;
    });
    s.add(items);
    var diff = Menu.selector('Cilindrada', [['50', '50cc (fácil)'], ['100', '100cc (normal)'], ['150', '150cc (rápido)']],
      function () { return session.difficulty; }, function (v) { session.difficulty = v; });
    var auto = Menu.selector('Aceleração automática', [[false, 'Desligada'], [true, 'Ligada']],
      function () { return settings.autoAccel; }, function (v) { settings.autoAccel = v; saveSettings(); });
    var opts = el('div', 'menu-col narrow');
    opts.appendChild(diff.el); opts.appendChild(auto.el);
    s.root.appendChild(opts);
    s.add([diff]); s.add([auto]);
    s.c = session.trackIndex;
    Menu.show(s);
  }

  function options() {
    var s = new Menu.Screen({ cls: 'dialog', back: title });
    s.root.appendChild(el('h2', '', 'Opções'));
    var col = el('div', 'menu-col narrow');
    s.root.appendChild(col);
    var list = [
      Menu.selector('Aceleração automática', [[false, 'Desligada'], [true, 'Ligada']], function () { return settings.autoAccel; }, function (v) { settings.autoAccel = v; saveSettings(); }),
      Menu.selector('Qualidade gráfica', [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']], function () { return settings.quality; }, function (v) { settings.quality = v; saveSettings(); }),
      Menu.selector('Efeitos sonoros', [[true, 'Ligados'], [false, 'Desligados']], function () { return settings.sound; }, function (v) { settings.sound = v; saveSettings(); }),
      Menu.selector('Música', [[true, 'Ligada'], [false, 'Desligada']], function () { return settings.music; }, function (v) { settings.music = v; saveSettings(); }),
      Menu.selector('Botões estilo Nintendo', [[false, 'Não'], [true, 'Sim (A à direita)']], function () { return settings.nintendo; }, function (v) { settings.nintendo = v; saveSettings(); }),
      Menu.selector('Direção no celular', [['buttons', 'Botões na tela'], ['tilt', 'Inclinar o celular']], function () { return settings.steer; }, function (v) { settings.steer = v; saveSettings(); }),
      Menu.button('Testar controle', testPad),
      Menu.button('Voltar', title)
    ];
    list.forEach(function (it) { col.appendChild(it.el); s.add([it]); });
    s.root.appendChild(el('p', 'muted', 'Se o jogo travar no projetor, use a qualidade Baixa. Com Joy-Con ou Pro Controller do Switch, ligue "Botões estilo Nintendo".'));
    Menu.show(s);
  }

  /* Mostra o que cada controle envia: ajuda a configurar Joy-Con e afins. */
  function testPad() {
    var lastBack = 0, timer;
    var s = new Menu.Screen({
      cls: 'dialog',
      handle: function (e) {
        if (e.action === 'back') {
          var now = Date.now();
          if (now - lastBack < 1500) { stop(); options(); }
          lastBack = now;
        }
        return true;
      }
    });
    s.root.appendChild(el('h2', '', 'Testar controle'));
    s.root.appendChild(el('p', 'muted', 'Aperte os botões e mexa os analógicos. Para sair, aperte Voltar (ou B) duas vezes seguidas.'));
    var axes = el('div', 'pad-axes');
    var log = el('div', 'pad-log');
    s.root.appendChild(axes); s.root.appendChild(log);
    var off = Input.onRaw(function (r) {
      if (!r.down) return;
      var line = el('div', '', Input.describe(r.device) + ' [' + r.device + ']: ' + r.label);
      log.insertBefore(line, log.firstChild);
      while (log.childNodes.length > 8) log.removeChild(log.lastChild);
    });
    timer = setInterval(function () {
      axes.textContent = Input.devices().filter(function (id) { var a = Input.axes(id); return a && 'x' in a; }).map(function (id) {
        var a = Input.axes(id), f = function (v) { return (v || 0).toFixed(1); };
        return id + ': analógico ' + f(a.x) + ', ' + f(a.y) + ' · direcional ' + f(a.hx) + ', ' + f(a.hy) + ' · gatilhos ' + f(a.lt) + ', ' + f(a.rt);
      }).join('\n') || 'Nenhum analógico detectado ainda.';
    }, 100);
    function stop() { off(); clearInterval(timer); }
    Menu.show(s);
  }

  function help() {
    var s = new Menu.Screen({ cls: 'dialog help', back: title });
    s.root.appendChild(el('h2', '', 'Como jogar'));
    var t = el('div', 'help-grid');
    t.innerHTML =
      '<div><h3>Controle (Bluetooth/USB, inclusive do Switch)</h3><p><b>Analógico / direcional</b>: virar<br><b>A</b> ou <b>ZR</b>: acelerar<br><b>B</b> ou <b>ZL</b>: frear e dar ré<br><b>R</b> ou <b>SR</b>: drift<br><b>X</b>, <b>Y</b>, <b>L</b> ou <b>SL</b>: usar item<br><b>+</b> ou <b>Start</b>: pausar</p></div>' +
      '<div><h3>Controle remoto do projetor</h3><p><b>◀ ▶</b>: virar<br>Acelera sozinho<br><b>▼</b>: frear<br><b>▲</b> (segurar): drift<br><b>OK</b>: usar item<br><b>Voltar</b>: pausar</p></div>' +
      '<div><h3>Drift com turbo</h3><p>Numa curva, segure o drift virando. As faíscas ficam <b style="color:#3fa9ff">azuis</b>, depois <b style="color:#ff8a2a">laranja</b> e por fim <b style="color:#d25cff">roxas</b>. Solte para ganhar turbo: quanto mais longo o drift, maior o turbo.</p></div>' +
      '<div><h3>Itens (a roleta depende da sua posição)</h3><p>⚡ Nitro (ou ×3) · 🛢️ Óleo · 💣 Bomba que quica · 🚀 Míssil que persegue quem está à frente · 🛡️ Escudo contra um golpe · 🔥 Supercarga: invencível, mais rápido e derruba quem encostar</p></div>' +
      '<div><h3>Moedas, rampas e planador</h3><p>Cada moeda aumenta a velocidade máxima (até 10; perde 3 ao ser atingido). Nas rampas, aperte o drift no ar para uma manobra e ganhe turbo ao pousar. A rampa azul abre o planador. Placas laranja dão turbo.</p></div>' +
      '<div><h3>Celular</h3><p>Acelera sozinho. Botões na tela: <b>◀ ▶</b> viram (ou incline o celular, em Opções), <b>DRIFT</b> (segurar), <b>ITEM</b>, <b>FREIO</b> e <b>❚❚</b> para pausar. Toque nos menus para escolher.</p></div>' +
      '<div><h3>Largada</h3><p>Acelere quando aparecer o <b>1</b> para largar com turbo. Acelerar cedo demais não dá turbo.</p></div>' +
      '<div><h3>Teclado (PC)</h3><p>J1: setas, Espaço (drift), X (item)<br>J2: WASD, Q (drift), E (item)</p></div>';
    s.root.appendChild(t);
    var back = Menu.button('Voltar', title);
    s.root.appendChild(back.el);
    s.add([back]);
    Menu.show(s);
  }

  /* ---------- Corrida ---------- */
  function startRace() {
    Menu.hide();
    if (menuScene) { disposeScene(menuScene); menuScene = null; }
    document.getElementById('loading').classList.remove('hidden');
    setTimeout(function () {
      race = new Race(renderer, {
        trackId: TRACK_DEFS[session.trackIndex].id, difficulty: session.difficulty, settings: settings,
        humans: session.players.map(function (p) { return { deviceId: p.deviceId, charId: p.charId }; })
      });
      race.onEnd = showResults;
      if (session.players.some(function (p) { return p.deviceId === 'touch'; })) Touch.show({ steer: settings.steer });
      document.getElementById('loading').classList.add('hidden');
    }, 30);
  }

  function endRace() {
    Touch.hide();
    if (race) { race.dispose(); race = null; }
  }

  function pause(e) {
    if (!race || race.state === 'done' || race.paused) return;
    race.paused = true;
    Sound.stopEngines();
    var s = new Menu.Screen({ cls: 'dialog', back: resume });
    s.root.appendChild(el('h2', '', 'Pausa'));
    var col = el('div', 'menu-col narrow');
    s.root.appendChild(col);
    [['Continuar', resume], ['Reiniciar corrida', function () { endRace(); startRace(); }], ['Sair para o menu', function () { endRace(); title(); }]].forEach(function (b) {
      var it = Menu.button(b[0], b[1]); col.appendChild(it.el); s.add([it]);
    });
    Menu.show(s);
  }
  function resume() {
    if (!race) return;
    Menu.hide();
    Sound.setEngines(race.players.length);
    Input.clearTaps();
    race.paused = false;
  }

  Input.onMenu(function (e) {
    if (e.handled) return;
    if (race && !race.paused && race.state !== 'done' && !Menu.current() && (e.action === 'pause' || e.action === 'back')) {
      if (race.players.some(function (p) { return p.device === e.device; }) || e.device.indexOf('kb') === 0) pause(e);
    }
  });

  function showResults(results) {
    Touch.hide();
    var s = new Menu.Screen({ cls: 'results', back: function () { endRace(); title(); } });
    s.root.appendChild(el('h2', '', 'Resultado — ' + TRACK_DEFS[session.trackIndex].name));
    var table = el('div', 'result-list');
    results.forEach(function (r) {
      var row = el('div', 'result' + (r.human ? ' human' : ''));
      row.innerHTML = '<span class="rp"></span><span class="rdot"></span><span class="rn"></span><span class="rt"></span>';
      row.querySelector('.rp').textContent = r.place + 'º';
      row.querySelector('.rdot').style.background = '#' + r.color.toString(16).padStart(6, '0');
      row.querySelector('.rn').textContent = r.name + (r.human ? (session.players.length > 1 ? ' (J' + (r.player + 1) + ')' : ' (você)') : '');
      row.querySelector('.rt').textContent = r.time !== null ? fmtTime(r.time) : '—';
      table.appendChild(row);
    });
    s.root.appendChild(table);
    var row = el('div', 'menu-row');
    s.root.appendChild(row);
    var again = Menu.button('Correr de novo', function () { endRace(); startRace(); });
    var next = Menu.button('Próxima pista', function () { endRace(); session.trackIndex = (session.trackIndex + 1) % TRACK_DEFS.length; startRace(); });
    var menu = Menu.button('Menu', function () { endRace(); title(); });
    [again, next, menu].forEach(function (b) { row.appendChild(b.el); });
    s.add([again, next, menu]);
    Menu.show(s);
  }

  /* ---------- Laço principal ---------- */
  var last = performance.now(), acc = 0, STEP = 1 / 60;
  var fpsFrames = 0, fpsTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    Input.poll();
    if (race) {
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 6) { race.step(STEP); acc -= STEP; n++; }
      if (n === 6) acc = 0;
      race.render(dt);
    } else if (menuScene) {
      stepMenuScene(dt);
    }
    fpsFrames++; fpsTime += dt;
    if (fpsTime > 1) { window.__fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; }
  }

  window.__onAppPause = function () { pause(); };
  window.__game = { settings: settings, session: session, get race() { return race; }, startRace: startRace, title: title };
  applySettings();
  document.getElementById('loading').classList.add('hidden');
  title();
  requestAnimationFrame(frame);
})();
