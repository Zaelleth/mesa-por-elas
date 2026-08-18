/**
 * Sales.js — Leitura e escrita da aba "Vendas".
 */

const SHEET_VENDAS = 'Vendas';

const VENDAS_HEADERS = ['ID', 'Nome', 'Telefone', 'CPF', 'Email', 'Valor', 'Pagamento', 'Vendedora', 'DataHora', 'ValorPix', 'ValorCartao', 'TipoCartao'];

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
