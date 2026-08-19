/**
 * Sales.js — Leitura e escrita da aba "sales".
 *
 * Schema (snake_case, já pensado para uma futura migração para banco real):
 *   sale_id | customer_name | phone | cpf | email | amount | payment_method
 *   | seller_login | created_at | pix_amount | card_amount | card_type
 *
 * Regra de preenchimento das colunas de divisão de pagamento: só a coluna
 * do meio efetivamente usado é preenchida — a outra fica em BRANCO (não
 * zero), para já nascer pronta para virar NULL quando isso for um banco de
 * verdade.
 *   payment_method = 'pix'              → pix_amount = valor, card_amount = ''
 *   payment_method = 'debito'/'credito' → pix_amount = '', card_amount = valor
 *   payment_method = 'misto'            → os dois preenchidos com a parte de cada um
 *
 * Importante: os nomes de coluna aqui (cabeçalho da planilha) são só para
 * documentação/leitura humana. O código sempre lê/escreve por posição fixa
 * (índice da coluna), nunca procurando pelo texto do cabeçalho — então o
 * formato dos objetos retornados para o frontend (id, name, phone, amount,
 * pixAmount...) continua exatamente igual a antes; só o que está gravado na
 * planilha mudou de nome.
 */

const SHEET_SALES = 'sales';

const SALES_HEADERS = [
  'sale_id', 'customer_name', 'phone', 'cpf', 'email', 'amount',
  'payment_method', 'seller_login', 'created_at', 'pix_amount', 'card_amount', 'card_type'
];

function getSalesSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALES);
}

function readSales() {
  const sheet = getSalesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, SALES_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; }) // ignora linhas totalmente vazias
    .map(function (r) {
      const amount = Number(r[5]);
      const payment = r[6];
      // pix_amount/card_amount/card_type são derivados da forma de pagamento
      // + valor total sempre que o pagamento for único — assim, mesmo que a
      // célula esteja em branco (como deve estar) ou contenha um resquício
      // de dado antigo, o valor devolvido para o app sempre bate.
      let pixAmount = 0, cardAmount = 0, cardType = null;
      if (payment === 'pix') {
        pixAmount = amount;
      } else if (payment === 'debito' || payment === 'credito') {
        cardAmount = amount;
        cardType = payment;
      } else if (payment === 'misto') {
        pixAmount = r[9] !== '' ? Number(r[9]) : 0;
        cardAmount = r[10] !== '' ? Number(r[10]) : 0;
        cardType = r[11] || null;
      }
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

/** Próximo sale_id sequencial (1, 2, 3...), mesma lógica usada em Users.js. */
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
  const sheet = getSalesSheet();
  const id = getNextSaleId(sheet);
  const timestamp = new Date().toISOString();
  const split = buildSplitColumns(sale.payment, sale.amount, sale.pixAmount, sale.cardAmount, sale.cardType);
  sheet.appendRow([
    id, sale.name, sale.phone, sale.cpf, sale.email,
    Number(sale.amount), sale.payment, sale.seller, timestamp,
    split.pix, split.card, split.cardType
  ]);
  SpreadsheetApp.flush();
  return {
    ok: true,
    sale: Object.assign({ id: String(id), timestamp: timestamp }, sale, {
      amount: Number(sale.amount),
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
  const sheet = getSalesSheet();
  const row = findRowIndexById(sheet, id);
  if (row === -1) return { ok: false, error: 'Venda não encontrada (pode já ter sido alterada por outra pessoa).' };
  // Colunas B–H (customer_name..seller_login) — a coluna I (created_at) não é sobrescrita na edição.
  sheet.getRange(row, 2, 1, 7).setValues([[
    sale.name, sale.phone, sale.cpf, sale.email,
    Number(sale.amount), sale.payment, sale.seller
  ]]);
  // Colunas J–L (pix_amount, card_amount, card_type)
  const split = buildSplitColumns(sale.payment, sale.amount, sale.pixAmount, sale.cardAmount, sale.cardType);
  sheet.getRange(row, 10, 1, 3).setValues([[ split.pix, split.card, split.cardType ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function deleteSale(id) {
  const sheet = getSalesSheet();
  const row = findRowIndexById(sheet, id);
  if (row === -1) return { ok: false, error: 'Venda não encontrada (pode já ter sido excluída por outra pessoa).' };
  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}
