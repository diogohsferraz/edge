/* Uma corrida: cena, karts, itens, câmeras, HUD e regras. */
var ITEMS = {
  nitro: { name: 'Nitro', icon: '⚡' },
  nitro3: { name: 'Nitro triplo', icon: '⚡' },
  oil: { name: 'Óleo', icon: '🛢️' },
  bomb: { name: 'Bomba', icon: '💣' },
  missile: { name: 'Míssil', icon: '🚀' },
  shield: { name: 'Escudo', icon: '🛡️' },
  super: { name: 'Supercarga', icon: '🔥' }
};
var ITEM_KEYS = Object.keys(ITEMS);
/* Roleta por posição: quem está na frente recebe itens de defesa; quem está atrás, itens para recuperar. */
var ITEM_ODDS = [
  { oil: 35, bomb: 30, shield: 25, nitro: 10 },
  { oil: 15, bomb: 25, nitro: 20, nitro3: 10, missile: 20, shield: 10 },
  { bomb: 10, nitro: 15, nitro3: 30, missile: 25, super: 20 }
];
var LAPS = 3;

function Race(renderer, opts) {
  this.renderer = renderer;
  this.opts = opts;
  this.settings = opts.settings;
  this.diff = DIFFICULTY[opts.difficulty];
  this.def = TRACK_DEFS.filter(function (t) { return t.id === opts.trackId; })[0];
  this.scene = new THREE.Scene();
  this.time = 0;
  this.state = 'countdown';
  this.countdown = 3;
  this.lastCount = 4;
  this.hazards = [];
  this.finishOrder = [];
  this.endTimer = -1;
  this.paused = false;
  this.build();
}

Race.prototype.build = function () {
  var q = this.settings.quality;
  this.track = new Track(this.def, q);
  var th = this.track.theme, sc = this.scene;
  sc.background = new THREE.Color(th.sky);
  var far = { low: 170, medium: 240, high: 340 }[q];
  sc.fog = new THREE.Fog(th.fog, far * 0.35, far);
  sc.add(new THREE.HemisphereLight(th.night ? 0x8a7dff : 0xffffff, th.night ? 0x221a3a : 0x6b8f4e, th.night ? 0.8 : 0.75));
  var sun = new THREE.DirectionalLight(th.sun, th.night ? 0.5 : 0.75);
  sun.position.set(80, 150, 40);
  sc.add(sun);
  sc.add(this.track.group);

  // Caixas de item
  var boxTex = canvasTexture(64, 64, function (c, w, h) {
    var gr = c.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#ff5fa2'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#3fa9ff');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w / 2, h / 2 + 2);
  });
  var boxMat = new THREE.MeshBasicMaterial({ map: boxTex, transparent: true, opacity: 0.9 });
  var boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  var self = this;
  this.boxes = this.track.itemSpots.map(function (sp) {
    var m = new THREE.Mesh(boxGeo, boxMat);
    m.position.set(sp.x, sp.y + 1.3, sp.z);
    sc.add(m);
    return { x: sp.x, z: sp.z, mesh: m, respawn: 0 };
  });

  // Moedas
  var coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.16, 12);
  coinGeo.rotateZ(Math.PI / 2);
  var coinMat = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x6b4a00 });
  this.coins = this.track.coinSpots.map(function (sp) {
    var m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(sp.x, sp.y + 1.0, sp.z);
    sc.add(m);
    return { x: sp.x, z: sp.z, mesh: m, respawn: 0 };
  });
  this.features = this.track.features;

  // Karts: humanos largam no meio do grid
  var humans = this.opts.humans;
  var used = humans.map(function (h) { return h.charId; });
  var cpu = CHARACTERS.filter(function (c) { return used.indexOf(c.id) < 0; }).sort(function () { return Math.random() - 0.5; });
  var grid = [];
  var cpuIdx = 0;
  var humanSlots = humans.length === 1 ? [5] : [4, 5];
  for (var i = 0; i < 8; i++) {
    var hi = humanSlots.indexOf(i);
    if (hi >= 0) grid.push({ ch: CHARACTERS.filter(function (c) { return c.id === humans[hi].charId; })[0], human: true, player: hi });
    else grid.push({ ch: cpu[cpuIdx++ % cpu.length], human: false });
  }
  this.karts = grid.map(function (g, i) {
    var k = new Kart(g.ch, { human: g.human, player: g.player, diff: self.diff });
    k.ai.skill = g.human ? 1 : self.diff.ai * (0.95 + Math.random() * 0.08) * (1 - i * 0.005);
    var row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    var s = self.track.sample(self.track.N - Math.round((6 + row * 6 + (i % 2) * 2.5) / self.track.spacing));
    k.x = s.x + s.nx * side * self.track.half * 0.45;
    k.z = s.z + s.nz * side * self.track.half * 0.45;
    k.heading = s.h;
    var p = self.track.project(k.x, k.z);
    k.idx = p.idx; k.lastS = p.s; k.y = p.y;
    k.dist = p.s - self.track.N;
    sc.add(k.mesh.root);
    return k;
  });
  this.players = humans.map(function (h, i) {
    var kart = self.karts.filter(function (k) { return k.human && k.player === i; })[0];
    var cam = new THREE.PerspectiveCamera(70, 1, 0.5, far * 1.1);
    return { index: i, device: h.deviceId, kart: kart, cam: cam, camPos: null, hud: null, finishedShown: false };
  });
  this.karts.forEach(function (k) { k.place3d(self.track); });
  this.buildHud();
  Sound.setEngines(this.players.length);
};

/* ---------- HUD ---------- */
Race.prototype.buildHud = function () {
  var root = document.getElementById('hud');
  root.innerHTML = '';
  var self = this, two = this.players.length > 1;
  this.players.forEach(function (p, i) {
    var el = document.createElement('div');
    el.className = 'hud-view' + (two ? (i === 0 ? ' top' : ' bottom') : ' full');
    el.innerHTML =
      '<div class="hud-lap"><span class="lbl">VOLTA</span> <b>1</b>/' + LAPS + '</div>' +
      '<div class="hud-time"></div>' +
      '<div class="hud-item"><div class="slot"></div><div class="uses"></div></div>' +
      '<div class="hud-coins"><i></i><b>0</b></div>' +
      '<div class="hud-pos"><b>1</b><sup>º</sup></div>' +
      '<canvas class="hud-map" width="150" height="150"></canvas>' +
      '<div class="hud-center"></div>' +
      (two ? '<div class="hud-tag">J' + (i + 1) + '</div>' : '');
    root.appendChild(el);
    var map = el.querySelector('canvas');
    var mctx = map.getContext('2d');
    p.hud = {
      el: el, lap: el.querySelector('.hud-lap b'), pos: el.querySelector('.hud-pos b'), item: el.querySelector('.slot'),
      uses: el.querySelector('.uses'), coins: el.querySelector('.hud-coins b'),
      center: el.querySelector('.hud-center'), time: el.querySelector('.hud-time'), map: map, mctx: mctx
    };
  });
  // Fundo do minimapa (traçado) desenhado uma vez
  var bg = document.createElement('canvas');
  bg.width = 150; bg.height = 150;
  var bctx = bg.getContext('2d');
  drawTrackOutline(bctx, this.track.samples, 150, 150, 12, 9, 'rgba(0,0,0,.45)');
  this.mapXY = drawTrackOutline(bctx, this.track.samples, 150, 150, 12, 5, 'rgba(255,255,255,.9)');
  this.mapBg = bg;
};

function fmtTime(t) {
  var m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}

Race.prototype.updateHud = function () {
  var self = this;
  var ranks = this.ranking();
  this.players.forEach(function (p) {
    var k = p.kart, h = p.hud;
    var lap = Math.max(1, Math.min(LAPS, Math.floor(k.dist / self.track.N) + 1));
    h.lap.textContent = lap;
    h.pos.textContent = k.finished ? k.place : ranks.indexOf(k) + 1;
    h.time.textContent = fmtTime(k.finished ? k.finishTime : Math.max(0, self.time));
    var icon = k.rolling > 0 ? ITEMS[ITEM_KEYS[Math.floor(self.time * 12) % ITEM_KEYS.length]].icon : (k.item ? ITEMS[k.item].icon : '');
    if (h.item.textContent !== icon) h.item.textContent = icon;
    var uses = k.rolling <= 0 && k.item && k.itemUses > 1 ? '×' + k.itemUses : '';
    if (h.uses.textContent !== uses) h.uses.textContent = uses;
    if (h.coins.textContent !== String(k.coins)) h.coins.textContent = k.coins;
    var c = h.mctx;
    c.clearRect(0, 0, 150, 150);
    c.drawImage(self.mapBg, 0, 0);
    self.karts.forEach(function (o) {
      var xy = self.mapXY(o.x, o.z);
      c.fillStyle = '#' + o.ch.color.toString(16).padStart(6, '0');
      c.beginPath(); c.arc(xy[0], xy[1], o === k ? 6 : 4, 0, Math.PI * 2); c.fill();
      if (o === k) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    });
  });
};

Race.prototype.flash = function (p, text, cls, ms) {
  var h = p ? [p.hud] : this.players.map(function (x) { return x.hud; });
  h.forEach(function (hud) {
    hud.center.textContent = text;
    hud.center.className = 'hud-center show ' + (cls || '');
    clearTimeout(hud.timer);
    if (ms) hud.timer = setTimeout(function () { hud.center.className = 'hud-center'; }, ms);
  });
};

/* ---------- Regras ---------- */
Race.prototype.ranking = function () {
  var fin = this.finishOrder.slice();
  var rest = this.karts.filter(function (k) { return !k.finished; }).sort(function (a, b) { return b.dist - a.dist; });
  return fin.concat(rest);
};
Race.prototype.rankOf = function (k) { return this.ranking().indexOf(k) + 1; };
Race.prototype.humanLeadDist = function () {
  var best = null;
  this.players.forEach(function (p) { if (!p.kart.finished && (best === null || p.kart.dist > best)) best = p.kart.dist; });
  return best;
};
Race.prototype.someoneBehind = function (k, range) {
  return this.karts.some(function (o) { return o !== k && k.dist - o.dist > 0 && k.dist - o.dist < range / 1.5; });
};
Race.prototype.someoneAhead = function (k, range, lat) {
  return this.karts.some(function (o) { return o !== k && o.dist - k.dist > 0 && o.dist - k.dist < range / 1.5 && Math.abs(o.d - k.d) < lat; });
};

Race.prototype.rollItem = function (k) {
  var rank = this.rankOf(k);
  var odds = ITEM_ODDS[rank <= 2 ? 0 : rank <= 5 ? 1 : 2];
  var total = 0, key;
  for (key in odds) total += odds[key];
  var r = Math.random() * total;
  for (key in odds) { r -= odds[key]; if (r <= 0) return key; }
  return 'nitro';
};

Race.prototype.useItem = function (k) {
  var item = k.item;
  k.itemUses--;
  if (k.itemUses <= 0) k.item = null;
  var t = this.track, fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (item === 'nitro' || item === 'nitro3') { k.giveBoost(1.4, 1.5); return; }
  if (item === 'shield') { k.shield = 12; if (k.human) Sound.play('item'); return; }
  if (item === 'super') { k.superT = 7; k.shield = 0; k.spin = 0; if (k.human) Sound.play('boost'); return; }
  if (k.human) Sound.play('throw');
  if (item === 'oil') {
    var x = k.x - fx * 3, z = k.z - fz * 3, p = t.project(x, z, k.idx);
    var m = new THREE.Mesh(new THREE.CircleGeometry(1.6, 14), new THREE.MeshBasicMaterial({ color: 0x14101e }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, p.y + 0.1, z);
    this.scene.add(m);
    this.hazards.push({ type: 'oil', x: x, z: z, d: p.d, dist: k.dist - 2, mesh: m, owner: k, safe: 0.6, life: 60 });
    this.trimHazards();
  } else if (item === 'bomb') {
    var bm = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
    var fuse = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    fuse.position.y = 0.6; bm.add(fuse);
    this.scene.add(bm);
    this.hazards.push({ type: 'bomb', x: k.x + fx * 2.5, z: k.z + fz * 2.5, vx: fx * 48, vz: fz * 48, idx: k.idx, mesh: bm, owner: k, safe: 0.3, life: 5 });
  } else if (item === 'missile') {
    var ranks = this.ranking(), target = ranks[ranks.indexOf(k) - 1] || null;
    var mm = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xe34948 }));
    body.rotation.x = Math.PI / 2; mm.add(body);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tip.rotation.x = Math.PI / 2; tip.position.z = 1.1; mm.add(tip);
    this.scene.add(mm);
    this.hazards.push({ type: 'missile', x: k.x + fx * 2.5, z: k.z + fz * 2.5, heading: k.heading, idx: k.idx, target: target, mesh: mm, owner: k, safe: 0.3, life: 12 });
  }
};

Race.prototype.trimHazards = function () {
  var oils = this.hazards.filter(function (h) { return h.type === 'oil'; });
  if (oils.length > 12) this.removeHazard(oils[0]);
};
Race.prototype.removeHazard = function (h) {
  this.scene.remove(h.mesh);
  this.hazards.splice(this.hazards.indexOf(h), 1);
};

Race.prototype.updateHazards = function (dt) {
  var t = this.track, self = this;
  this.hazards.slice().forEach(function (h) {
    h.life -= dt; h.safe -= dt;
    if (h.life <= 0) return self.removeHazard(h);
    if (h.type === 'bomb') {
      h.x += h.vx * dt; h.z += h.vz * dt;
      var p = t.project(h.x, h.z, h.idx);
      h.idx = p.idx;
      if (Math.abs(p.d) > t.limit - 0.5) {
        var dot = h.vx * p.nx + h.vz * p.nz;
        if (dot * p.d > 0) { h.vx -= 2 * dot * p.nx; h.vz -= 2 * dot * p.nz; }
      }
      h.mesh.position.set(h.x, p.y + 0.7, h.z);
    } else if (h.type === 'missile') {
      var tgt = h.target && !h.target.finished ? h.target : null;
      var aimX, aimZ;
      var pm = t.project(h.x, h.z, h.idx);
      h.idx = pm.idx;
      if (tgt && Math.hypot(tgt.x - h.x, tgt.z - h.z) < 22) { aimX = tgt.x; aimZ = tgt.z; }
      else {
        var s = t.sample(h.idx + Math.round(8 / t.spacing));
        var lat = tgt ? Math.max(-t.half * 0.6, Math.min(t.half * 0.6, tgt.d)) : 0;
        aimX = s.x + s.nx * lat; aimZ = s.z + s.nz * lat;
      }
      var want = Math.atan2(aimX - h.x, aimZ - h.z);
      h.heading += Math.max(-4 * dt, Math.min(4 * dt, wrapAngle(want - h.heading)));
      h.x += Math.sin(h.heading) * 44 * dt; h.z += Math.cos(h.heading) * 44 * dt;
      h.mesh.position.set(h.x, pm.y + 1.0, h.z);
      h.mesh.rotation.y = h.heading;
    }
    // Colisão com karts
    for (var i = 0; i < self.karts.length; i++) {
      var k = self.karts[i];
      if (k === h.owner && h.safe > 0) continue;
      if (k.air && k.y - k.groundY > 2 && h.type !== 'missile') continue;
      var r = h.type === 'oil' ? 2.2 : 1.8;
      if ((k.x - h.x) * (k.x - h.x) + (k.z - h.z) * (k.z - h.z) < r * r) {
        if (k.hit()) {
          var pl = self.playerOf(k);
          if (pl) self.flash(pl, 'Atingido!', 'warn', 900);
        }
        if (h.type !== 'oil' || k.spin > 0) { self.removeHazard(h); break; }
      }
    }
  });
};

Race.prototype.playerOf = function (k) {
  return this.players.filter(function (p) { return p.kart === k; })[0] || null;
};

Race.prototype.updateBoxes = function (dt) {
  var self = this;
  this.boxes.forEach(function (b) {
    if (b.respawn > 0) {
      b.respawn -= dt;
      if (b.respawn <= 0) b.mesh.visible = true;
      return;
    }
    b.mesh.rotation.y += dt * 1.6;
    b.mesh.rotation.x += dt * 0.9;
    for (var i = 0; i < self.karts.length; i++) {
      var k = self.karts[i];
      if ((k.x - b.x) * (k.x - b.x) + (k.z - b.z) * (k.z - b.z) < 2.6 * 2.6) {
        b.mesh.visible = false; b.respawn = 2.5;
        if (!k.item && k.rolling <= 0) {
          k.pendingItem = self.rollItem(k);
          k.rolling = 1.0;
          if (k.human) Sound.play('item');
        }
        break;
      }
    }
  });
};

Race.prototype.updateCoins = function (dt) {
  var self = this;
  this.coins.forEach(function (c) {
    if (c.respawn > 0) { c.respawn -= dt; if (c.respawn <= 0) c.mesh.visible = true; return; }
    c.mesh.rotation.y += dt * 3;
    for (var i = 0; i < self.karts.length; i++) {
      var k = self.karts[i];
      if (Math.abs(k.y - c.mesh.position.y) < 3 && (k.x - c.x) * (k.x - c.x) + (k.z - c.z) * (k.z - c.z) < 1.9 * 1.9) {
        c.mesh.visible = false; c.respawn = 12;
        k.addCoin();
        break;
      }
    }
  });
};

/** Rampas, planador e placas de turbo: detecta quando o kart cruza o ponto. */
Race.prototype.updateFeatures = function (k, prevS) {
  var t = this.track, N = t.N;
  k.groundOffset = 0;
  for (var i = 0; i < this.features.length; i++) {
    var f = this.features[i];
    var back = f.idx - k.lastS;
    if (back < -N / 2) back += N; else if (back > N / 2) back -= N;
    var inLane = Math.abs(k.d - f.lat) < f.width / 2 + 0.3;
    if (f.type !== 'boost' && inLane && back >= 0) {
      var len = (f.type === 'glider' ? 7 : 6) / t.spacing, h = f.type === 'glider' ? 1.6 : 1.2;
      if (back < len) k.groundOffset = Math.max(k.groundOffset, h * (1 - back / len));
    }
    var before = f.idx - prevS;
    if (before < -N / 2) before += N; else if (before > N / 2) before -= N;
    if (before > 0 && back <= 0 && inLane && k.speed > 2) {
      if (f.type === 'boost') k.giveBoost(1.0, 1.45);
      else if (k.speed > 8) k.launch(f.type === 'glider');
    }
  }
};

Race.prototype.collideKarts = function () {
  var ks = this.karts, R = PHYS.radius * 2;
  for (var i = 0; i < ks.length; i++) for (var j = i + 1; j < ks.length; j++) {
    var a = ks[i], b = ks[j];
    var dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 < R * R && d2 > 1e-6) {
      var d = Math.sqrt(d2), push = (R - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      var avg = (a.speed + b.speed) / 2;
      a.speed = a.speed * 0.8 + avg * 0.2; b.speed = b.speed * 0.8 + avg * 0.2;
      if (a.superT > 0 && b.superT <= 0) b.hit();
      if (b.superT > 0 && a.superT <= 0) a.hit();
      if ((a.human || b.human) && a.bumpCd <= 0) { Sound.play('bump'); a.bumpCd = 0.3; }
    }
  }
};

/* ---------- Laço da corrida ---------- */
Race.prototype.step = function (dt) {
  if (this.paused) return;
  var self = this;
  if (this.state === 'countdown') {
    this.countdown -= dt;
    var n = Math.ceil(this.countdown);
    if (n !== this.lastCount && n > 0) { this.lastCount = n; this.flash(null, String(n), 'count'); Sound.play('count'); }
    // Turbo de largada: acelerar entre o "2" e o "1"... e soltar no "JÁ"
    this.players.forEach(function (p) {
      var c = Input.controls(p.device, self.settings.autoAccel);
      if (self.countdown < 1.6 && self.countdown > 0.2 && c.accel) p.startCharge = (p.startCharge || 0) + dt;
      else if (self.countdown >= 1.6 && c.accel) p.startCharge = -99;
    });
    if (this.countdown <= 0) {
      this.state = 'race';
      this.time = 0;
      this.flash(null, 'JÁ!', 'go', 900);
      Sound.play('go');
      this.players.forEach(function (p) { if (p.startCharge > 0.5) p.kart.giveBoost(1.0, 1.4); });
      this.karts.forEach(function (k) { if (!k.human && Math.random() < 0.5) k.giveBoost(0.7, 1.3); });
    }
    this.karts.forEach(function (k) { k.place3d(self.track); });
    return;
  }

  this.time += dt;
  var autoAll = this.state === 'done';
  this.karts.forEach(function (k) {
    var c;
    var p = self.playerOf(k);
    if (p && !k.finished && !autoAll) c = Input.controls(p.device, self.settings.autoAccel);
    else c = k.aiControls(self, dt);
    var lapBefore = Math.floor(k.dist / self.track.N);
    var prevS = k.lastS;
    k.update(dt, c, self);
    self.updateFeatures(k, prevS);
    var lapNow = Math.floor(k.dist / self.track.N);
    if (!k.finished && lapNow > lapBefore && lapNow >= 1) {
      if (lapNow >= LAPS) self.finish(k);
      else if (p) {
        self.flash(p, lapNow === LAPS - 1 ? 'ÚLTIMA VOLTA!' : 'VOLTA ' + (lapNow + 1), 'lap', 1400);
        Sound.play('lap');
      }
    }
  });
  this.collideKarts();
  this.updateBoxes(dt);
  this.updateCoins(dt);
  this.updateHazards(dt);
  this.karts.forEach(function (k) { k.place3d(self.track); });

  this.players.forEach(function (p, i) {
    var k = p.kart;
    Sound.engine(i, Math.max(0, k.speed) / PHYS.maxSpeed, k.boost > 0);
  });

  if (this.endTimer < 0 && this.players.every(function (p) { return p.kart.finished; })) this.endTimer = 3.5;
  if (this.endTimer >= 0) {
    this.endTimer -= dt;
    if (this.endTimer <= 0 && this.state !== 'done') {
      this.state = 'done';
      if (this.onEnd) this.onEnd(this.results());
    }
  }
};

Race.prototype.finish = function (k) {
  k.finished = true;
  k.finishTime = this.time;
  this.finishOrder.push(k);
  k.place = this.finishOrder.length;
  var p = this.playerOf(k);
  if (p) {
    this.flash(p, 'CHEGADA! ' + k.place + 'º', k.place <= 3 ? 'go' : 'lap');
    Sound.play('finish');
  }
};

Race.prototype.results = function () {
  var self = this;
  return this.ranking().map(function (k, i) {
    var p = self.playerOf(k);
    return { place: i + 1, name: k.name, color: k.ch.color, human: !!p, player: p ? p.index : -1, time: k.finished ? k.finishTime : null };
  });
};

Race.prototype.render = function (dt) {
  var r = this.renderer, size = r.getSize(new THREE.Vector2()), W = size.x, H = size.y;
  var n = this.players.length, self = this;
  this.updateCameras(dt);
  r.setScissorTest(n > 1);
  this.players.forEach(function (p, i) {
    var vh = n > 1 ? Math.floor(H / 2) : H;
    var vy = n > 1 ? (i === 0 ? H - vh : 0) : 0;
    p.cam.aspect = W / vh;
    p.cam.updateProjectionMatrix();
    r.setViewport(0, vy, W, vh);
    r.setScissor(0, vy, W, vh);
    r.render(self.scene, p.cam);
  });
  r.setScissorTest(false);
  this.updateHud();
};

Race.prototype.updateCameras = function (dt) {
  var self = this;
  this.players.forEach(function (p) {
    var k = p.kart, cam = p.cam;
    var back = k.finished ? 8 : 7, up = 3.0;
    var h = k.heading + (k.finished ? self.time * 0.5 : 0);
    var tx = k.x - Math.sin(h) * back, tz = k.z - Math.cos(h) * back;
    var ty = k.y + up;
    if (!p.camPos) p.camPos = new THREE.Vector3(tx, ty, tz);
    var a = Math.min(1, dt * 8);
    p.camPos.x += (tx - p.camPos.x) * a; p.camPos.z += (tz - p.camPos.z) * a; p.camPos.y += (ty - p.camPos.y) * Math.min(1, dt * 5);
    cam.position.copy(p.camPos);
    cam.lookAt(k.x + Math.sin(k.heading) * 4, k.y + 1.2, k.z + Math.cos(k.heading) * 4);
    var fov = 68 + (k.boost > 0 ? 10 : 0) + Math.max(0, k.speed) / PHYS.maxSpeed * 4;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
  });
};

Race.prototype.dispose = function () {
  Sound.stopEngines();
  document.getElementById('hud').innerHTML = '';
  this.scene.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
};
