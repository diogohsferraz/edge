/*
 * Entrada unificada. Cada dispositivo (teclado, controle, controle remoto)
 * vira um id; o jogo associa ids a jogadores.
 *  - 'kb1' / 'kb2': duas metades do teclado (testes no PC)
 *  - 'gpN': controles pela Gamepad API do navegador
 *  - 'aN': dispositivos Android repassados pela MainActivity (NativeInput)
 */
var Input = (function () {
  var devices = {};
  var listeners = [];
  var rawListeners = [];
  var lastDevice = 'kb1';
  // Controles da Nintendo têm A à direita e B embaixo: com a opção ligada, trocamos A/B e X/Y.
  var nintendo = false;

  // Códigos de tecla do Android (KeyEvent.KEYCODE_*)
  var K = { UP: 19, DOWN: 20, LEFT: 21, RIGHT: 22, CENTER: 23, ENTER: 66, BACK: 4, ESC: 111, MENU: 82,
    A: 96, B: 97, X: 99, Y: 100, L1: 102, R1: 103, L2: 104, R2: 105, START: 108, SELECT: 109, MODE: 110, SPACE: 62 };
  var NAMES = { 19: '↑', 20: '↓', 21: '◀', 22: '▶', 23: 'OK', 66: 'Enter', 4: 'Voltar', 96: 'A', 97: 'B', 99: 'X', 100: 'Y',
    102: 'L / SL', 103: 'R / SR', 104: 'ZL / L2', 105: 'ZR / R2', 106: 'L3', 107: 'R3', 108: '+ / Start', 109: '− / Select', 110: 'Home', 82: 'Menu' };
  var SWAP = { 96: 97, 97: 96, 99: 100, 100: 99 };

  /*
   * Joy-Con. O Android mostra cada Joy-Con como um controle separado.
   *  - 'pair':   Juntos. Esquerdo + direito formam um controle só (um jogador).
   *  - 'single': Separados na horizontal. Cada Joy-Con é um jogador; giramos analógico e botões.
   * Os códigos do Android são por posição: 96 = baixo, 97 = direita, 99 = cima, 100 = esquerda.
   */
  var joyMode = 'pair';
  var links = {}; // id físico -> id do parceiro
  var ROT = {
    L: { 19: 100, 20: 97, 21: 96, 22: 99 },      // Joy-Con esquerdo deitado: o direcional vira A/B/X/Y
    R: { 99: 97, 97: 96, 96: 100, 100: 99 }      // Joy-Con direito deitado
  };
  function joySide(name, vendor, product) {
    var n = String(name || '').toLowerCase();
    if (product === 0x2006 || /joy-?con.*\(l\)|left joy-?con|joy-?con l\b/.test(n)) return 'L';
    if (product === 0x2007 || /joy-?con.*\(r\)|right joy-?con|joy-?con r\b/.test(n)) return 'R';
    return null;
  }
  function relink() {
    links = {};
    if (joyMode !== 'pair') return;
    var Ls = [], Rs = [];
    Object.keys(devices).sort(function (a, b) { return devices[a].seen - devices[b].seen; }).forEach(function (id) {
      var d = devices[id];
      if (d.side === 'L') Ls.push(id); else if (d.side === 'R') Rs.push(id);
    });
    for (var i = 0; i < Math.min(Ls.length, Rs.length); i++) { links[Ls[i]] = Rs[i]; links[Rs[i]] = Ls[i]; }
  }
  /** Id usado pelo jogo: num par de Joy-Con, o id do esquerdo representa os dois. */
  function canonical(id) {
    var p = links[id];
    if (!p) return id;
    return devices[id].side === 'L' ? id : p;
  }
  var seenCounter = 0;
  function raw(id, label, down) {
    for (var i = 0; i < rawListeners.length; i++) rawListeners[i]({ device: id, label: label, down: down });
  }

  function device(id, kind) {
    var d = devices[id];
    if (!d) d = devices[id] = { id: id, kind: kind || 'keyboard', keys: {}, taps: {}, axes: {}, menuAxis: { x: 0, y: 0 }, seen: ++seenCounter };
    if (kind === 'gamepad') d.kind = 'gamepad';
    return d;
  }

  function emit(id, action) {
    lastDevice = id;
    if (window.Sound) Sound.unlock();
    var e = { device: id, action: action };
    for (var i = 0; i < listeners.length; i++) listeners[i](e);
  }

  /* ---------- Teclado ---------- */
  var KB = {
    kb1: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: ['Enter', 'NumpadEnter'], back: ['Escape', 'Backspace'],
      drift: ['Space', 'ShiftRight'], item: ['KeyX', 'ControlRight'], pause: ['KeyP'] },
    kb2: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', ok: ['KeyE'], back: ['KeyR'],
      drift: ['KeyQ', 'ShiftLeft'], item: ['KeyE'], pause: ['KeyT'] }
  };
  function kbOwner(code) {
    for (var id in KB) {
      var m = KB[id];
      for (var k in m) {
        var v = m[k];
        if (v === code || (Array.isArray(v) && v.indexOf(code) >= 0)) return id;
      }
    }
    return null;
  }
  function kbAction(id, code) {
    var m = KB[id];
    if (code === m.up) return 'up';
    if (code === m.down) return 'down';
    if (code === m.left) return 'left';
    if (code === m.right) return 'right';
    if (m.ok.indexOf(code) >= 0) return 'ok';
    if (m.back.indexOf(code) >= 0) return 'back';
    if (m.pause.indexOf(code) >= 0) return 'pause';
    return null;
  }
  window.addEventListener('keydown', function (e) {
    var id = kbOwner(e.code);
    if (!id) return;
    e.preventDefault();
    var d = device(id, 'keyboard');
    if (!d.keys[e.code]) d.taps[e.code] = true;
    d.keys[e.code] = true;
    if (!e.repeat || /Arrow|Key[WASD]/.test(e.code)) {
      var a = kbAction(id, e.code);
      if (a) emit(id, a);
    }
  });
  window.addEventListener('keyup', function (e) {
    var id = kbOwner(e.code);
    if (id) device(id).keys[e.code] = false;
  });
  window.addEventListener('blur', function () {
    for (var id in devices) devices[id].keys = {};
  });

  /* ---------- Android (chamado pela MainActivity) ---------- */
  function androidAction(code) {
    switch (code) {
      case K.UP: return 'up';
      case K.DOWN: return 'down';
      case K.LEFT: return 'left';
      case K.RIGHT: return 'right';
      case K.CENTER: case K.ENTER: case K.A: case K.SPACE: return 'ok';
      case K.BACK: case K.B: case K.ESC: return 'back';
      case K.START: case K.MENU: case K.SELECT: return 'pause';
      default: return null;
    }
  }
  function setKey(id, d, code, down, isPad, repeat) {
    // Controles da Nintendo (fabricante 057e) usam o padrão da Nintendo automaticamente.
    if (isPad && (nintendo || d.vendor === 0x057e) && SWAP[code]) code = SWAP[code];
    if (!repeat) raw(id, (NAMES[code] || 'tecla ' + code) + (isPad ? '' : ' (remoto)'), !!down);
    if (!repeat) { if (down && !d.keys[code]) d.taps[code] = true; d.keys[code] = !!down; }
    if (down) {
      var a = androidAction(code);
      if (a && (!repeat || ['up', 'down', 'left', 'right'].indexOf(a) >= 0)) emit(canonical(id), a);
    }
  }
  window.NativeInput = {
    /** Nome e ids do dispositivo, enviados pela MainActivity no primeiro evento de cada um. */
    info: function (devId, name, vendor, product) {
      var d = device('a' + devId);
      d.name = name; d.vendor = vendor; d.product = product;
      d.side = joySide(name, vendor, product);
      if (d.side) { d.kind = 'gamepad'; relink(); }
    },
    key: function (devId, code, down, isPad, repeat) {
      var id = 'a' + devId;
      var d = device(id, isPad ? 'gamepad' : 'remote');
      if (joyMode === 'single' && d.side && ROT[d.side][code]) code = ROT[d.side][code];
      setKey(id, d, code, down, isPad, repeat);
      return true;
    },
    axis: function (devId, x, y, hx, hy, lt, rt) {
      var id = 'a' + devId;
      var d = device(id, 'gamepad');
      if (joyMode === 'single' && d.side) {
        // Deitado: o eixo vertical do analógico vira o horizontal.
        var nx = d.side === 'L' ? y : -y, ny = d.side === 'L' ? -x : x;
        x = nx; y = ny;
        // No esquerdo, o direcional (hat) são os botões de ação.
        if (d.side === 'L') {
          var want = { 99: hx > 0.5, 97: hy > 0.5, 96: hx < -0.5, 100: hy < -0.5 };
          for (var c in want) if (!!d.keys[ROTATED_HAT_MARK + c] !== want[c]) { d.keys[ROTATED_HAT_MARK + c] = want[c]; setKey(id, d, +c, want[c], true, false); }
          hx = 0; hy = 0;
        } else {
          var t = hx; hx = -hy; hy = t;
        }
      }
      d.axes = { x: x, y: y, hx: hx, hy: hy, lt: lt, rt: rt };
      stickToMenu(canonical(id), d, Math.abs(hx) > 0.5 ? hx : x, Math.abs(hy) > 0.5 ? hy : y);
    }
  };
  var ROTATED_HAT_MARK = 'hat';

  function stickToMenu(id, d, x, y) {
    var mx = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
    var my = y > 0.6 ? 1 : y < -0.6 ? -1 : 0;
    if (mx !== d.menuAxis.x && mx) emit(id, mx > 0 ? 'right' : 'left');
    if (my !== d.menuAxis.y && my) emit(id, my > 0 ? 'down' : 'up');
    d.menuAxis.x = mx; d.menuAxis.y = my;
  }

  /* ---------- Gamepad API (PC e navegadores) ---------- */
  function poll() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.connected) continue;
      var id = 'gp' + p.index;
      var d = device(id, 'gamepad');
      var prev = d.buttons || [];
      var b = p.buttons.map(function (x) { return x.pressed || x.value > 0.5; });
      if (nintendo) { var t0 = b[0]; b[0] = b[1]; b[1] = t0; var t2 = b[2]; b[2] = b[3]; b[3] = t2; }
      d.buttons = b;
      for (var ri = 0; ri < b.length; ri++) if (b[ri] !== !!prev[ri]) raw(id, ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', '↑', '↓', '◀', '▶', 'Home'][ri] || 'botão ' + ri, b[ri]);
      for (var bi = 0; bi < b.length; bi++) if (b[bi] && !prev[bi]) d.taps['b' + bi] = true;
      d.axes = { x: p.axes[0] || 0, y: p.axes[1] || 0, hx: 0, hy: 0, lt: p.buttons[6] ? p.buttons[6].value : 0, rt: p.buttons[7] ? p.buttons[7].value : 0 };
      var map = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'ok', 1: 'back', 9: 'pause' };
      for (var k in map) if (b[k] && !prev[k]) emit(id, map[k]);
      stickToMenu(id, d, d.axes.x, d.axes.y);
    }
  }

  /* ---------- Comandos de pilotagem ---------- */
  function dz(v) { return Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8; }

  function controls(id, autoAccel) {
    var c = { steer: 0, accel: false, brake: false, drift: false, item: false };
    var d = devices[id];
    if (!d) return c;
    // Toques rápidos (apertou e soltou entre dois passos) contam como pressionados.
    var k = {}, a = d.axes || {};
    for (var key in d.keys) k[key] = d.keys[key];
    for (key in d.taps) k[key] = true;
    d.taps = {};
    // Par de Joy-Con: junta botões e usa o analógico que estiver mais inclinado.
    var partner = links[id] && devices[links[id]];
    if (partner) {
      for (key in partner.keys) if (partner.keys[key]) k[key] = true;
      for (key in partner.taps) k[key] = true;
      partner.taps = {};
      var pa = partner.axes || {};
      a = {
        x: Math.abs(pa.x || 0) > Math.abs(a.x || 0) ? pa.x : a.x, y: a.y,
        hx: Math.abs(pa.hx || 0) > Math.abs(a.hx || 0) ? pa.hx : a.hx, hy: a.hy,
        lt: Math.max(a.lt || 0, pa.lt || 0), rt: Math.max(a.rt || 0, pa.rt || 0)
      };
    }
    if (id === 'touch') {
      // Controles na tela do celular (ver touch.js). Acelera sozinho.
      c.steer = d.tilt !== undefined && d.tilt !== null ? d.tilt : (k.right ? 1 : 0) - (k.left ? 1 : 0);
      c.brake = !!k.brake;
      c.drift = !!k.drift;
      c.item = !!k.item;
      c.accel = !c.brake;
      return c;
    } else if (id === 'kb1' || id === 'kb2') {
      var m = KB[id];
      c.steer = (k[m.right] ? 1 : 0) - (k[m.left] ? 1 : 0);
      c.accel = !!k[m.up];
      c.brake = !!k[m.down];
      c.drift = m.drift.some(function (x) { return k[x]; });
      c.item = m.item.some(function (x) { return k[x]; });
    } else if (id.indexOf('gp') === 0) {
      var b = (d.buttons || []).slice();
      for (var t in k) if (t.charAt(0) === 'b' && k[t]) b[+t.slice(1)] = true;
      c.steer = dz(a.x) || ((b[15] ? 1 : 0) - (b[14] ? 1 : 0));
      c.accel = !!(b[0] || a.rt > 0.3);
      c.brake = !!(b[1] || a.lt > 0.3);
      c.drift = !!b[5];
      c.item = !!(b[2] || b[3] || b[4]);
    } else if (d.kind === 'gamepad') {
      c.steer = dz(a.x || 0) || (Math.abs(a.hx || 0) > 0.5 ? Math.sign(a.hx) : 0) || ((k[K.RIGHT] ? 1 : 0) - (k[K.LEFT] ? 1 : 0));
      c.accel = !!(k[K.A] || k[K.R2] || (a.rt || 0) > 0.3);
      c.brake = !!(k[K.B] || k[K.L2] || (a.lt || 0) > 0.3);
      c.drift = !!k[K.R1];
      c.item = !!(k[K.X] || k[K.Y] || k[K.L1]);
    } else {
      // Controle remoto do projetor: setas + OK. Acelera sozinho.
      c.steer = (k[K.RIGHT] ? 1 : 0) - (k[K.LEFT] ? 1 : 0);
      c.brake = !!k[K.DOWN];
      c.drift = !!k[K.UP];
      c.item = !!(k[K.CENTER] || k[K.ENTER]);
      c.accel = !c.brake;
    }
    if (autoAccel && !c.brake) c.accel = true;
    return c;
  }

  function describe(id) {
    if (id === 'kb1') return 'Teclado (setas)';
    if (id === 'kb2') return 'Teclado (WASD)';
    if (id === 'touch') return 'Tela de toque';
    var d = devices[id];
    if (d && links[id]) return 'Par de Joy-Con';
    if (d && d.side) return 'Joy-Con ' + (d.side === 'L' ? 'esquerdo' : 'direito') + (joyMode === 'single' ? ' (deitado)' : '');
    if (d && d.kind === 'gamepad') return d.name ? String(d.name) : 'Controle';
    return 'Controle remoto';
  }

  return {
    onMenu: function (fn) { listeners.push(fn); },
    onRaw: function (fn) { rawListeners.push(fn); return function () { rawListeners.splice(rawListeners.indexOf(fn), 1); }; },
    setNintendo: function (v) { nintendo = !!v; },
    setJoyMode: function (m) { joyMode = m === 'single' ? 'single' : 'pair'; for (var id in devices) devices[id].keys = {}; relink(); },
    joyCons: function () {
      return Object.keys(devices).filter(function (id) { return devices[id].side; }).map(function (id) {
        return { id: id, side: devices[id].side, partner: links[id] || null, name: devices[id].name };
      });
    },
    canonical: canonical,
    axes: function (id) { var d = devices[id]; return d ? d.axes : null; },
    devices: function () { return Object.keys(devices); },
    clearTaps: function () { for (var id in devices) devices[id].taps = {}; },
    controls: controls,
    poll: poll,
    describe: describe,
    last: function () { return lastDevice; },
    /** Dispositivo virtual da tela de toque: botões viram teclas com nomes. */
    touch: function (name, down) {
      var d = device('touch', 'touch');
      if (down && !d.keys[name]) d.taps[name] = true;
      d.keys[name] = !!down;
      lastDevice = 'touch';
    },
    setTilt: function (v) { device('touch', 'touch').tilt = v; },
    markTouch: function () { lastDevice = 'touch'; },
    emit: emit,
    kind: function (id) { var d = devices[id]; return d ? d.kind : 'keyboard'; }
  };
})();
