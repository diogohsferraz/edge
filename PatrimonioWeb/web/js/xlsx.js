/* Leitor mínimo de planilhas Excel (.xlsx): abre o zip e lê as células (valores já calculados). */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const X = (P.xlsx = {});

  /** Arquivo .xlsx (zip)? */
  X.isXlsx = function (buffer) {
    const b = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  };

  // ---------------------------------------------------------------------
  // Zip
  // ---------------------------------------------------------------------

  function readZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('O arquivo não parece ser uma planilha .xlsx válida.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      entries[name] = { method, data: bytes.subarray(start, start + size) };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function inflate(data) {
    if (X.inflateRaw) return X.inflateRaw(data);
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não consegue abrir .xlsx. Salve a planilha como CSV e importe o CSV.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(data).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const chunks = [];
    let len = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      len += value.length;
    }
    const out = new Uint8Array(len);
    let o = 0;
    chunks.forEach((c) => {
      out.set(c, o);
      o += c.length;
    });
    return out;
  }

  async function entryText(entries, name) {
    const e = entries[name];
    if (!e) return null;
    const raw = e.method === 0 ? e.data : await inflate(e.data);
    return new TextDecoder('utf-8').decode(raw);
  }

  // ---------------------------------------------------------------------
  // XML
  // ---------------------------------------------------------------------

  function decode(s) {
    return s
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function attr(attrs, name) {
    const m = attrs.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"'));
    return m ? decode(m[1]) : null;
  }

  /** Texto de um <si> ou <is>: junta os <t>, ignorando a guia fonética (<rPh>). */
  function richText(xml) {
    xml = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let out = '';
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(xml))) out += decode(m[1]);
    return out;
  }

  const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);

  function isDateFormat(code) {
    const s = String(code || '')
      .replace(/"[^"]*"/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\\./g, '');
    return /[dy]/i.test(s) || /m{3,}/i.test(s);
  }

  function parseStyles(xml) {
    if (!xml) return [];
    const custom = {};
    let m;
    const fmtRe = /<numFmt\b([^>]*)\/?>/g;
    while ((m = fmtRe.exec(xml))) custom[attr(m[1], 'numFmtId')] = attr(m[1], 'formatCode');
    const cellXfs = (xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [''])[0];
    const out = [];
    const xfRe = /<xf\b([^>]*?)\/?>/g;
    while ((m = xfRe.exec(cellXfs))) {
      const id = Number(attr(m[1], 'numFmtId') || 0);
      out.push(DATE_FORMAT_IDS.has(id) || (custom[id] !== undefined && isDateFormat(custom[id])));
    }
    return out;
  }

  /** Número de série do Excel → "aaaa-mm-dd". */
  X.serialToISO = function (serial, date1904) {
    const days = Math.floor(serial) + (date1904 ? 1462 : 0);
    const d = new Date(Math.round((days - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  };

  function colIndex(ref) {
    const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function parseSheet(xml, shared, dateStyles, date1904) {
    const rows = [];
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let rm;
    let nextRow = 0;
    while ((rm = rowRe.exec(xml))) {
      const r = attr(rm[1], 'r');
      const ri = r ? Number(r) - 1 : nextRow;
      nextRow = ri + 1;
      if (!rm[2]) continue;
      const row = [];
      let cm;
      let nextCol = 0;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(rm[2]))) {
        const ref = attr(cm[1], 'r');
        const ci = ref ? colIndex(ref) : nextCol;
        nextCol = ci + 1;
        const body = cm[2] || '';
        const t = attr(cm[1], 't') || 'n';
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        const v = vm ? decode(vm[1]) : null;
        let value = null;
        if (t === 's') value = v === null ? null : shared[Number(v)];
        else if (t === 'inlineStr') value = richText(body);
        else if (t === 'str') value = v;
        else if (t === 'b') value = v === '1';
        else if (t === 'e') value = v;
        else if (v !== null && v !== '') {
          const num = Number(v);
          const style = Number(attr(cm[1], 's') || 0);
          value = dateStyles[style] && num > 0 && num < 2958466 ? X.serialToISO(num, date1904) : num;
        }
        if (value !== null && value !== undefined && value !== '') row[ci] = value;
      }
      if (row.length) rows[ri] = row;
    }
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i]) rows[i] = [];
      for (let j = 0; j < rows[i].length; j++) if (rows[i][j] === undefined) rows[i][j] = null;
    }
    return rows;
  }

  /**
   * Lê um .xlsx. Devolve [{ name, rows }], onde rows é uma grade (array de linhas) com
   * números, textos, booleanos e datas no formato "aaaa-mm-dd". Fórmulas trazem o valor calculado.
   */
  X.read = async function (buffer) {
    const entries = readZip(buffer);
    const wb = await entryText(entries, 'xl/workbook.xml');
    if (!wb) throw new Error('O arquivo não parece ser uma planilha .xlsx válida.');
    const rels = (await entryText(entries, 'xl/_rels/workbook.xml.rels')) || '';
    const targets = {};
    let m;
    const relRe = /<Relationship\b([^>]*?)\/?>/g;
    while ((m = relRe.exec(rels))) targets[attr(m[1], 'Id')] = attr(m[1], 'Target');

    const sharedXml = await entryText(entries, 'xl/sharedStrings.xml');
    const shared = [];
    if (sharedXml) {
      const siRe = /<si>([\s\S]*?)<\/si>|<si\/>/g;
      while ((m = siRe.exec(sharedXml))) shared.push(m[1] ? richText(m[1]) : '');
    }
    const dateStyles = parseStyles(await entryText(entries, 'xl/styles.xml'));
    const date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wb);

    const sheets = [];
    const sheetRe = /<sheet\b([^>]*?)\/?>/g;
    while ((m = sheetRe.exec(wb))) {
      const target = targets[attr(m[1], 'r:id')];
      if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const xml = await entryText(entries, path);
      if (xml) sheets.push({ name: attr(m[1], 'name') || 'Planilha', rows: parseSheet(xml, shared, dateStyles, date1904) });
    }
    if (!sheets.length) throw new Error('Não encontrei nenhuma aba nesta planilha.');
    return sheets;
  };

  /** Grade → texto CSV (;), para reaproveitar os importadores de CSV. */
  X.toCSV = function (rows) {
    const cell = (v) => {
      if (v === null || v === undefined) return '';
      let s;
      if (typeof v === 'number') s = String(v).replace('.', ',');
      else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) s = v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4);
      else s = String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return rows.map((r) => (r || []).map(cell).join(';')).join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
