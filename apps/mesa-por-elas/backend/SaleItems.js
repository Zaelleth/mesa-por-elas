/**
 * SaleItems.js — CRUD da aba "saleitems".
 * Schema: saleitem_id | name | price | active | created_at
 *
 * Representa o que é vendido no sistema — hoje só dois: o ingresso do
 * evento Mesa por Elas e a assinatura do Club. Chamado de "Itens de Venda"
 * na interface (não "produtos"), já que o projeto não é uma loja.
 *
 * price é OBRIGATÓRIO e sempre numérico — pode ser 0 (item promocional/
 * gratuito), mas nunca fica em branco. É o valor sugerido: ao escolher um
 * item numa venda, o campo de valor vem pré-preenchido com esse preço, mas
 * continua editável (cobre desconto, promoção, etc.).
 *
 * Gerenciar itens (criar, editar, inativar) é restrito a admin e gestor —
 * ver o gate em Main.js. A LISTAGEM (getSaleItems) é aberta a qualquer
 * sessão válida, porque a vendedora precisa dela para escolher o item na
 * hora de registrar uma venda, mesmo sem acesso à tela de gerenciamento.
 *
 * Não existe deleteSaleItem pelo app, de propósito — só inativação. Se um
 * item for excluído manualmente direto na planilha, isso NÃO quebra nada:
 * readSales() resolve o item pelo ID sempre com uma checagem de existência,
 * caindo num rótulo de fallback se o ID não for mais encontrado (mesmo
 * padrão já usado para vendedora/cliente removidos).
 */

const SHEET_SALEITEMS = 'saleitems';
const SALEITEMS_HEADERS = ['saleitem_id', 'name', 'price', 'active', 'created_at'];

function getSaleItemsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALEITEMS);
}

function normalizeSaleItemActive(rawValue) {
  return rawValue === true || rawValue === 'TRUE' || rawValue === 'true';
}

/** Valida preço: precisa existir, ser numérico e não-negativo. Zero é permitido. */
function isValidPrice(price) {
  if (price === undefined || price === null || price === '') return false;
  const n = Number(price);
  return !isNaN(n) && n >= 0;
}

function readSaleItems() {
  const sheet = getSaleItemsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, SALEITEMS_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        id: String(r[0]),
        name: r[1],
        price: Number(r[2]),
        active: normalizeSaleItemActive(r[3]),
        createdAt: r[4] instanceof Date ? r[4].toISOString() : r[4]
      };
    });
}

/**
 * Lê a aba saleitems UMA ÚNICA VEZ e devolve um mapa { saleitem_id: {name,
 * price} } — mesmo padrão de otimização de getUserLookupMap() e
 * getCustomerLookupMap(), usado por Sales.js para resolver todas as vendas
 * de uma vez, sem uma busca repetida por linha.
 */
function getSaleItemLookupMap() {
  const sheet = getSaleItemsSheet();
  const map = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  const values = sheet.getRange(2, 1, lastRow - 1, SALEITEMS_HEADERS.length).getValues();
  values.forEach(function (r) {
    if (!r[0]) return;
    map[String(r[0])] = { name: r[1], price: Number(r[2]) };
  });
  return map;
}

function findSaleItemRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function getNextSaleItemId(sheet) {
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

/** Usado por Sales.js ao registrar/editar uma venda, para validar o item escolhido. */
function getSaleItemById(id) {
  const sheet = getSaleItemsSheet();
  const row = findSaleItemRowById(sheet, id);
  if (row === -1) return null;
  const values = sheet.getRange(row, 1, 1, SALEITEMS_HEADERS.length).getValues()[0];
  return { id: String(values[0]), name: values[1], price: Number(values[2]), active: normalizeSaleItemActive(values[3]) };
}

function addSaleItem(item) {
  if (!item || !item.name) {
    return { ok: false, error: 'Preencha o nome do item.' };
  }
  if (!isValidPrice(item.price)) {
    return { ok: false, error: 'Informe um preço numérico válido (pode ser 0, mas não pode ficar em branco).' };
  }
  const sheet = getSaleItemsSheet();
  const id = getNextSaleItemId(sheet);
  const createdAt = new Date().toISOString();
  const price = Number(item.price);
  sheet.appendRow([id, item.name, price, true, createdAt]);
  SpreadsheetApp.flush();
  return { ok: true, item: { id: String(id), name: item.name, price: price, active: true, createdAt: createdAt } };
}

function updateSaleItem(id, item) {
  if (!item || !item.name) {
    return { ok: false, error: 'Preencha o nome do item.' };
  }
  if (!isValidPrice(item.price)) {
    return { ok: false, error: 'Informe um preço numérico válido (pode ser 0, mas não pode ficar em branco).' };
  }
  const sheet = getSaleItemsSheet();
  const row = findSaleItemRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Item não encontrado.' };

  sheet.getRange(row, 2, 1, 2).setValues([[ item.name, Number(item.price) ]]); // name, price
  SpreadsheetApp.flush();
  return { ok: true };
}

/** Ativa/inativa um item — restrito a admin e gestor (gate em Main.js). */
function setSaleItemActive(id, active) {
  const sheet = getSaleItemsSheet();
  const row = findSaleItemRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Item não encontrado.' };
  sheet.getRange(row, 4).setValue(active);
  SpreadsheetApp.flush();
  return { ok: true };
}
