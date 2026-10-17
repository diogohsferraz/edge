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
  var lastDevice = 'kb1';

  // Códigos de tecla do Android (KeyEvent.KEYCODE_*)
  var K = { UP: 19, DOWN: 20, LEFT: 21, RIGHT: 22, CENTER: 23, ENTER: 66, BACK: 4, ESC: 111, MENU: 82,
    A: 96, B: 97, X: 99, Y: 100, L1: 102, R1: 103, L2: 104, R2: 105, START: 108, SELECT: 109, SPACE: 62 };

  function device(id, kind) {
    var d = devices[id];
    if (!d) d = devices[id] = { id: id, kind: kind || 'keyboard', keys: {}, taps: {}, axes: {}, menuAxis: { x: 0, y: 0 } };
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
      case K.START: case K.MENU: return 'pause';
      default: return null;
    }
  }
  window.NativeInput = {
    key: function (devId, code, down, isPad, repeat) {
      var id = 'a' + devId;
      var d = device(id, isPad ? 'gamepad' : 'remote');
      if (!repeat) { if (down && !d.keys[code]) d.taps[code] = true; d.keys[code] = !!down; }
      if (down) {
        var a = androidAction(code);
        if (a && (!repeat || ['up', 'down', 'left', 'right'].indexOf(a) >= 0)) emit(id, a);
      }
      return true;
    },
    axis: function (devId, x, y, hx, hy, lt, rt) {
      var id = 'a' + devId;
      var d = device(id, 'gamepad');
      d.axes = { x: x, y: y, hx: hx, hy: hy, lt: lt, rt: rt };
      stickToMenu(id, d, Math.abs(hx) > 0.5 ? hx : x, Math.abs(hy) > 0.5 ? hy : y);
    }
  };

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
      d.buttons = b;
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
    if (id === 'kb1' || id === 'kb2') {
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
    var d = devices[id];
    if (d && d.kind === 'gamepad') return 'Controle';
    return 'Controle remoto';
  }

  return {
    onMenu: function (fn) { listeners.push(fn); },
    clearTaps: function () { for (var id in devices) devices[id].taps = {}; },
    controls: controls,
    poll: poll,
    describe: describe,
    last: function () { return lastDevice; },
    kind: function (id) { var d = devices[id]; return d ? d.kind : 'keyboard'; }
  };
})();
