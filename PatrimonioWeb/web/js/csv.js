/* Importação e exportação de planilhas CSV (Excel / Google Planilhas). */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;
  const CSV = (P.csv = {});

  CSV.detectDelimiter = function (line) {
    const counts = [';', '\t', ','].map((d) => [d, line.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ';';
  };

  /** Parser CSV com suporte a campos entre aspas. */
  CSV.parse = function (text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const firstLine = text.split('\n').find((l) => l.trim()) || '';
    const delim = CSV.detectDelimiter(firstLine);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const src = text + '\n';
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === delim) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n') {
        row.push(field.trim());
        field = '';
        if (row.some((c) => c !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
    return rows;
  };

  /** "31/01/2026", "2026-01-31", "31/01/26" → "2026-01-31". */
  CSV.parseDate = function (raw) {
    const s = String(raw || '').trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return valid(y, +m[2], +m[1]);
    }
    return null;
  };

  function valid(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1) return null;
    const mk = y + '-' + String(mo).padStart(2, '0');
    if (d > U.daysInMonth(mk)) return null;
    return mk + '-' + String(d).padStart(2, '0');
  }

  const MONTH_NAMES = U.MONTHS.map(U.norm);

  /** Cabeçalho de mês: "01/2026", "jan/26", "Janeiro 2026", "2026-01" → último dia do mês. */
  CSV.parseMonthHeader = function (raw) {
    const s = U.norm(raw).replace(/\./g, '').replace(/ de /g, ' ');
    if (!s) return null;
    const full = CSV.parseDate(s);
    if (full) return full;
    let m, y, mo;
    if ((m = s.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/))) {
      mo = +m[1];
      y = +m[2];
    } else if ((m = s.match(/^(\d{4})[/-](\d{1,2})$/))) {
      y = +m[1];
      mo = +m[2];
    } else if ((m = s.match(/^([a-zç]+)[/ -]?(\d{2}|\d{4})$/))) {
      const name = m[1];
      const idx = MONTH_NAMES.findIndex((n) => n === name || n.slice(0, 3) === name.slice(0, 3));
      if (idx < 0 || name.length < 3) return null;
      mo = idx + 1;
      y = +m[2];
    } else return null;
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12) return null;
    return U.monthEnd(y + '-' + String(mo).padStart(2, '0'));
  };

  const ALIASES = {
    date: ['data', 'date', 'dia'],
    institution: ['instituicao', 'banco', 'corretora', 'local', 'conta'],
    asset: ['ativo', 'investimento', 'nome', 'produto', 'aplicacao', 'descricao'],
    assetClass: ['classe', 'tipo', 'categoria', 'classe de ativo'],
    balance: ['saldo', 'valor', 'valor atual', 'saldo atual', 'patrimonio', 'posicao'],
    aporte: ['aporte', 'aportes', 'aplicado', 'deposito'],
    resgate: ['resgate', 'resgates', 'retirada', 'saque'],
    provento: ['proventos', 'provento', 'dividendos', 'rendimentos pagos', 'juros recebidos'],
    ticker: ['ticker', 'codigo'],
  };

  function columnFor(header) {
    const k = U.norm(header);
    for (const col in ALIASES) if (ALIASES[col].includes(k)) return col;
    return null;
  }

  /**
   * Importa o texto CSV para o store. Aceita:
   *  1. linhas: data;instituicao;ativo;classe;saldo;aporte;resgate;proventos
   *  2. colunas por mês: instituicao;ativo;classe;01/2026;02/2026;...
   */
  CSV.importInto = function (store, text) {
    const rows = CSV.parse(text);
    if (rows.length < 2) throw new Error('O arquivo está vazio ou só tem cabeçalho.');
    const header = rows[0];
    const map = {};
    const monthCols = [];
    header.forEach((h, i) => {
      const col = columnFor(h);
      if (col && map[col] === undefined) map[col] = i;
      else {
        const m = CSV.parseMonthHeader(h);
        if (m) monthCols.push([i, m]);
      }
    });
    if (map.asset === undefined) throw new Error('Não encontrei a coluna "ativo" (nome do investimento).');
    if (map.date === undefined && !monthCols.length) {
      throw new Error('Inclua uma coluna "data" ou colunas com meses (ex.: 01/2026).');
    }

    const data = store.data;
    const summary = { institutionsCreated: 0, assetsCreated: 0, balances: 0, movements: 0, skipped: 0 };
    const cache = {};
    const touched = new Set();
    const cell = (row, col) => (map[col] !== undefined && map[col] < row.length ? row[map[col]] : '');

    function resolveAsset(row) {
      const name = (row[map.asset] || '').trim();
      if (!name) return null;
      const instName = cell(row, 'institution').trim() || 'Sem instituição';
      const key = U.norm(instName) + '|' + U.norm(name);
      if (cache[key]) return cache[key];
      const r = store.findOrCreateInstitution(instName, false);
      if (r.created) summary.institutionsCreated++;
      let asset = data.assets.find((a) => a.institutionId === r.inst.id && U.norm(a.name) === U.norm(name));
      if (!asset) {
        const clsText = cell(row, 'assetClass');
        asset = store.saveAsset(
          { name, classId: P.matchClass(clsText || name), institutionId: r.inst.id, ticker: cell(row, 'ticker'), indexer: '', maturity: null, notes: '' },
          0,
          null,
          false
        );
        summary.assetsCreated++;
      }
      cache[key] = asset;
      return asset;
    }

    if (map.date === undefined) {
      rows.slice(1).forEach((row) => {
        const asset = resolveAsset(row);
        if (!asset) return summary.skipped++;
        touched.add(asset.id);
        monthCols.forEach(([i, iso]) => {
          const v = U.parseNumber(row[i]);
          if (v === null) return;
          store.recordBalance(asset.id, iso, v, false);
          summary.balances++;
        });
      });
    } else {
      rows.slice(1).forEach((row) => {
        const date = CSV.parseDate(cell(row, 'date'));
        const asset = date && resolveAsset(row);
        if (!asset) return summary.skipped++;
        touched.add(asset.id);
        const bal = U.parseNumber(cell(row, 'balance'));
        if (bal !== null) {
          store.recordBalance(asset.id, date, bal, false);
          summary.balances++;
        }
        const ap = U.parseNumber(cell(row, 'aporte'));
        if (ap) {
          store.recordMovement(asset.id, ap > 0 ? 'aporte' : 'resgate', Math.abs(ap), date, '', false);
          summary.movements++;
        }
        const rs = U.parseNumber(cell(row, 'resgate'));
        if (rs) {
          store.recordMovement(asset.id, 'resgate', Math.abs(rs), date, '', false);
          summary.movements++;
        }
        const pv = U.parseNumber(cell(row, 'provento'));
        if (pv) {
          store.recordMovement(asset.id, 'provento', Math.abs(pv), date, '', false);
          summary.movements++;
        }
      });
    }

    // Sem aportes registrados: o primeiro saldo vira a posição inicial.
    touched.forEach((id) => {
      if (store.movementsOf(id).length) return;
      const first = store.snapshotsOf(id)[0];
      if (first && first.value > 0) {
        store.recordMovement(id, 'aporte', first.value, first.date, 'Posição inicial (importação)', false);
        summary.movements++;
      }
    });

    store.commit();
    return summary;
  };

  CSV.describe = function (s) {
    let t = 'Importados: ' + s.balances + ' saldos, ' + s.movements + ' movimentações';
    if (s.assetsCreated) t += ', ' + s.assetsCreated + ' investimentos novos';
    if (s.institutionsCreated) t += ', ' + s.institutionsCreated + ' instituições novas';
    t += '.';
    if (s.skipped) t += ' ' + s.skipped + ' linha(s) ignorada(s).';
    return t;
  };

  function esc(s) {
    s = String(s === null || s === undefined ? '' : s);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const num = (v) => U.editable(v).replace(/\./g, '');

  CSV.exportPortfolio = function (store) {
    const data = store.data;
    const out = ['data;instituicao;ativo;classe;saldo;aporte;resgate;proventos'];
    const instName = (id) => (store.institution(id) || { name: 'Sem instituição' }).name;
    const assets = data.assets.slice().sort((a, b) => (instName(a.institutionId) + a.name).localeCompare(instName(b.institutionId) + b.name));
    assets.forEach((a) => {
      const lines = {};
      const line = (d) => (lines[d] = lines[d] || { balance: null, aporte: 0, resgate: 0, provento: 0 });
      store.snapshotsOf(a.id).forEach((s) => (line(s.date).balance = s.value));
      store.movementsOf(a.id).forEach((m) => (line(m.date)[m.kind] += m.amount));
      Object.keys(lines)
        .sort()
        .forEach((d) => {
          const l = lines[d];
          out.push(
            [
              U.fmtDate(d),
              instName(a.institutionId),
              a.name,
              P.classById(a.classId).title,
              l.balance === null ? '' : num(l.balance),
              l.aporte ? num(l.aporte) : '',
              l.resgate ? num(l.resgate) : '',
              l.provento ? num(l.provento) : '',
            ]
              .map(esc)
              .join(';')
          );
        });
    });
    return out.join('\n');
  };

  CSV.exportTransactions = function (store) {
    const out = ['data;tipo;categoria;valor;descricao'];
    store.data.transactions
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((t) => {
        out.push([U.fmtDate(t.date), t.income ? 'Receita' : 'Despesa', P.categoryById(t.category).title, num(t.amount), t.note].map(esc).join(';'));
      });
    return out.join('\n');
  };

  CSV.TEMPLATE_ROWS = [
    'data;instituicao;ativo;classe;saldo;aporte;resgate;proventos',
    '31/01/2026;Nubank;Caixinha Reserva;Conta e Poupança;10.000,00;10.000,00;;',
    '31/01/2026;XP Investimentos;CDB 110% CDI;Renda Fixa;25.000,00;25.000,00;;',
    '28/02/2026;Nubank;Caixinha Reserva;Conta e Poupança;10.500,00;400,00;;',
    '28/02/2026;XP Investimentos;CDB 110% CDI;Renda Fixa;25.260,00;;;',
  ].join('\n');

  CSV.TEMPLATE_MONTHS = [
    'instituicao;ativo;classe;01/2026;02/2026;03/2026',
    'Nubank;Caixinha;Conta;10.000;10.450;10.980',
    'XP;CDB 110% CDI;Renda Fixa;25.000;25.260;25.530',
    'XP;Tesouro IPCA+ 2035;Tesouro;8.000;8.120;8.090',
  ].join('\n');
})(typeof window !== 'undefined' ? window : globalThis);
