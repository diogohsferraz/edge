// Verifica se as pistas não se cruzam nem têm curvas fechadas demais.
const THREE = require('../web/lib/three.min.js');
const defs = require('../web/js/tracks-data.js');
let bad = false;
for (const d of defs) {
  const curve = new THREE.CatmullRomCurve3(d.points.map((p) => new THREE.Vector3(p[0], p[2], p[1])), true, 'centripetal');
  const len = curve.getLength(); const N = Math.round(len / 1.5);
  const pts = curve.getSpacedPoints(N).slice(0, N);
  const clear = d.width + 2 * 6 + 6; let minD = 1e9, minPair;
  const skip = Math.ceil((clear * 2) / (len / N));
  for (let i = 0; i < N; i++) for (let j = i + skip; j < N; j++) {
    if (N - (j - i) < skip) continue;
    const dd = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
    if (dd < minD) { minD = dd; minPair = [i, j]; }
  }
  let minR = 1e9;
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 4 + N) % N], b = pts[i], c = pts[(i + 4) % N];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh;
    const r = (8 * len / N) / Math.max(dh, 1e-6); if (r < minR) minR = r;
  }
  const ok = minD > clear && minR > 14;
  if (!ok) bad = true;
  console.log(`${d.id}: comprimento ${len.toFixed(0)} m, separação mínima ${minD.toFixed(1)} (precisa > ${clear}) em ${minPair}, raio mínimo ${minR.toFixed(1)} m ${ok ? 'OK' : 'FALHA'}`);
}
process.exit(bad ? 1 : 0);
