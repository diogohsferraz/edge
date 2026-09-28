/* Onde os dados ficam: Planilha Google (Apps Script), arquivo no Windows (Electron) ou navegador. */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});

  const SGS_URL = (code) => {
    const f = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    const end = new Date();
    const start = new Date(end.getFullYear() - 10, end.getMonth(), 1);
    return 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + code + '/dados?formato=json&dataInicial=' + f(start) + '&dataFinal=' + f(end);
  };
  P.SGS_URL = SGS_URL;

  function downloadBlob(name, content, mime) {
    const blob = new Blob(['﻿' + content], { type: mime || 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
    return Promise.resolve({ message: 'Arquivo "' + name + '" baixado.' });
  }

  // ---- Google Apps Script (dados numa Planilha Google) ----
  function appsScriptBackend() {
    const run = (fn, ...args) =>
      new Promise((resolve, reject) => {
        g.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args);
      });
    return {
      id: 'appsscript',
      label: 'Planilha Google',
      async load() {
        const json = await run('getData');
        return json ? JSON.parse(json) : null;
      },
      save(data) {
        return run('saveData', JSON.stringify(data));
      },
      async fetchSeries(code) {
        return JSON.parse(await run('fetchSeries', code));
      },
      async saveFile(name, content) {
        const url = await run('exportToDrive', name, content);
        return { message: 'Arquivo salvo no seu Google Drive.', url };
      },
      async info() {
        return JSON.parse(await run('getInfo'));
      },
    };
  }

  // ---- Windows (Electron): arquivo JSON na pasta do usuário ----
  function desktopBackend() {
    const api = g.desktopAPI;
    return {
      id: 'desktop',
      label: 'Este computador',
      async load() {
        const json = await api.load();
        return json ? JSON.parse(json) : null;
      },
      save(data) {
        return api.save(JSON.stringify(data, null, 1));
      },
      async fetchSeries(code) {
        return JSON.parse(await api.fetchText(SGS_URL(code)));
      },
      async saveFile(name, content) {
        const path = await api.saveFile(name, '﻿' + content);
        return { message: path ? 'Arquivo salvo em ' + path : 'Exportação cancelada.' };
      },
      async info() {
        return { location: await api.dataPath() };
      },
    };
  }

  // ---- Navegador comum: localStorage ----
  function localBackend() {
    const KEY = 'patrimonio.data.v1';
    return {
      id: 'local',
      label: 'Este navegador',
      async load() {
        const json = g.localStorage.getItem(KEY);
        return json ? JSON.parse(json) : null;
      },
      async save(data) {
        g.localStorage.setItem(KEY, JSON.stringify(data));
      },
      async fetchSeries(code) {
        const res = await fetch(SGS_URL(code));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      },
      saveFile: (name, content) => downloadBlob(name, content),
      async info() {
        return { location: 'Armazenamento local do navegador' };
      },
    };
  }

  P.detectBackend = function () {
    if (g.google && g.google.script && g.google.script.run) return appsScriptBackend();
    if (g.desktopAPI) return desktopBackend();
    return localBackend();
  };
  P.downloadBlob = downloadBlob;

  /** Converte a resposta do SGS em { "AAAA-MM": fração }. */
  P.parseSeries = function (items) {
    const out = {};
    (items || []).forEach((it) => {
      const m = String(it.data).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const v = Number(String(it.valor).replace(',', '.'));
      if (m && isFinite(v)) out[m[3] + '-' + m[2]] = v / 100;
    });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
