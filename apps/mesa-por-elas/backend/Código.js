/**
 * BACKEND — "A Mesa por Elas" — Controle de Vendas
 * -------------------------------------------------
 * Este script transforma esta Planilha Google em um banco de dados,
 * com uma API própria acessada pelo arquivo HTML do evento.
 *
 * COMO INSTALAR (resumo — veja o guia completo em INSTRUCOES.md):
 * 1. Cole este código no editor de Apps Script da sua planilha.
 * 2. Rode a função setupSheets() uma única vez (autorize as permissões pedidas).
 * 3. Implante como aplicativo da web (Deploy > New deployment > Web app):
 *    - Executar como: Eu (seu e-mail)
 *    - Quem tem acesso: Qualquer pessoa
 * 4. Copie a URL gerada (termina em /exec) e cole na constante API_URL do HTML.
 */

// >>> TROQUE por uma string secreta só sua (ex: "mesa-elas-2026-x7f9q") <<<
// Precisa ser IGUAL ao valor de BOOTSTRAP_TOKEN no arquivo HTML.
// Esse token só é usado para poder TENTAR fazer login — depois disso, quem
// autentica de verdade é a sessão temporária gerada abaixo.
const BOOTSTRAP_TOKEN = 'ricardinho-guilerme-bagui-complica';

// Duração da sessão (em segundos). 21600 = 6 horas, o máximo permitido pelo
// CacheService do Apps Script. A sessão se renova sozinha a cada ação feita
// no app, então na prática ela não expira enquanto a pessoa estiver ativa.
const SESSION_TTL_SECONDS = 21600;

const SHEET_VENDAS = 'Vendas';
const SHEET_CONFIG = 'Config';
const SHEET_AUTH = 'Auth';

const VENDAS_HEADERS = ['ID', 'Nome', 'Telefone', 'CPF', 'Email', 'Valor', 'Pagamento', 'Vendedora', 'DataHora', 'ValorPix', 'ValorCartao', 'TipoCartao'];


// -----------------------------------------------------------------
// Ponto de entrada da API
// -----------------------------------------------------------------

function doGet(e) {
  try {
    if (!isValidSession(e.parameter.token)) {
      return jsonOut({ ok: false, error: 'SESSION_INVALID' });
    }
    const action = e.parameter.action;
    if (action === 'getSales') return jsonOut({ ok: true, sales: readSales() });
    if (action === 'getConfig') return jsonOut({ ok: true, goal: readConfig().goal });
    if (action === 'getSellers') return jsonOut({ ok: true, sellers: getSellers() });
    return jsonOut({ ok: false, error: 'Ação GET desconhecida.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

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

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Espera até 15s caso outro dispositivo esteja gravando ao mesmo tempo.
    // Isso é o que garante que 3 pessoas possam usar o app sem corromper dados.
    lock.waitLock(15000);
  } catch (err) {
    return jsonOut({ ok: false, error: 'Sistema ocupado no momento, tente novamente em instantes.' });
  }

  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;

    if (action === 'login') {
      if (!isValidBootstrapToken(body.token)) {
        return jsonOut({ ok: false, error: 'Acesso não autorizado.' });
      }
      return jsonOut(login(body.username, body.password));
    }

    // Todas as ações abaixo exigem uma sessão válida (obtida via login).
    if (!isValidSession(body.token)) {
      return jsonOut({ ok: false, error: 'SESSION_INVALID' });
    }

    if (action === 'logout') {
      CacheService.getScriptCache().remove('session_' + body.token);
      return jsonOut({ ok: true });
    }
    if (action === 'addSale') return jsonOut(addSale(body.sale));
    if (action === 'updateSale') return jsonOut(updateSale(body.id, body.sale));
    if (action === 'deleteSale') return jsonOut(deleteSale(body.id));
    if (action === 'saveConfig') return jsonOut(saveConfig(body.goal));

    return jsonOut({ ok: false, error: 'Ação POST desconhecida.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// -----------------------------------------------------------------
// Vendas
// -----------------------------------------------------------------

function getVendasSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_VENDAS);
}

function readSales() {
  const sheet = getVendasSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, VENDAS_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; }) // ignora linhas totalmente vazias
    .map(function (r) {
      const amount = Number(r[5]);
      const payment = r[6];
      // Colunas novas (ValorPix, ValorCartao, TipoCartao) podem vir vazias em
      // vendas registradas antes desta funcionalidade existir — nesse caso,
      // reconstituímos a partir da forma de pagamento antiga (sempre única).
      const hasSplitData = r[9] !== '' && r[10] !== '';
      const pixAmount = hasSplitData ? Number(r[9]) : (payment === 'pix' ? amount : 0);
      const cardAmount = hasSplitData ? Number(r[10]) : (payment === 'pix' ? 0 : amount);
      const cardType = r[11] || (payment === 'debito' || payment === 'credito' ? payment : null);
      return {
        id: String(r[0]),
        name: r[1],
        phone: r[2],
        cpf: r[3],
        email: r[4],
        amount: amount,
        payment: payment,
        seller: r[7],
        timestamp: r[8] instanceof Date ? r[8].toISOString() : r[8],
        pixAmount: pixAmount,
        cardAmount: cardAmount,
        cardType: cardType
      };
    });
}

function addSale(sale) {
  const sheet = getVendasSheet();
  const id = Utilities.getUuid();
  const timestamp = new Date().toISOString();
  const pixAmount = Number(sale.pixAmount || 0);
  const cardAmount = Number(sale.cardAmount || 0);
  sheet.appendRow([
    id, sale.name, sale.phone, sale.cpf, sale.email,
    Number(sale.amount), sale.payment, sale.seller, timestamp,
    pixAmount, cardAmount, sale.cardType || ''
  ]);
  SpreadsheetApp.flush();
  return {
    ok: true,
    sale: Object.assign({ id: id, timestamp: timestamp }, sale, {
      amount: Number(sale.amount), pixAmount: pixAmount, cardAmount: cardAmount
    })
  };
}

function findRowIndexById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // +2: cabeçalho + índice 1-based
  }
  return -1;
}

function updateSale(id, sale) {
  const sheet = getVendasSheet();
  const row = findRowIndexById(sheet, id);
  if (row === -1) return { ok: false, error: 'Venda não encontrada (pode já ter sido alterada por outra pessoa).' };
  // Colunas B–H (Nome..Vendedora) — a coluna I (DataHora) não é sobrescrita na edição.
  sheet.getRange(row, 2, 1, 7).setValues([[
    sale.name, sale.phone, sale.cpf, sale.email,
    Number(sale.amount), sale.payment, sale.seller
  ]]);
  // Colunas J–L (ValorPix, ValorCartao, TipoCartao)
  sheet.getRange(row, 10, 1, 3).setValues([[
    Number(sale.pixAmount || 0), Number(sale.cardAmount || 0), sale.cardType || ''
  ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function deleteSale(id) {
  const sheet = getVendasSheet();
  const row = findRowIndexById(sheet, id);
  if (row === -1) return { ok: false, error: 'Venda não encontrada (pode já ter sido excluída por outra pessoa).' };
  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}

// -----------------------------------------------------------------
// Config (meta de vendas)
// -----------------------------------------------------------------

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
}

function readConfig() {
  const sheet = getConfigSheet();
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), 2).getValues();
  const map = {};
  values.forEach(function (r) { map[r[0]] = r[1]; });
  return { goal: Number(map.goal) || 5000 };
}

function saveConfig(goal) {
  const sheet = getConfigSheet();
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === 'goal') {
      sheet.getRange(i + 2, 2).setValue(Number(goal));
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  sheet.appendRow(['goal', Number(goal)]);
  SpreadsheetApp.flush();
  return { ok: true };
}

// -----------------------------------------------------------------
// Autenticação
// -----------------------------------------------------------------

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