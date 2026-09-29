/*
 * Acesso com usuário e senha. Os dados são gravados criptografados (AES-256-GCM) com uma chave
 * derivada do usuário e da senha (PBKDF2-SHA-256). Sem a senha não há como ler o arquivo, e
 * também não há como recuperá-la: por isso o app pede para guardar um backup.
 */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const V = (P.vault = {});

  const ITERATIONS = 600000;
  const MAGIC = 'patrimonio-cifrado';

  const subtle = () => {
    const c = g.crypto;
    if (!c || !c.subtle) throw new Error('Este navegador não oferece criptografia. Use o app do Windows ou um navegador atualizado.');
    return c.subtle;
  };
  V.available = function () {
    try {
      return !!subtle();
    } catch (e) {
      return false;
    }
  };

  function toB64(bytes) {
    let s = '';
    const b = new Uint8Array(bytes);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return g.btoa(s);
  }
  function fromB64(s) {
    const bin = g.atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const random = (n) => g.crypto.getRandomValues(new Uint8Array(n));
  const normUser = (u) => String(u || '').trim().toLowerCase();

  /** O objeto lido do armazenamento está criptografado? */
  V.isEnvelope = (raw) => !!(raw && typeof raw === 'object' && raw.format === MAGIC && raw.data && raw.iv && raw.salt);

  async function deriveKey(user, password, salt, iterations) {
    const material = await subtle().importKey('raw', new TextEncoder().encode(normUser(user) + '\n' + password), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** Nova sessão (ao criar ou trocar a senha): chave e sal novos. */
  V.createSession = async function (user, password) {
    if (!normUser(user)) throw new Error('Informe um usuário.');
    if (String(password || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    const salt = random(16);
    return { key: await deriveKey(user, password, salt, ITERATIONS), salt, iterations: ITERATIONS };
  };

  /** Abre um envelope com usuário e senha. Devolve { data, session } ou lança "Usuário ou senha incorretos". */
  V.open = async function (envelope, user, password) {
    const salt = fromB64(envelope.salt);
    const iterations = Number(envelope.iterations) || ITERATIONS;
    const key = await deriveKey(user, password, salt, iterations);
    const session = { key, salt, iterations };
    return { data: await V.decrypt(session, envelope), session };
  };

  V.decrypt = async function (session, envelope) {
    let plain;
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, session.key, fromB64(envelope.data));
    } catch (e) {
      throw new Error('Usuário ou senha incorretos.');
    }
    return JSON.parse(new TextDecoder().decode(plain));
  };

  V.encrypt = async function (session, data) {
    const iv = random(12);
    const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, session.key, new TextEncoder().encode(JSON.stringify(data)));
    return {
      format: MAGIC,
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: session.iterations,
      salt: toB64(session.salt),
      iv: toB64(iv),
      data: toB64(cipher),
    };
  };

  /** Backend cuja primeira leitura devolve `first` (já lido), sem buscar de novo. */
  V.primed = function (backend, first) {
    let used = false;
    const load = backend.load;
    return Object.assign({}, backend, {
      async load() {
        if (!used) {
          used = true;
          return first;
        }
        return load.call(backend);
      },
    });
  };

  /** Envolve um backend para ler e gravar criptografado com a sessão aberta. */
  V.wrap = function (inner, session) {
    return Object.assign({}, inner, {
      encrypted: true,
      inner,
      async load() {
        const raw = await inner.load();
        return V.isEnvelope(raw) ? V.decrypt(session, raw) : raw;
      },
      async save(data) {
        return inner.save(await V.encrypt(session, data));
      },
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
