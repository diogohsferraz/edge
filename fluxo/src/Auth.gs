/** Autenticação por e-mail e senha, com sessões guardadas na planilha. */

var SESSION_DAYS = 7;

function hashPassword(password, salt) {
  var h = salt + ':' + password;
  for (var i = 0; i < 300; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  }
  return h;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password) {
  if (!password || String(password).length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
}

function findUserByEmail(email) {
  var e = normalizeEmail(email);
  var list = Db.where('users', function (u) { return u.email === e; });
  return list[0] || null;
}

function insertUser(email, name, password, role) {
  email = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
  if (!String(name || '').trim()) throw new Error('Informe o nome.');
  validatePassword(password);
  if (findUserByEmail(email)) throw new Error('Já existe um usuário com esse e-mail.');
  var salt = Utilities.getUuid();
  return Db.insert('users', {
    id: newId('u'), email: email, name: String(name).trim(),
    passwordHash: hashPassword(password, salt), salt: salt,
    role: role, active: true, createdAt: nowIso()
  });
}

/** Cadastro aberto apenas para o primeiro usuário (vira administrador). */
function register(email, name, password) {
  var any = Db.all('users').length > 0;
  var allowSignup = PropertiesService.getScriptProperties().getProperty('ALLOW_SIGNUP') === 'true';
  if (any && !allowSignup) throw new Error('O cadastro está fechado. Peça acesso a um administrador.');
  var user = insertUser(email, name, password, any ? 'member' : 'admin');
  return startSession(user);
}

function login(email, password) {
  var user = findUserByEmail(email);
  if (!user || !isTrue(user.active) || hashPassword(String(password || ''), user.salt) !== user.passwordHash) {
    Utilities.sleep(400);
    throw new Error('E-mail ou senha incorretos.');
  }
  return startSession(user);
}

function startSession(user) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  Db.removeWhere('sessions', function (s) { return s.expiresAt < nowIso(); });
  Db.insert('sessions', { id: token, userId: user.id, expiresAt: expires, createdAt: nowIso() });
  return { token: token, user: publicUser(user) };
}

function userFromToken(token) {
  if (!token) return null;
  var s = Db.get('sessions', String(token));
  if (!s || s.expiresAt < nowIso()) return null;
  var user = Db.get('users', s.userId);
  if (!user || !isTrue(user.active)) return null;
  return user;
}

function logout(token) {
  Db.remove('sessions', token);
  return true;
}

function changePassword(user, current, next) {
  if (hashPassword(String(current || ''), user.salt) !== user.passwordHash) throw new Error('Senha atual incorreta.');
  validatePassword(next);
  var salt = Utilities.getUuid();
  Db.update('users', user.id, { salt: salt, passwordHash: hashPassword(next, salt) });
  return true;
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, active: isTrue(u.active) };
}

function listUsers() {
  return Db.all('users').map(publicUser);
}

function createUserByAdmin(a) {
  return publicUser(insertUser(a.email, a.name, a.password, a.role === 'admin' ? 'admin' : 'member'));
}

function updateUser(ctx, id, patch) {
  var allowed = {};
  if (patch.name !== undefined) allowed.name = String(patch.name).trim();
  if (patch.role !== undefined) allowed.role = patch.role === 'admin' ? 'admin' : 'member';
  if (patch.active !== undefined) allowed.active = !!patch.active;
  if (id === ctx.user.id && (allowed.role === 'member' || allowed.active === false)) {
    throw new Error('Você não pode remover o seu próprio acesso de administrador.');
  }
  var u = Db.update('users', id, allowed);
  if (allowed.active === false) Db.removeWhere('sessions', function (s) { return s.userId === id; });
  return publicUser(u);
}

function resetPassword(id, password) {
  validatePassword(password);
  var salt = Utilities.getUuid();
  Db.update('users', id, { salt: salt, passwordHash: hashPassword(password, salt) });
  Db.removeWhere('sessions', function (s) { return s.userId === id; });
  return true;
}
