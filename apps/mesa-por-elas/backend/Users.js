/**
 * Users.js — CRUD da aba "Users".
 *
 * Hierarquia de papéis (do topo para a base): admin > gestor > vendedora.
 *   - admin:     acesso total. Pode gerenciar (criar/editar/excluir)
 *                qualquer conta, inclusive outros administradores.
 *   - gestor:    tem quase as mesmas permissões de admin no resto do
 *                sistema (dashboard, vendas, etc.), mas dentro da tela de
 *                Usuários só pode gerenciar plenamente contas de vendedora.
 *                NÃO pode editar/excluir contas de admin, nem de outros
 *                gestores. NÃO pode promover ninguém (nem a si mesmo) para
 *                gestor ou admin. Pode editar a própria conta.
 *   - vendedora: nunca chega a chamar estas funções — Main.js já barra
 *                antes, no gate de sessão.
 *
 * Todas as funções aqui recebem "actorRole" (o papel de quem está fazendo a
 * ação, já validado em Main.js a partir da sessão) e, quando necessário,
 * "actorUsername" (para permitir que um gestor edite a própria conta).
 */

const USERS_HEADERS = ['user_id', 'name', 'email', 'login', 'password', 'role'];

function getUsersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
}

/** Lista usuários para exibição. A senha NUNCA é devolvida ao cliente. */
function readUsers() {
  const sheet = getUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, USERS_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        id: String(r[0]),
        name: r[1],
        email: r[2],
        login: r[3],
        role: r[5]
      };
    });
}

function findUserRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function findUserRowByLogin(sheet, login) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const logins = sheet.getRange(2, 4, lastRow - 1, 1).getValues(); // coluna D = Login
  for (let i = 0; i < logins.length; i++) {
    if (String(logins[i][0]).toLowerCase() === String(login).toLowerCase()) return i + 2;
  }
  return -1;
}

/** Conta quantos administradores existem, opcionalmente ignorando uma linha (para checar "sobra pelo menos 1"). */
function countAdmins(sheet, excludeRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, USERS_HEADERS.length).getValues();
  let count = 0;
  values.forEach(function (r, idx) {
    const rowNum = idx + 2;
    if (rowNum === excludeRow) return;
    if (String(r[5]).toLowerCase() === 'admin') count++;
  });
  return count;
}

/**
 * Próximo ID sequencial numérico (1, 2, 3...), calculado a partir do maior
 * ID já existente na aba — não do número de linhas. Isso evita colisão de
 * ID caso um usuário do meio já tenha sido excluído (o próximo ID nunca
 * "recua" e reaproveita um número antigo, igual um SERIAL de banco de dados).
 */
function getNextUserId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let max = 0;
  ids.forEach(function (r) {
    const n = Number(r[0]);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function addUser(user, actorRole) {
  if (!user || !user.name || !user.login || !user.password || !user.role) {
    return { ok: false, error: 'Preencha nome, login, senha e função.' };
  }
  const targetRole = String(user.role).toLowerCase();
  if (actorRole === 'gestor' && targetRole !== 'vendedora') {
    return { ok: false, error: 'Gestores só podem cadastrar contas de vendedora.' };
  }
  const sheet = getUsersSheet();
  if (findUserRowByLogin(sheet, user.login) !== -1) {
    return { ok: false, error: 'Já existe um usuário com esse login.' };
  }
  const id = getNextUserId(sheet);
  sheet.appendRow([id, user.name, user.email || '', user.login, user.password, user.role]);
  SpreadsheetApp.flush();
  return { ok: true, user: { id: String(id), name: user.name, email: user.email || '', login: user.login, role: user.role } };
}

/**
 * Atualiza um usuário. O campo "password" é opcional aqui: se vier vazio,
 * mantemos a senha atual (evita ter que redigitar a senha toda vez que só
 * se quer corrigir o nome ou e-mail, por exemplo).
 */
function updateUser(id, user, actorRole, actorUsername) {
  if (!user || !user.name || !user.login || !user.role) {
    return { ok: false, error: 'Preencha nome, login e função.' };
  }
  const sheet = getUsersSheet();
  const row = findUserRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Usuário não encontrado.' };

  const currentRole = String(sheet.getRange(row, 6).getValue()).toLowerCase();
  const currentLogin = String(sheet.getRange(row, 4).getValue());
  const targetRole = String(user.role).toLowerCase();
  const isSelf = actorUsername && currentLogin.toLowerCase() === String(actorUsername).toLowerCase();

  if (actorRole === 'gestor') {
    if (!isSelf) {
      if (currentRole === 'admin') {
        return { ok: false, error: 'Gestores não podem editar contas de Administrador.' };
      }
      if (currentRole === 'gestor') {
        return { ok: false, error: 'Gestores não podem editar contas de outros Gestores.' };
      }
    }
    // Impede promover alguém (ou a si mesmo) para Gestor/Administrador —
    // só é permitido manter o papel atual ou rebaixar para vendedora.
    if (targetRole !== currentRole && targetRole !== 'vendedora') {
      return { ok: false, error: 'Gestores não podem promover contas para Gestor ou Administrador.' };
    }
  }

  const existingLoginRow = findUserRowByLogin(sheet, user.login);
  if (existingLoginRow !== -1 && existingLoginRow !== row) {
    return { ok: false, error: 'Já existe outro usuário com esse login.' };
  }

  if (currentRole === 'admin' && targetRole !== 'admin' && countAdmins(sheet, row) === 0) {
    return { ok: false, error: 'Não é possível rebaixar o único administrador do sistema.' };
  }

  const currentPassword = sheet.getRange(row, 5).getValue();
  const newPassword = (user.password && String(user.password).length > 0) ? user.password : currentPassword;

  sheet.getRange(row, 2, 1, 5).setValues([[ user.name, user.email || '', user.login, newPassword, user.role ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function deleteUser(id, actorRole) {
  const sheet = getUsersSheet();
  const row = findUserRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Usuário não encontrado.' };

  const role = String(sheet.getRange(row, 6).getValue()).toLowerCase();

  if (actorRole === 'gestor' && (role === 'admin' || role === 'gestor')) {
    return { ok: false, error: 'Gestores não podem excluir contas de Administrador ou de outros Gestores.' };
  }
  if (role === 'admin' && countAdmins(sheet, row) === 0) {
    return { ok: false, error: 'Não é possível excluir o único administrador do sistema.' };
  }

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}
