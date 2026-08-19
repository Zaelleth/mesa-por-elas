/**
 * Auth.js — Autenticação, sessões e controle de acesso.
 * O cadastro de usuários em si (CRUD) vive em Users.js — este arquivo cuida
 * só de login e da validade da sessão.
 */

// >>> TROQUE por uma string secreta só sua (ex: "mesa-elas-2026-x7f9q") <<<
// Precisa ser IGUAL ao valor de BOOTSTRAP_TOKEN em js/config.js no frontend.
// Esse token só é usado para poder TENTAR fazer login — depois disso, quem
// autentica de verdade é a sessão temporária gerada abaixo.
const BOOTSTRAP_TOKEN = 'ricardinho-guilerme-bagui-complica';

// Duração da sessão (em segundos). 21600 = 6 horas, o máximo permitido pelo
// CacheService do Apps Script. A sessão se renova sozinha a cada ação feita
// no app, então na prática ela não expira enquanto a pessoa estiver ativa.
const SESSION_TTL_SECONDS = 21600;

const SHEET_USERS = 'users';

/**
 * Sessões temporárias: cada login bem-sucedido gera um token aleatório,
 * guardado no CacheService (não na planilha) com validade de algumas horas.
 * O valor guardado é um JSON com {username, name, role} — assim, ações que
 * exigem checar o papel (ex: telas de administrador) não precisam reabrir a
 * planilha a cada clique, só ler o cache.
 */
function getSessionData(token) {
  if (typeof token !== 'string' || !token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('session_' + token);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    cache.put('session_' + token, raw, SESSION_TTL_SECONDS); // renova a validade a cada uso
    return data;
  } catch (e) {
    return null;
  }
}

function isValidSession(token) {
  return !!getSessionData(token);
}

/** Uso: gate de ações restritas a quem está acima da vendedora na hierarquia. */
function isAdminOrGestorSession(token) {
  const data = getSessionData(token);
  return !!data && (data.role === 'admin' || data.role === 'gestor');
}

function isValidBootstrapToken(token) {
  return typeof token === 'string' && token.length > 0 && token === BOOTSTRAP_TOKEN;
}

function login(username, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), USERS_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    // Colunas: ID(0) Nome(1) Email(2) Login(3) Senha(4) Função(5)
    if (String(values[i][3]).toLowerCase() === String(username).toLowerCase()) {
      const ok = String(values[i][4]) === String(password);
      if (!ok) return { ok: false, error: 'Usuário ou senha incorretos.' };
      const name = String(values[i][1]);
      const loginValue = String(values[i][3]);
      const role = String(values[i][5] || 'vendedora');
      const sessionToken = Utilities.getUuid();
      const sessionPayload = JSON.stringify({ username: loginValue, name: name, role: role });
      CacheService.getScriptCache().put('session_' + sessionToken, sessionPayload, SESSION_TTL_SECONDS);
      return { ok: true, username: loginValue, name: name, role: role, sessionToken: sessionToken };
    }
  }
  return { ok: false, error: 'Usuário ou senha incorretos.' };
}

/** Lista os logins cadastrados com a função "vendedora" (usado no formulário de venda). */
function getSellers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, USERS_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0] && String(r[5]).toLowerCase() === 'vendedora'; })
    .map(function (r) { return String(r[3]); }); // Login
}
