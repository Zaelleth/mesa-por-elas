/**
 * Auth.js — Autenticação, sessões e controle de acesso.
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

const SHEET_AUTH = 'Auth';

/**
 * Sessões temporárias: cada login bem-sucedido gera um token aleatório,
 * guardado no CacheService (não na planilha) com validade de algumas horas.
 * Diferente do token fixo, esse token não é permanente e some sozinho.
 */
function isValidSession(token) {
  if (typeof token !== 'string' || !token) return false;
  const cache = CacheService.getScriptCache();
  const role = cache.get('session_' + token);
  if (!role) return false;
  cache.put('session_' + token, role, SESSION_TTL_SECONDS); // renova a validade a cada uso
  return true;
}

function isValidBootstrapToken(token) {
  return typeof token === 'string' && token.length > 0 && token === BOOTSTRAP_TOKEN;
}

function login(username, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AUTH);
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), 3).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === String(username).toLowerCase()) {
      const ok = String(values[i][1]) === String(password);
      if (!ok) return { ok: false, error: 'Usuário ou senha incorretos.' };
      const actualUsername = String(values[i][0]);
      const role = String(values[i][2] || 'vendedora');
      const sessionToken = Utilities.getUuid();
      CacheService.getScriptCache().put('session_' + sessionToken, actualUsername, SESSION_TTL_SECONDS);
      return { ok: true, username: actualUsername, role: role, sessionToken: sessionToken };
    }
  }
  return { ok: false, error: 'Usuário ou senha incorretos.' };
}

/** Lista os nomes de usuário cadastrados com o papel "vendedora". */
function getSellers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AUTH);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  return values
    .filter(function (r) { return r[0] && String(r[2]).toLowerCase() === 'vendedora'; })
    .map(function (r) { return String(r[0]); });
}
