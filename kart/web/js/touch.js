/* Controles na tela para celular: botões de direção (ou inclinação), drift, item, freio e pausa. */
var Touch = (function () {
  var layer = null, tiltOn = false, tiltZero = null;
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

  // Qualquer toque nos menus faz o celular virar o "controle" do jogador 1.
  window.addEventListener('touchstart', function () { Input.markTouch(); if (window.Sound) Sound.unlock(); }, { passive: true });
  // No iPhone o áudio só libera dentro de um toque concluído.
  window.addEventListener('touchend', function () { if (window.Sound) Sound.unlock(); }, { passive: true });

  /** iOS 13+: a inclinação precisa de permissão, pedida dentro de um toque. */
  function requestTilt() {
    var D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      return D.requestPermission().then(function (r) { return r === 'granted'; }).catch(function () { return false; });
    }
    return Promise.resolve(true);
  }

  function button(cls, label, name) {
    var b = document.createElement('div');
    b.className = 'tbtn ' + cls;
    b.innerHTML = label;
    var active = {};
    function down(e) {
      e.preventDefault();
      active[e.pointerId] = true;
      try { b.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
      b.classList.add('on');
      if (name === 'pause') Input.emit('touch', 'pause'); else Input.touch(name, true);
    }
    function up(e) {
      delete active[e.pointerId];
      if (Object.keys(active).length) return;
      b.classList.remove('on');
      if (name !== 'pause') Input.touch(name, false);
    }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    return b;
  }

  var tiltSeen = false;
  function onTilt(e) {
    if (e.beta !== null && e.beta !== undefined) tiltSeen = true;
    if (!tiltOn || e.beta === null) return;
    var angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    if (angle === -90) angle = 270;
    var v = angle === 90 ? e.beta : angle === 270 || angle === -90 ? -e.beta : e.gamma;
    if (tiltZero === null) tiltZero = v;
    var steer = (v - tiltZero) / 22;
    Input.setTilt(Math.max(-1, Math.min(1, Math.abs(steer) < 0.08 ? 0 : steer)));
  }
  window.addEventListener('deviceorientation', onTilt);

  function show(opts) {
    hide();
    tiltOn = opts.steer === 'tilt';
    tiltZero = null;
    Input.setTilt(tiltOn ? 0 : null);
    layer = document.createElement('div');
    layer.id = 'touch';
    if (!tiltOn) {
      var left = document.createElement('div');
      left.className = 'tpad left';
      left.appendChild(button('dir', '◀', 'left'));
      left.appendChild(button('dir', '▶', 'right'));
      layer.appendChild(left);
    } else {
      var hint = document.createElement('div');
      hint.className = 'thint';
      hint.textContent = 'Incline o celular para virar';
      layer.appendChild(hint);
      setTimeout(function () { hint.style.opacity = 0; }, 3000);
      // Sem sensor (ou sem permissão): volta para os botões na tela.
      setTimeout(function () { if (tiltOn && !tiltSeen && layer) show({ steer: 'buttons' }); }, 2500);
    }
    var right = document.createElement('div');
    right.className = 'tpad right';
    right.appendChild(button('item', 'ITEM', 'item'));
    right.appendChild(button('drift', 'DRIFT', 'drift'));
    right.appendChild(button('brake', 'FREIO', 'brake'));
    layer.appendChild(right);
    layer.appendChild(button('pause', '❚❚', 'pause'));
    document.body.appendChild(layer);
    document.getElementById('hud').classList.add('touch');
  }

  function hide() {
    if (layer) layer.remove();
    layer = null;
    tiltOn = false;
    ['left', 'right', 'brake', 'drift', 'item'].forEach(function (n) { Input.touch(n, false); });
    var hud = document.getElementById('hud');
    if (hud) hud.classList.remove('touch');
  }

  return { show: show, hide: hide, isTouch: isTouch, requestTilt: requestTilt, recenter: function () { tiltZero = null; } };
})();
