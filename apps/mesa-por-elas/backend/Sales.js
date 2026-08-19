/**
 * Sales.js — Leitura e escrita da aba "sales".
 *
 * Schema (snake_case, já pensado para uma futura migração para banco real):
 *   sale_id | customer_id | amount | payment_method | seller_id | created_at
 *   | pix_amount | card_amount | card_type
 *
 * customer_id e seller_id são FOREIGN KEYS (para customers.customer_id e
 * users.user_id). A venda não guarda mais nome/telefone/CPF/e-mail da
 * cliente nem login/nome de quem vendeu — só os dois números. Todo dado de
 * exibição é resolvido na hora, buscando nas abas customers e users (ver
 * getCustomerLookupMap() e getUserLookupMap()). Corrigir o telefone de uma
 * cliente, por exemplo, atualiza automaticamente TODO o histórico de vendas
 * dela, sem reescrever nenhuma linha antiga.
 *
 * Regra de preenchimento das colunas de divisão de pagamento: só a coluna
 * do meio efetivamente usado é preenchida — a outra fica em BRANCO (não
 * zero), para já nascer pronta para virar NULL quando isso for um banco de
 * verdade.
 *   payment_method = 'pix'              → pix_amount = valor, card_amount = ''
 *   payment_method = 'debito'/'credito' → pix_amount = '', card_amount = valor
 *   payment_method = 'misto'            → os dois preenchidos com a parte de cada um
 *
 * Importante sobre o formato devolvido ao frontend: apesar do schema novo,
 * o objeto devolvido continua tendo os MESMOS nomes de sempre — name, phone,
 * cpf, email, seller, sellerName — só que agora resolvidos via FK em vez de
 * copiados direto da planilha. Isso evita ter que tocar em telas que só
 * exibem esses campos.
 */

const SHEET_SALES = 'sales';

const SALES_HEADERS = [
  'sale_id', 'customer_id', 'amount', 'payment_method', 'seller_id',
  'created_at', 'pix_amount', 'card_amount', 'card_type'
];

function getSalesSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALES);
}

function readSales() {
  const sheet = getSalesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, SALES_HEADERS.length).getValues();

  // Cada aba é lida UMA ÚNICA VEZ e reaproveitada para todas as linhas —
  // é o "índice" manual que substitui o JOIN que o Sheets não tem.
  const userMap = getUserLookupMap();
  const customerMap = getCustomerLookupMap();

  return values
    .filter(function (r) { return r[0]; }) // ignora linhas totalmente vazias
    .map(function (r) {
      const amount = Number(r[2]);
      const payment = r[3];
      const sellerInfo = userMap[String(r[4])];
      const customerInfo = customerMap[String(r[1])];

      let pixAmount = 0, cardAmount = 0, cardType = null;
      if (payment === 'pix') {
        pixAmount = amount;
      } else if (payment === 'debito' || payment === 'credito') {
        cardAmount = amount;
        cardType = payment;
      } else if (payment === 'misto') {
        pixAmount = r[6] !== '' ? Number(r[6]) : 0;
        cardAmount = r[7] !== '' ? Number(r[7]) : 0;
        cardType = r[8] || null;
      }

      return {
        id: String(r[0]),
        name: customerInfo ? customerInfo.name : '(cliente removido)',
        phone: customerInfo ? customerInfo.phone : '',
        cpf: customerInfo ? customerInfo.cpf : '',
        email: customerInfo ? customerInfo.email : '',
        amount: amount,
        payment: payment,
        seller: sellerInfo ? sellerInfo.login : null,
        sellerName: sellerInfo ? sellerInfo.name : '(vendedora removida)',
        timestamp: r[5] instanceof Date ? r[5].toISOString() : r[5],
        pixAmount: pixAmount,
        cardAmount: cardAmount,
        cardType: cardType
      };
    });
}

/** Próximo sale_id sequencial (1, 2, 3...), mesma lógica usada em Users.js/Customers.js. */
function getNextSaleId(sheet) {
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

/** Calcula o que vai em pix_amount/card_amount/card_type, deixando em branco o que não se aplica. */
function buildSplitColumns(payment, amount, pixAmountIn, cardAmountIn, cardTypeIn) {
  if (payment === 'pix') {
    return { pix: Number(amount), card: '', cardType: '' };
  }
  if (payment === 'debito' || payment === 'credito') {
    return { pix: '', card: Number(amount), cardType: payment };
  }
  if (payment === 'misto') {
    return { pix: Number(pixAmountIn || 0), card: Number(cardAmountIn || 0), cardType: cardTypeIn || '' };
  }
  return { pix: '', card: '', cardType: '' };
}

function addSale(sale) {
  const sellerInfo = getUserByLogin(sale.seller);
  if (!sellerInfo) {
    return { ok: false, error: 'Vendedora não encontrada. Atualize a lista e tente novamente.' };
  }
  const customerResult = resolveCustomerForSale({ name: sale.name, phone: sale.phone, cpf: sale.cpf, email: sale.email });
  if (!customerResult.ok) return customerResult;

  const sheet = getSalesSheet();
  const id = getNextSaleId(sheet);
  const timestamp = new Date().toISOString();
  const split = buildSplitColumns(sale.payment, sale.amount, sale.pixAmount, sale.cardAmount, sale.cardType);
  sheet.appendRow([
    id, customerResult.customerId, Number(sale.amount), sale.payment, sellerInfo.id,
    timestamp, split.pix, split.card, split.cardType
  ]);
  SpreadsheetApp.flush();
  return {
    ok: true,
    sale: Object.assign({ id: String(id), timestamp: timestamp }, sale, {
      amount: Number(sale.amount),
      seller: sellerInfo.login,
      sellerName: sellerInfo.name,
      pixAmount: split.pix === '' ? 0 : split.pix,
      cardAmount: split.card === '' ? 0 : split.card
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
  const sellerInfo = getUserByLogin(sale.seller);
  if (!sellerInfo) {
    return { ok: false, error: 'Vendedora não encontrada. Atualize a lista e tente novamente.' };
  }
  const customerResult = resolveCustomerForSale({ name: sale.name, phone: sale.phone, cpf: sale.cpf, email: sale.email });
  if (!customerResult.ok) return customerResult;

  const sheet = getSalesSheet();
  const row = findRowIndexById(sheet, id);
  if (row === -1) return { ok: false, error: 'Venda não encontrada (pode já ter sido alterada por outra pessoa).' };

  // Colunas B–E (customer_id, amount, payment_method, seller_id) — a coluna
  // F (created_at) não é sobrescrita na edição.
  sheet.getRange(row, 2, 1, 4).setValues([[
    customerResult.customerId, Number(sale.amount), sale.payment, sellerInfo.id
  ]]);
  // Colunas G–I (pix_amount, card_amount, card_type)
  const split = buildSplitColumns(sale.payment, sale.amount, sale.pixAmount, sale.cardAmount, sale.cardType);
  sheet.getRange(row, 7, 1, 3).setValues([[ split.pix, split.card, split.cardType ]]);
  SpreadsheetApp.flush();
  return { ok: true, sellerName: sellerInfo.name };
}

function deleteSale(id) {
  const sheet = getSalesSheet();
  const row = findRowIndexById(sheet, id);
  if (row === -1) return { ok: false, error: 'Venda não encontrada (pode já ter sido excluída por outra pessoa).' };
  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}

/** Usado por Users.js para bloquear a exclusão de vendedora com vendas vinculadas. */
function sellerHasSales(userId) {
  const sheet = getSalesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const ids = sheet.getRange(2, 5, lastRow - 1, 1).getValues(); // coluna E = seller_id
  return ids.some(function (r) { return String(r[0]) === String(userId); });
}
