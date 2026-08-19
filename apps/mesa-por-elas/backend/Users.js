/**
 * Users.js — CRUD da aba "users".
 * Schema: user_id | name | email | login | password | role | active
 *
 * Hierarquia de papéis (do topo para a base): admin > gestor > vendedora.
 *   - admin:     acesso total. Pode gerenciar (criar/editar/excluir/
 *                inativar) qualquer conta, inclusive outros administradores.
 *   - gestor:    tem quase as mesmas permissões de admin no resto do
 *                sistema (dashboard, vendas, etc.), mas dentro da tela de
 *                Usuários só pode gerenciar plenamente contas de vendedora.
 *                NÃO pode editar/excluir/inativar contas de admin, nem de
 *                outros gestores. NÃO pode promover ninguém (nem a si
 *                mesmo) para gestor ou admin. Pode editar a própria conta
 *                (mas não inativar a própria conta — ver setUserActive).
 *   - vendedora: nunca chega a chamar estas funções — Main.js já barra
 *                antes, no gate de sessão.
 *
 * Todas as funções aqui recebem "actorRole" (o papel de quem está fazendo a
 * ação, já validado em Main.js a partir da sessão) e, quando necessário,
 * "actorUsername" (para permitir que um gestor edite a própria conta, e
 * para impedir que qualquer um inative a própria conta).
 */

const USERS_HEADERS = ['user_id', 'name', 'email', 'login', 'password', 'role', 'active'];

function getUsersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
}

/**
 * Normaliza o valor bruto da coluna "active" para booleano. Linhas criadas
 * antes dessa coluna existir ficam em branco — tratamos como ativas, para
 * ninguém perder acesso de repente só por causa dessa migração.
 */
function normalizeActive(rawValue) {
  if (rawValue === false || rawValue === 'FALSE' || rawValue === 'false') return false;
  return true;
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
        role: r[5],
        active: normalizeActive(r[6])
      };
    });
}

/**
 * Lê a aba users UMA ÚNICA VEZ e devolve um mapa { user_id: {login, name} }.
 * Usado por Sales.js para resolver o nome de todas as vendedoras de uma
 * planilha inteira sem precisar de uma busca por linha — é o equivalente
 * manual de um índice de banco de dados, já que o Sheets não tem JOIN.
 */
function getUserLookupMap() {
  const sheet = getUsersSheet();
  const map = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  const values = sheet.getRange(2, 1, lastRow - 1, USERS_HEADERS.length).getValues();
  values.forEach(function (r) {
    if (!r[0]) return;
    map[String(r[0])] = { login: r[3], name: r[1] };
  });
  return map;
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
  const logins = sheet.getRange(2, 4, lastRow - 1, 1).getValues(); // coluna D = login
  for (let i = 0; i < logins.length; i++) {
    if (String(logins[i][0]).toLowerCase() === String(login).toLowerCase()) return i + 2;
  }
  return -1;
}

/** user_id correspondente a um login, ou null se não existir. Usado por Sales.js para resolver a FK seller_id. */
function getUserIdByLogin(login) {
  const sheet = getUsersSheet();
  const row = findUserRowByLogin(sheet, login);
  if (row === -1) return null;
  return sheet.getRange(row, 1).getValue();
}

/**
 * Busca {id, name, login} de uma vendedora a partir do login, numa única
 * consulta — usado por Sales.js ao registrar/editar uma venda, para poder
 * devolver o nome já resolvido de volta ao frontend na mesma resposta (sem
 * isso, a tela mostrava "undefined" no nome até a próxima sincronização).
 */
function getUserByLogin(login) {
  const sheet = getUsersSheet();
  const row = findUserRowByLogin(sheet, login);
  if (row === -1) return null;
  const values = sheet.getRange(row, 1, 1, 4).getValues()[0]; // user_id, name, email, login
  return { id: values[0], name: values[1], login: values[3] };
}

/**
 * Confere se uma conta (pelo login) ainda está ativa — chamada a cada
 * requisição autenticada (ver Auth.js:getSessionData). É isso que garante
 * que inativar alguém derruba o acesso dela na hora, sem esperar a sessão
 * expirar sozinha.
 */
function isUserLoginActive(login) {
  const sheet = getUsersSheet();
  const row = findUserRowByLogin(sheet, login);
  if (row === -1) return false; // conta não existe mais (foi excluída)
  return normalizeActive(sheet.getRange(row, 7).getValue());
}

/** Conta quantos administradores ATIVOS existem, opcionalmente ignorando uma linha (para checar "sobra pelo menos 1"). */
function countActiveAdmins(sheet, excludeRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, USERS_HEADERS.length).getValues();
  let count = 0;
  values.forEach(function (r, idx) {
    const rowNum = idx + 2;
    if (rowNum === excludeRow) return;
    if (String(r[5]).toLowerCase() === 'admin' && normalizeActive(r[6])) count++;
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
  sheet.appendRow([id, user.name, user.email || '', user.login, user.password, user.role, true]);
  SpreadsheetApp.flush();
  return { ok: true, user: { id: String(id), name: user.name, email: user.email || '', login: user.login, role: user.role, active: true } };
}

/**
 * Atualiza um usuário. O campo "password" é opcional aqui: se vier vazio,
 * mantemos a senha atual (evita ter que redigitar a senha toda vez que só
 * se quer corrigir o nome ou e-mail, por exemplo). Esta função nunca mexe
 * na coluna "active" — isso é feito só por setUserActive(), abaixo.
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

  if (currentRole === 'admin' && targetRole !== 'admin' && countActiveAdmins(sheet, row) === 0) {
    return { ok: false, error: 'Não é possível rebaixar o único administrador ativo do sistema.' };
  }

  const currentPassword = sheet.getRange(row, 5).getValue();
  const newPassword = (user.password && String(user.password).length > 0) ? user.password : currentPassword;

  sheet.getRange(row, 2, 1, 5).setValues([[ user.name, user.email || '', user.login, newPassword, user.role ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

/**
 * Ativa ou inativa uma conta. Inativar é a alternativa recomendada à
 * exclusão: tira o acesso da pessoa ao sistema, mas preserva o registro
 * dela (e, com isso, o vínculo com as vendas que ela já fez).
 * Ninguém pode inativar a própria conta (evita se trancar pra fora sem
 * querer), e é proibido inativar o último administrador ativo.
 */
function setUserActive(id, active, actorRole, actorUsername) {
  const sheet = getUsersSheet();
  const row = findUserRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Usuário não encontrado.' };

  const role = String(sheet.getRange(row, 6).getValue()).toLowerCase();
  const login = String(sheet.getRange(row, 4).getValue());
  const isSelf = actorUsername && login.toLowerCase() === String(actorUsername).toLowerCase();

  if (isSelf) {
    return { ok: false, error: 'Você não pode alterar o status da sua própria conta.' };
  }
  if (actorRole === 'gestor' && (role === 'admin' || role === 'gestor')) {
    return { ok: false, error: 'Gestores não podem alterar contas de Administrador ou de outros Gestores.' };
  }
  if (active === false && role === 'admin' && countActiveAdmins(sheet, row) === 0) {
    return { ok: false, error: 'Não é possível inativar o único administrador ativo do sistema.' };
  }

  sheet.getRange(row, 7).setValue(active);
  SpreadsheetApp.flush();
  // Não precisa revogar sessão manualmente aqui: getSessionData() (Auth.js)
  // já confere isUserLoginActive() a cada requisição, então a próxima ação
  // dessa pessoa (se ela estiver logada) já falha sozinha.
  return { ok: true };
}

/**
 * Exclusão continua bloqueada quando já existem vendas vinculadas a essa
 * pessoa (ver Sales.js:sellerHasSales) — nesses casos, a orientação é
 * inativar a conta em vez de excluir, preservando o histórico de vendas.
 */
function deleteUser(id, actorRole) {
  const sheet = getUsersSheet();
  const row = findUserRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Usuário não encontrado.' };

  const role = String(sheet.getRange(row, 6).getValue()).toLowerCase();

  if (actorRole === 'gestor' && (role === 'admin' || role === 'gestor')) {
    return { ok: false, error: 'Gestores não podem excluir contas de Administrador ou de outros Gestores.' };
  }
  if (sellerHasSales(id)) {
    return { ok: false, error: 'Não é possível excluir: essa pessoa já tem vendas registradas. Inative a conta em vez de excluir.' };
  }
  if (role === 'admin' && countActiveAdmins(sheet, row) === 0) {
    return { ok: false, error: 'Não é possível excluir o único administrador ativo do sistema.' };
  }

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}
