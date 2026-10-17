/* Geração das pistas: amostragem da curva, malhas 3D e consultas de posição. */
var THEMES = {
  beach: { sky: 0x8fd3ff, fog: 0xbfe6ff, ground: ['#d9c38a', '#cdb67a'], grass: ['#7cc35a', '#6db04d'], barrier: [0xffffff, 0xe34948], deco: 'palm', sea: true, sun: 0xfff3d6 },
  mountain: { sky: 0xa9c4d8, fog: 0xc9d8e2, ground: ['#5d9a48', '#558f41'], grass: ['#6aa852', '#5f9b48'], barrier: [0xffd23f, 0x333333], deco: 'pine', sea: false, sun: 0xffffff },
  city: { sky: 0x1b1238, fog: 0x2a1d52, ground: ['#2a2a35', '#30303c'], grass: ['#3a3a48', '#343442'], barrier: [0x00e5ff, 0xff2bd6], deco: 'building', sea: false, sun: 0xb9a8ff, night: true }
};

function seededRandom(seed) {
  var s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvasTexture(w, h, draw, repeatX, repeatY) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeatX) t.repeat.set(repeatX, repeatY || repeatX);
  t.anisotropy = 2;
  return t;
}

function noiseFill(ctx, w, h, colors, n) {
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, w, h);
  var r = seededRandom(7);
  for (var i = 0; i < n; i++) {
    ctx.fillStyle = colors[1 + Math.floor(r() * (colors.length - 1))];
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
  }
  ctx.globalAlpha = 1;
}

/** Amostra a curva central da pista (sem DOM, usado também nos menus). */
function sampleTrack(def) {
  var curve = new THREE.CatmullRomCurve3(def.points.map(function (p) { return new THREE.Vector3(p[0], p[2], p[1]); }), true, 'centripetal');
  var length = curve.getLength();
  var N = Math.round(length / 1.5);
  var pts = curve.getSpacedPoints(N).slice(0, N);
  var samples = pts.map(function (p, i) {
    var a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    var tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return { x: p.x, y: p.y, z: p.z, tx: tx, tz: tz, nx: tz, nz: -tx, h: Math.atan2(tx, tz) };
  });
  return { samples: samples, N: N, length: length, spacing: length / N, width: def.width };
}

function Track(def, quality) {
  var base = sampleTrack(def);
  this.def = def;
  this.samples = base.samples;
  this.N = base.N;
  this.length = base.length;
  this.spacing = base.spacing;
  this.width = def.width;
  this.half = def.width / 2;
  this.limit = this.half + 5;
  this.theme = THEMES[def.theme];
  this.group = new THREE.Group();
  this.quality = quality;
  this.build();
}

Track.prototype.sample = function (i) {
  var N = this.N;
  return this.samples[((Math.round(i) % N) + N) % N];
};

/** Projeta (x, z) na linha central. Usa `hint` para buscar só perto do último índice. */
Track.prototype.project = function (x, z, hint) {
  var N = this.N, S = this.samples;
  var from, to;
  if (hint === undefined || hint === null) { from = 0; to = N - 1; } else { from = hint - 30; to = hint + 30; }
  var best = 1e18, bi = 0, bu = 0;
  for (var j = from; j <= to; j++) {
    var i = ((j % N) + N) % N;
    var a = S[i], b = S[(i + 1) % N];
    var ex = b.x - a.x, ez = b.z - a.z;
    var len2 = ex * ex + ez * ez || 1;
    var u = ((x - a.x) * ex + (z - a.z) * ez) / len2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    var px = a.x + ex * u, pz = a.z + ez * u;
    var d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best) { best = d2; bi = i; bu = u; }
  }
  var A = S[bi], B = S[(bi + 1) % N];
  var cx = A.x + (B.x - A.x) * bu, cz = A.z + (B.z - A.z) * bu;
  var nx = A.nx + (B.nx - A.nx) * bu, nz = A.nz + (B.nz - A.nz) * bu;
  var nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  return {
    idx: bi, s: bi + bu,
    d: (x - cx) * nx + (z - cz) * nz,
    y: A.y + (B.y - A.y) * bu,
    nx: nx, nz: nz,
    tx: A.tx + (B.tx - A.tx) * bu, tz: A.tz + (B.tz - A.tz) * bu
  };
};

Track.prototype.build = function () {
  var self = this, th = this.theme, N = this.N, S = this.samples, half = this.half;
  var g = this.group;
  var lambert = function (o) { return new THREE.MeshLambertMaterial(o); };

  // Asfalto com faixa central tracejada
  var roadTex = canvasTexture(64, 128, function (c, w, h) {
    noiseFill(c, w, h, th.night ? ['#2b2b33', '#3a3a44', '#24242a'] : ['#55555c', '#626269', '#4a4a50'], 500);
    c.fillStyle = th.night ? '#7d7dff' : '#f0f0f0';
    c.fillRect(w / 2 - 2, 0, 4, h / 2);
  });
  var strip = function (offA, offB, lift, vScale) {
    var pos = [], uv = [], idx = [], dist = 0;
    for (var i = 0; i <= N; i++) {
      var s = S[i % N];
      if (i > 0) { var p = S[i - 1]; dist += Math.hypot(s.x - p.x, s.z - p.z); }
      pos.push(s.x + s.nx * offA, s.y + lift, s.z + s.nz * offA, s.x + s.nx * offB, s.y + lift, s.z + s.nz * offB);
      uv.push(0, dist / vScale, 1, dist / vScale);
      if (i < N) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  var road = new THREE.Mesh(strip(half, -half, 0.05, 16), lambert({ map: roadTex, side: THREE.DoubleSide }));
  g.add(road);

  // Zebras
  var curbTex = canvasTexture(16, 32, function (c, w, h) {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = th.night ? '#ff2bd6' : '#e34948'; c.fillRect(0, 0, w, h / 2);
  });
  [half, -half - 1.2].forEach(function (o) {
    g.add(new THREE.Mesh(strip(o + 1.2, o, 0.07, 3), lambert({ map: curbTex, side: THREE.DoubleSide })));
  });

  // Faixa de largada quadriculada
  var checker = canvasTexture(64, 16, function (c, w, h) {
    for (var x = 0; x < 16; x++) for (var y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 4, y * 4, 4, 4); }
  });
  var s0 = S[0];
  var line = new THREE.Mesh(new THREE.PlaneGeometry(this.width, 2.4), lambert({ map: checker }));
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = s0.h + Math.PI / 2;
  line.position.set(s0.x, s0.y + 0.09, s0.z);
  g.add(line);

  // Pórtico de largada
  var postMat = lambert({ color: 0x333333 });
  [-1, 1].forEach(function (sd) {
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), postMat);
    post.position.set(s0.x + s0.nx * (half + 1.5) * sd, s0.y + 3.5, s0.z + s0.nz * (half + 1.5) * sd);
    g.add(post);
  });
  var banner = canvasTexture(256, 32, function (c, w, h) {
    c.fillStyle = '#e34948'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText('KART TURBO', w / 2, 24);
  });
  banner.wrapS = THREE.ClampToEdgeWrapping;
  var bannerMesh = new THREE.Mesh(new THREE.BoxGeometry(this.width + 3.6, 1.6, 0.4), lambert({ map: banner }));
  bannerMesh.position.set(s0.x, s0.y + 6.6, s0.z);
  bannerMesh.rotation.y = s0.h;
  g.add(bannerMesh);

  // Terreno acompanhando a altura da pista
  var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  S.forEach(function (s) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); });
  var M = 140;
  minX -= M; maxX += M; minZ -= M; maxZ += M;
  this.bounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
  var segs = 70;
  var tGeo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, segs, segs);
  tGeo.rotateX(-Math.PI / 2);
  var tp = tGeo.attributes.position;
  var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  var rnd = seededRandom(11);
  this.bumps = [];
  for (var b = 0; b < 25; b++) this.bumps.push({ x: minX + rnd() * (maxX - minX), z: minZ + rnd() * (maxZ - minZ), r: 30 + rnd() * 60, h: th.sea ? 0 : 6 + rnd() * 18 });
  for (var v = 0; v < tp.count; v++) {
    var x = tp.getX(v) + cx, z = tp.getZ(v) + cz;
    tp.setX(v, x); tp.setZ(v, z); tp.setY(v, this.heightAt(x, z));
  }
  tGeo.computeVertexNormals();
  var groundTex = canvasTexture(128, 128, function (c, w, h) { noiseFill(c, w, h, th.grass.concat(th.ground), 900); }, (maxX - minX) / 12, (maxZ - minZ) / 12);
  g.add(new THREE.Mesh(tGeo, lambert({ map: groundTex })));

  if (th.sea) {
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lambert({ color: 0x2b8fd6 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.6;
    g.add(sea);
  }

  // Barreiras (instanciadas)
  var count = Math.floor(N / 3) * 2;
  var barGeo = new THREE.BoxGeometry(0.8, 1.0, 4.4);
  var bars = new THREE.InstancedMesh(barGeo, lambert({ color: 0xffffff }), count);
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  var n = 0;
  for (var i = 0; i < N; i += 3) {
    var sm = S[i];
    for (var sd = -1; sd <= 1; sd += 2) {
      if (n >= count) break;
      var off = (this.limit + 0.8) * sd;
      e.set(0, sm.h, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(sm.x + sm.nx * off, sm.y + 0.5, sm.z + sm.nz * off), q, sc);
      bars.setMatrixAt(n, m4);
      bars.setColorAt(n, col.setHex(th.barrier[(i / 3) % 2]));
      n++;
    }
  }
  bars.count = n;
  g.add(bars);

  this.buildDecor();
  this.buildItemSpots();
};

Track.prototype.nearest = function (x, z) {
  var best = 1e18, by = 0, S = this.samples;
  for (var i = 0; i < S.length; i += 2) {
    var s = S[i], d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z);
    if (d < best) { best = d; by = s.y; }
  }
  return { dist: Math.sqrt(best), y: by };
};

/** Altura do terreno: segue a pista perto dela e vira morros/mar longe. */
Track.prototype.heightAt = function (x, z) {
  var th = this.theme, half = this.half;
  var near = this.nearest(x, z);
  var far = th.sea ? -2.5 : 0;
  this.bumps.forEach(function (bp) { var dd = Math.hypot(x - bp.x, z - bp.z); if (dd < bp.r) far += bp.h * (1 - dd / bp.r) * (1 - dd / bp.r); });
  var t = Math.min(1, Math.max(0, (near.dist - half - 8) / 45));
  t = t * t * (3 - 2 * t);
  var ty = (near.y - 0.1) * (1 - t) + far * t;
  if (th.sea && near.dist > half + 60) ty = Math.min(ty, -2.5);
  return ty;
};

Track.prototype.buildDecor = function () {
  var th = this.theme, b = this.bounds, half = this.half, self = this;
  var rnd = seededRandom(this.def.id.length * 97 + 3);
  var spots = [];
  var want = { low: 70, medium: 130, high: 200 }[this.quality] || 130;
  var tries = 0;
  while (spots.length < want && tries < want * 25) {
    tries++;
    var x = b.minX + rnd() * (b.maxX - b.minX), z = b.minZ + rnd() * (b.maxZ - b.minZ);
    var near = this.nearest(x, z);
    if (near.dist < this.limit + (th.deco === 'building' ? 16 : 5) || near.dist > half + 95) continue;
    if (th.sea && near.dist > half + 45) continue;
    spots.push({ x: x, z: z, y: this.heightAt(x, z), s: 0.8 + rnd() * 0.7, r: rnd() * Math.PI * 2, k: rnd() });
  }
  var lambert = function (o) { return new THREE.MeshLambertMaterial(o); };
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  function place(mesh, list, fn) {
    list.forEach(function (sp, i) { fn(sp, p, sc); e.set(0, sp.r, 0); q.setFromEuler(e); m4.compose(p, q, sc); mesh.setMatrixAt(i, m4); });
    self.group.add(mesh);
  }
  if (th.deco === 'palm') {
    var trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 8, 6), lambert({ color: 0x9b7653 }), spots.length);
    place(trunk, spots, function (sp, pp, s) { pp.set(sp.x, sp.y + 4 * sp.s, sp.z); s.set(sp.s, sp.s, sp.s); });
    var leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 1.6, 7), lambert({ color: 0x2e9e4f }), spots.length);
    place(leaf, spots, function (sp, pp, s) { pp.set(sp.x, sp.y + 8.2 * sp.s, sp.z); s.set(sp.s, sp.s, sp.s); });
  } else if (th.deco === 'pine') {
    var tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 2.5, 5), lambert({ color: 0x6b4a2f }), spots.length);
    place(tr, spots, function (sp, pp, s) { pp.set(sp.x, sp.y + 1.2 * sp.s, sp.z); s.set(sp.s, sp.s, sp.s); });
    var cone = new THREE.InstancedMesh(new THREE.ConeGeometry(2.8, 8, 7), lambert({ color: 0x2f6b3a }), spots.length);
    place(cone, spots, function (sp, pp, s) { pp.set(sp.x, sp.y + 6 * sp.s, sp.z); s.set(sp.s, sp.s * 1.2, sp.s); });
  } else {
    var winTex = canvasTexture(64, 128, function (c, w, h) {
      c.fillStyle = '#15132a'; c.fillRect(0, 0, w, h);
      var r = seededRandom(5);
      for (var yy = 4; yy < h; yy += 10) for (var xx = 4; xx < w; xx += 10) {
        c.fillStyle = r() > 0.45 ? ['#ffd86b', '#7df9ff', '#ff7ae6'][Math.floor(r() * 3)] : '#25223f';
        c.fillRect(xx, yy, 6, 6);
      }
    });
    var box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: winTex }), spots.length);
    place(box, spots, function (sp, pp, s) { var hgt = 12 + sp.k * 40; s.set(8 + sp.s * 6, hgt, 8 + sp.s * 6); pp.set(sp.x, sp.y + hgt / 2, sp.z); });
    // Postes de luz ao longo da pista
    var poles = [];
    for (var i = 0; i < this.N; i += 18) poles.push(this.samples[i]);
    var pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 6, 0.3), lambert({ color: 0x444455 }), poles.length);
    var lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), poles.length);
    var off = this.limit + 2.5;
    poles.forEach(function (sm, k) {
      var sd = k % 2 ? 1 : -1;
      m4.makeTranslation(sm.x + sm.nx * off * sd, sm.y + 3, sm.z + sm.nz * off * sd); pole.setMatrixAt(k, m4);
      m4.makeTranslation(sm.x + sm.nx * off * sd, sm.y + 6.2, sm.z + sm.nz * off * sd); lamp.setMatrixAt(k, m4);
    });
    this.group.add(pole); this.group.add(lamp);
  }
  // Pedras/arbustos para dar volume
  var rocks = spots.filter(function (s) { return s.k > 0.6; });
  var rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.4, 0), lambert({ color: th.night ? 0x4a4560 : th.sea ? 0xc9b27a : 0x7c7f86 }), rocks.length);
  place(rock, rocks, function (sp, pp, s) { pp.set(sp.x + 5, sp.y + 0.5, sp.z + 3); s.set(sp.s, sp.s * 0.7, sp.s); });
};

Track.prototype.buildItemSpots = function () {
  var self = this;
  this.itemSpots = [];
  [0.2, 0.52, 0.8].forEach(function (f) {
    var s = self.sample(Math.floor(self.N * f));
    [-0.6, -0.2, 0.2, 0.6].forEach(function (l) {
      self.itemSpots.push({ x: s.x + s.nx * l * self.half, y: s.y, z: s.z + s.nz * l * self.half });
    });
  });
};

/** Desenha o traçado num canvas 2D (minimapa e menus). */
function drawTrackOutline(ctx, samples, w, h, pad, lineWidth, color) {
  var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  samples.forEach(function (s) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); });
  var sc = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  var ox = (w - (maxX - minX) * sc) / 2, oz = (h - (maxZ - minZ) * sc) / 2;
  var map = function (x, z) { return [ox + (maxX - x) * sc, oz + (maxZ - z) * sc]; };
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  samples.forEach(function (s, i) { var p = map(s.x, s.z); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.closePath();
  ctx.stroke();
  return map;
}
