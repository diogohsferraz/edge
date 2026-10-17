/* Telas de menu navegáveis por controle, controle remoto ou teclado. */
var Menu = (function () {
  var ui = document.getElementById('ui');
  var current = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /**
   * Tela genérica: `rows` é uma lista de linhas; cada linha, uma lista de itens
   * { el, ok(), left(), right() }. O foco anda com as setas.
   */
  function Screen(opts) {
    this.opts = opts;
    this.rows = [];
    this.r = 0; this.c = 0;
    this.root = el('div', 'screen ' + (opts.cls || ''));
  }
  Screen.prototype.add = function (row) { this.rows.push(row); return row; };
  Screen.prototype.focus = function () {
    this.rows.forEach(function (row) { row.forEach(function (it) { it.el.classList.remove('focus'); }); });
    var it = this.item();
    if (it) { it.el.classList.add('focus'); if (it.el.scrollIntoView) it.el.scrollIntoView({ block: 'nearest' }); }
  };
  Screen.prototype.item = function () { var row = this.rows[this.r]; return row ? row[Math.min(this.c, row.length - 1)] : null; };
  Screen.prototype.handle = function (e) {
    if (this.opts.handle && this.opts.handle(e) === true) return;
    var it = this.item();
    switch (e.action) {
      case 'up': if (this.r > 0) { this.r--; Sound.play('select'); } break;
      case 'down': if (this.r < this.rows.length - 1) { this.r++; Sound.play('select'); } break;
      case 'left': if (it && it.left) { it.left(); Sound.play('select'); } else if (this.c > 0) { this.c = Math.min(this.c, this.rows[this.r].length - 1) - 1; Sound.play('select'); } break;
      case 'right': if (it && it.right) { it.right(); Sound.play('select'); } else if (this.c < this.rows[this.r].length - 1) { this.c++; Sound.play('select'); } break;
      case 'ok': if (it && it.ok) { Sound.play('confirm'); it.ok(e); } break;
      case 'back': case 'pause': if (this.opts.back) { Sound.play('back'); this.opts.back(e); } break;
    }
    this.focus();
  };

  function show(screen) {
    current = screen;
    ui.innerHTML = '';
    ui.classList.remove('hidden');
    if (screen) { ui.appendChild(screen.root); screen.focus(); }
  }
  function hide() { current = null; ui.innerHTML = ''; ui.classList.add('hidden'); }

  Input.onMenu(function (e) { if (current) { current.handle(e); e.handled = true; } });

  function button(text, ok, cls) {
    var b = el('button', 'btn ' + (cls || ''), text);
    var it = { el: b, ok: ok };
    b.addEventListener('click', function () { Sound.unlock(); ok({ device: Input.last() }); });
    return it;
  }

  function selector(label, values, get, set) {
    var b = el('button', 'btn selector');
    var lbl = el('span', 'sel-label', label), val = el('span', 'sel-value');
    b.appendChild(lbl); b.appendChild(val);
    function draw() { var v = get(); val.textContent = '◀ ' + values.filter(function (x) { return x[0] === v; })[0][1] + ' ▶'; }
    function move(dir) {
      var i = values.map(function (x) { return x[0]; }).indexOf(get());
      set(values[(i + dir + values.length) % values.length][0]); draw();
    }
    draw();
    b.addEventListener('click', function () { move(1); });
    return { el: b, left: function () { move(-1); }, right: function () { move(1); }, ok: function () { move(1); } };
  }

  return { Screen: Screen, show: show, hide: hide, el: el, button: button, selector: selector, current: function () { return current; } };
})();
