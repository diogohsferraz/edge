/* Utilidades de formatação, datas e números (pt-BR). */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = (P.util = {});

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MASK = 'R$ •••••';

  U.MASK = MASK;

  U.money = function (v, hidden) {
    if (hidden) return MASK;
    return brl.format(v || 0);
  };

  U.signedMoney = function (v, hidden) {
    if (hidden) return MASK;
    v = v || 0;
    const s = brl.format(Math.abs(v));
    if (v > 0.004) return '+' + s;
    if (v < -0.004) return '−' + s;
    return s;
  };

  /** "R$ 350 mil", "R$ 1,2 mi" — para eixos de gráficos. */
  U.compact = function (v) {
    const a = Math.abs(v || 0);
    const sign = v < 0 ? '−' : '';
    const short = (x) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: x < 10 ? 1 : 0 }).format(x);
    if (a >= 1e6) return sign + 'R$ ' + short(a / 1e6) + ' mi';
    if (a >= 1e3) return sign + 'R$ ' + short(a / 1e3) + ' mil';
    return sign + 'R$ ' + short(a);
  };

  /** `v` em fração (0,05 = 5%). */
  U.pct = function (v, signed) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const s = pctFmt.format(v);
    return signed && v > 0.00005 ? '+' + s : s;
  };

  /** Número em formato editável: "1.234,56". */
  U.editable = function (v) {
    return v === null || v === undefined || v === '' ? '' : decFmt.format(v);
  };

  /** Converte "R$ 1.234,56", "1234,56", "1,234.56", "-500" em número. */
  U.parseNumber = function (raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    let s = String(raw).trim();
    if (!s) return null;
    let negative = false;
    if (/^\(.*\)$/.test(s) || s.includes('-') || s.includes('−')) negative = true;
    s = s.replace(/[^0-9.,]/g, '');
    if (!s) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (lastDot >= 0) {
      const parts = s.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = s.replace(/\./g, '');
    }
    const v = Number(s);
    if (!isFinite(v)) return null;
    return negative ? -v : v;
  };

  /** Minúsculo, sem acentos e com espaços normalizados. */
  U.norm = function (s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  };

  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  };

  U.escape = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ---------- Datas: sempre strings ISO "AAAA-MM-DD" (sem fuso) ----------

  const pad = (n) => String(n).padStart(2, '0');

  U.toISO = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  U.today = function () {
    return U.toISO(new Date());
  };

  U.isISO = function (s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  };

  U.monthKey = function (iso) {
    return String(iso).slice(0, 7);
  };

  U.addMonths = function (mk, n) {
    let [y, m] = mk.split('-').map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = ((((m - 1) % 12) + 12) % 12) + 1;
    return y + '-' + pad(m);
  };

  U.daysInMonth = function (mk) {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  U.monthStart = function (mk) {
    return mk + '-01';
  };

  U.monthEnd = function (mk) {
    return mk + '-' + pad(U.daysInMonth(mk));
  };

  U.monthRange = function (fromMk, toMk) {
    const out = [];
    let m = fromMk;
    let guard = 0;
    while (m <= toMk && guard++ < 1200) {
      out.push(m);
      m = U.addMonths(m, 1);
    }
    return out;
  };

  U.daysBetween = function (isoA, isoB) {
    const a = new Date(isoA + 'T12:00:00');
    const b = new Date(isoB + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  };

  U.fmtDate = function (iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  };

  U.fmtShortDate = function (iso) {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return d + '/' + m;
  };

  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  U.MONTHS = MONTHS;
  U.MONTHS_SHORT = MONTHS_SHORT;

  U.fmtMonth = function (mk) {
    const [y, m] = mk.split('-').map(Number);
    return MONTHS_SHORT[m - 1] + '/' + String(y).slice(2);
  };

  U.fmtMonthLong = function (mk) {
    const [y, m] = mk.split('-').map(Number);
    const name = MONTHS[m - 1];
    return name.charAt(0).toUpperCase() + name.slice(1) + ' de ' + y;
  };

  U.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
