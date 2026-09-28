// Gera as versões a partir da interface única em web/:
//   appscript/Index.html, Styles.html, Scripts.html  → Google Apps Script
//   windows/web/                                     → app Windows (Electron)
//   dist/Patrimonio.html                             → arquivo único offline (duplo clique)
//
// Uso: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  console.log('  ✓', path.relative(root, p), `(${Math.round(s.length / 1024)} KB)`);
};

const favicon = 'data:image/png;base64,' + fs.readFileSync(path.join(web, 'favicon.png')).toString('base64');
const html = read('index.html');
const inlineFavicon = (h) => h.replace('href="favicon.png"', () => `href="${favicon}"`);
const css = read('styles.css');
const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const appScripts = scriptSrcs.filter((s) => !s.startsWith('vendor/'));
const vendor = scriptSrcs.filter((s) => s.startsWith('vendor/'));
const block = (name) => new RegExp(`<!-- @@${name} -->[\\s\\S]*?<!-- @@END_${name} -->`);
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');
const bundle = appScripts.map((s) => `/* ${s} */\n${read(s)}`).join('\n');

console.log('Apps Script:');
const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
write(
  path.join(root, 'appscript', 'Index.html'),
  inlineFavicon(html)
    .replace(block('STYLES'), () => "<?!= include('Styles'); ?>")
    .replace(block('SCRIPTS'), () => `<script src="${CHART_CDN}"></script>\n  <?!= include('Scripts'); ?>`)
);
write(path.join(root, 'appscript', 'Styles.html'), `<style>\n${css}\n</style>\n`);
write(path.join(root, 'appscript', 'Scripts.html'), `<script>\n${safe(bundle)}\n</script>\n`);

console.log('Windows (Electron):');
const winWeb = path.join(root, 'windows', 'web');
fs.rmSync(winWeb, { recursive: true, force: true });
fs.cpSync(web, winWeb, { recursive: true });
console.log('  ✓', path.relative(root, winWeb) + '/');

console.log('Arquivo único:');
write(
  path.join(root, 'dist', 'Patrimonio.html'),
  inlineFavicon(html)
    .replace(block('STYLES'), () => `<style>\n${css}\n</style>`)
    .replace(block('SCRIPTS'), () => [...vendor.map((v) => `<script>\n${safe(read(v))}\n</script>`), `<script>\n${safe(bundle)}\n</script>`].join('\n'))
);
