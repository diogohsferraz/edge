/* Personagens, modelo 3D do kart, física arcade e pilotos da CPU. */
var CHARACTERS = [
  { id: 'bia', name: 'Bia Raio', color: 0xe34948, suit: 0xffd23f, speed: 1.0, accel: 1.0, handling: 1.0 },
  { id: 'tico', name: 'Tico Turbo', color: 0x2a78d6, suit: 0xffffff, speed: 1.04, accel: 0.93, handling: 0.96 },
  { id: 'lulu', name: 'Lulu Nitro', color: 0xe87ba4, suit: 0x6250d6, speed: 0.96, accel: 1.1, handling: 1.06 },
  { id: 'zeca', name: 'Zeca Pneu', color: 0x1baf7a, suit: 0x333333, speed: 1.02, accel: 0.97, handling: 1.0 },
  { id: 'nina', name: 'Nina Faísca', color: 0xeda100, suit: 0xe34948, speed: 0.97, accel: 1.06, handling: 1.04 },
  { id: 'rafa', name: 'Rafa Ventania', color: 0x6250d6, suit: 0x7df9ff, speed: 1.05, accel: 0.92, handling: 0.95 },
  { id: 'duda', name: 'Duda Drift', color: 0xeb6834, suit: 0x222222, speed: 0.99, accel: 1.0, handling: 1.08 },
  { id: 'gui', name: 'Gui Motor', color: 0x008300, suit: 0xf0f0f0, speed: 1.03, accel: 0.95, handling: 0.98 }
];

var DIFFICULTY = {
  easy: { name: 'Fácil', speed: 0.85, ai: 0.84 },
  normal: { name: 'Normal', speed: 1.0, ai: 0.94 },
  hard: { name: 'Difícil', speed: 1.15, ai: 1.0 }
};

var PHYS = { maxSpeed: 28, accel: 15, brake: 32, reverse: 9, coast: 7, turn: 2.0, offroad: 0.5, boost: 1.42, radius: 1.05 };

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function makeKartMesh(ch) {
  var g = new THREE.Group();
  var lam = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.4), lam(ch.color));
  body.position.y = 0.45;
  g.add(body);
  var nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.8), lam(ch.color));
  nose.position.set(0, 0.42, 1.45);
  g.add(nose);
  var bumper = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 0.3), lam(0x222222));
  bumper.position.set(0, 0.32, 1.9);
  g.add(bumper);
  var wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.5), lam(0x222222));
  wing.position.set(0, 1.05, -1.15);
  g.add(wing);
  [-0.6, 0.6].forEach(function (x) {
    var st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), lam(0x222222));
    st.position.set(x, 0.85, -1.15); g.add(st);
  });
  var seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.3), lam(0x222222));
  seat.position.set(0, 0.85, -0.6);
  g.add(seat);
  // Piloto
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.7, 8), lam(ch.suit));
  torso.position.set(0, 1.05, -0.3);
  g.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), lam(ch.color));
  head.position.set(0, 1.65, -0.25);
  g.add(head);
  var visor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.2), lam(0x101820));
  visor.position.set(0, 1.68, 0.1);
  g.add(visor);
  var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.86), lam(ch.suit));
  stripe.position.set(0, 2.05, -0.25);
  g.add(stripe);
  // Rodas
  var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  var wheelMat = lam(0x1a1a1a);
  var wheels = [];
  [[-0.9, 0.85], [0.9, 0.85], [-0.95, -0.85], [0.95, -0.85]].forEach(function (p, i) {
    var w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(p[0], 0.42, p[1]);
    if (i >= 2) w.scale.set(1.25, 1.12, 1.12);
    g.add(w); wheels.push(w);
  });
  // Faíscas do drift (atrás das rodas traseiras)
  var sparkMat = new THREE.MeshBasicMaterial({ color: 0x3fa9ff });
  var sparks = [];
  [-0.95, 0.95].forEach(function (x) {
    var s = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), sparkMat);
    s.position.set(x, 0.25, -1.45);
    s.visible = false;
    g.add(s); sparks.push(s);
  });
  // Chama do turbo
  var flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.5, -1.9);
  flame.visible = false;
  g.add(flame);

  var root = new THREE.Group();
  var shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.08;
  shadow.scale.set(1, 1.5, 1);
  root.add(shadow);
  root.add(g);
  return { root: root, body: g, wheels: wheels, sparks: sparks, sparkMat: sparkMat, flame: flame };
}

function Kart(ch, opts) {
  this.ch = ch;
  this.name = ch.name;
  this.human = !!opts.human;
  this.player = opts.player;
  this.diff = opts.diff;
  this.maxSpeed = PHYS.maxSpeed * opts.diff.speed * ch.speed;
  this.mesh = makeKartMesh(ch);
  this.x = 0; this.z = 0; this.y = 0; this.heading = 0; this.speed = 0;
  this.idx = 0; this.lastS = 0; this.dist = 0; this.d = 0;
  this.drifting = false; this.driftDir = 0; this.charge = 0; this.hop = 0;
  this.boost = 0; this.boostPower = PHYS.boost;
  this.spin = 0; this.invuln = 0; this.bumpCd = 0;
  this.item = null; this.rolling = 0; this.itemHeld = false;
  this.finished = false; this.finishTime = 0; this.place = 0;
  this.prevDrift = false; this.prevItem = false;
  this.ai = { lane: (Math.random() - 0.5) * 1.1, laneTimer: 0, driftTimer: 0, itemDelay: 1 + Math.random() * 2, skill: 1 };
  this.offroad = false;
}

Kart.prototype.place3d = function (track) {
  var r = this.mesh.root;
  r.position.set(this.x, this.y, this.z);
  r.rotation.y = this.heading;
  var b = this.mesh.body;
  var visualYaw = this.drifting ? this.driftDir * 0.45 : 0;
  if (this.spin > 0) visualYaw += (1.1 - this.spin) * Math.PI * 4;
  b.rotation.y += (visualYaw - b.rotation.y) * (this.spin > 0 ? 1 : 0.2);
  b.position.y = Math.sin(Math.min(1, this.hop / 0.25) * Math.PI) * 0.5;
  // Inclinação acompanhando a rampa
  var ahead = track.sample(this.idx + 3), behind = track.sample(this.idx - 3);
  var slope = (ahead.y - behind.y) / (6 * track.spacing);
  var align = Math.cos(this.heading - ahead.h);
  b.rotation.x = -Math.atan(slope) * align;
  var w = this.mesh.wheels;
  for (var i = 0; i < w.length; i++) w[i].rotation.x += this.speed * 0.03;
  var lvl = this.drifting ? (this.charge >= 2 ? 2 : this.charge >= 1 ? 1 : 0) : 0;
  this.mesh.sparks.forEach(function (s) { s.visible = lvl > 0; s.rotation.y += 0.5; s.scale.setScalar(0.7 + Math.random() * 0.6); });
  this.mesh.sparkMat.color.setHex(lvl === 2 ? 0xff8a2a : 0x3fa9ff);
  this.mesh.flame.visible = this.boost > 0;
  if (this.boost > 0) this.mesh.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1);
};

/** Avança a física um passo. `c` são os comandos (do jogador ou da CPU). */
Kart.prototype.update = function (dt, c, race) {
  var track = race.track;
  var max = this.maxSpeed;
  var accel = PHYS.accel * this.ch.accel;
  if (this.boost > 0) { this.boost -= dt; max *= this.boostPower; accel *= 3; }
  if (this.offroad && this.boost <= 0) max *= PHYS.offroad;
  if (this.invuln > 0) this.invuln -= dt;
  if (this.bumpCd > 0) this.bumpCd -= dt;
  if (this.hop > 0) this.hop -= dt;

  if (this.spin > 0) {
    this.spin -= dt;
    this.speed *= Math.exp(-2.8 * dt);
    this.drifting = false;
    c = { steer: 0, accel: false, brake: false, drift: false, item: false };
  }

  // Aceleração e freio
  if (c.accel && !c.brake) {
    if (this.speed < max) this.speed = Math.min(max, this.speed + accel * dt * (this.speed < 0 ? 2 : 1));
    else this.speed = Math.max(max, this.speed - 25 * dt);
  } else if (c.brake) {
    if (this.speed > 0) this.speed = Math.max(0, this.speed - PHYS.brake * dt);
    else this.speed = Math.max(-PHYS.reverse, this.speed - accel * 0.6 * dt);
  } else {
    var dec = PHYS.coast * dt;
    this.speed = Math.abs(this.speed) <= dec ? 0 : this.speed - Math.sign(this.speed) * dec;
    if (this.speed > max) this.speed = Math.max(max, this.speed - 25 * dt);
  }

  // Drift: aperta o botão virando, segura e solta para ganhar turbo
  var driftPressed = c.drift && !this.prevDrift;
  if (driftPressed && !this.drifting && Math.abs(c.steer) > 0.3 && this.speed > 12 && this.spin <= 0) {
    this.drifting = true; this.driftDir = Math.sign(c.steer); this.charge = 0; this.hop = 0.25;
  }
  if (this.drifting && (!c.drift || this.speed < 9)) {
    if (this.charge >= 2) this.giveBoost(1.25, PHYS.boost);
    else if (this.charge >= 1) this.giveBoost(0.6, PHYS.boost);
    this.drifting = false;
  }
  this.prevDrift = c.drift;

  // Direção
  var speedFactor = Math.min(1, Math.abs(this.speed) / 8) * (1 - 0.22 * Math.min(1, Math.abs(this.speed) / PHYS.maxSpeed));
  var turn = PHYS.turn * this.ch.handling * speedFactor;
  var steer;
  if (this.drifting) {
    var tight = c.steer * this.driftDir; // -1..1
    steer = this.driftDir * (0.7 + 0.5 * tight);
    var before = this.charge;
    this.charge += dt * (0.7 + 0.6 * Math.max(0, tight));
    if (this.human && Math.floor(before) !== Math.floor(this.charge) && this.charge < 3) Sound.play('spark');
    this.speed *= 1 - 0.04 * dt;
  } else {
    steer = c.steer;
  }
  this.heading += steer * turn * dt * (this.speed < 0 ? -1 : 1);

  // Movimento
  var fx = Math.sin(this.heading), fz = Math.cos(this.heading);
  this.x += fx * this.speed * dt;
  this.z += fz * this.speed * dt;

  // Posição na pista, limites e altura
  var p = track.project(this.x, this.z, this.idx);
  this.idx = p.idx; this.d = p.d;
  this.offroad = Math.abs(p.d) > track.half + 0.8;
  if (Math.abs(p.d) > track.limit) {
    var push = Math.abs(p.d) - track.limit;
    var sgn = Math.sign(p.d);
    this.x -= p.nx * push * sgn; this.z -= p.nz * push * sgn;
    if (this.bumpCd <= 0) {
      this.speed *= 0.55; this.bumpCd = 0.4;
      if (this.human) Sound.play('bump');
    }
    // Endireita levemente na direção da pista
    var along = Math.atan2(p.tx, p.tz);
    if (this.speed < 0) along += Math.PI;
    this.heading += wrapAngle(along - this.heading) * 0.15;
    this.drifting = false;
  }
  this.y += (p.y - this.y) * Math.min(1, dt * 15);

  // Progresso contínuo (voltas)
  var N = track.N, ds = p.s - this.lastS;
  if (ds < -N / 2) ds += N; else if (ds > N / 2) ds -= N;
  this.dist += ds;
  this.lastS = p.s;

  // Itens
  if (this.rolling > 0) {
    this.rolling -= dt;
    if (this.human && Math.random() < 0.3) Sound.play('roll');
    if (this.rolling <= 0) this.item = this.pendingItem;
  }
  var itemPressed = c.item && !this.prevItem;
  this.prevItem = c.item;
  if (itemPressed && this.item && this.spin <= 0) race.useItem(this);
};

Kart.prototype.giveBoost = function (t, power) {
  this.boost = Math.max(this.boost, t);
  this.boostPower = power || PHYS.boost;
  if (this.human) Sound.play('boost');
};

Kart.prototype.hit = function () {
  if (this.invuln > 0 || this.spin > 0) return false;
  this.spin = 1.1;
  this.invuln = 2.0;
  this.boost = 0;
  this.drifting = false;
  if (this.human) Sound.play('hit');
  return true;
};

/** Piloto automático: CPU e jogadores que já cruzaram a chegada. */
Kart.prototype.aiControls = function (race, dt) {
  var t = race.track, ai = this.ai;
  var c = { steer: 0, accel: true, brake: false, drift: false, item: false };
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) { ai.lane = (Math.random() - 0.5) * 1.2; ai.laneTimer = 2 + Math.random() * 3; }

  // Desvia de karts logo à frente
  var lane = ai.lane;
  for (var i = 0; i < race.karts.length; i++) {
    var o = race.karts[i];
    if (o === this) continue;
    var ahead = o.dist - this.dist;
    if (ahead > 0 && ahead < 8 && Math.abs(o.d - this.d) < 2.5) lane = o.d > this.d ? lane - 0.6 : lane + 0.6;
  }
  // Desvia de óleo no caminho
  race.hazards.forEach(function (hz) {
    if (hz.type !== 'oil') return;
    var dd = hz.dist - this.dist;
    if (dd > 0 && dd < 25 && Math.abs(hz.d - this.d) < 3) lane = hz.d > 0 ? -0.7 : 0.7;
  }, this);
  lane = Math.max(-0.75, Math.min(0.75, lane));

  var look = Math.round((9 + Math.max(0, this.speed) * 0.55) / t.spacing);
  var s = t.sample(this.idx + look);
  var tx = s.x + s.nx * lane * t.half, tz = s.z + s.nz * lane * t.half;
  var want = Math.atan2(tx - this.x, tz - this.z);
  var diff = wrapAngle(want - this.heading);
  c.steer = Math.max(-1, Math.min(1, diff * 2.4));

  // Velocidade alvo conforme a curva à frente
  var s1 = t.sample(this.idx + Math.round(6 / t.spacing)), s2 = t.sample(this.idx + Math.round(30 / t.spacing));
  var sharp = Math.abs(wrapAngle(s2.h - s1.h));
  var rubber = 1;
  var lead = race.humanLeadDist();
  if (!this.human && lead !== null) {
    var gap = this.dist - lead;
    if (gap > t.N * 0.12) rubber = 0.9;
    else if (gap < -t.N * 0.08) rubber = 1.09;
  }
  var target = this.maxSpeed * ai.skill * rubber * (1 - Math.min(0.4, Math.max(0, sharp - 0.35) * 0.45));
  if (this.speed > target + 3) { c.accel = false; c.brake = this.speed > target + 7; }
  else c.accel = this.speed < target;

  // Drift em curvas longas
  if (ai.driftTimer > 0) {
    ai.driftTimer -= dt;
    c.drift = true;
    if (!this.drifting && ai.driftTimer < ai.driftLen - 0.1) ai.driftTimer = 0;
  } else if (sharp > 0.7 && this.speed > 15 && Math.abs(diff) > 0.12 && Math.random() < 0.02 * ai.skill) {
    ai.driftLen = ai.driftTimer = 1.2 + Math.random() * 1.2;
    c.drift = false; // borda de subida no próximo passo
  }

  // Itens
  if (this.item) {
    ai.itemDelay -= dt;
    if (ai.itemDelay <= 0) {
      var use = false;
      if (this.item === 'nitro') use = sharp < 0.4;
      else if (this.item === 'oil') use = race.someoneBehind(this, 30);
      else if (this.item === 'bomb') use = race.someoneAhead(this, 45, 4);
      else if (this.item === 'missile') use = race.rankOf(this) > 1;
      if (use || ai.itemDelay < -8) { c.item = true; ai.itemDelay = 1 + Math.random() * 3; }
    }
  }
  return c;
};
