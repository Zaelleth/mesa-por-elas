/**
 * Setup.js — Criação inicial das abas e migrações de uso único.
 * As funções daqui são chamadas manualmente pelo editor do Apps Script
 * (menu de funções → selecionar → Executar), nunca pelo doGet/doPost.
 */

/** Rode esta função UMA VEZ pelo editor de Apps Script, antes de publicar (instalação nova). */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let vendas = ss.getSheetByName(SHEET_VENDAS);
  if (!vendas) vendas = ss.insertSheet(SHEET_VENDAS);
  if (vendas.getLastRow() === 0) {
    vendas.appendRow(VENDAS_HEADERS);
    vendas.setFrozenRows(1);
  }

  let config = ss.getSheetByName(SHEET_CONFIG);
  if (!config) config = ss.insertSheet(SHEET_CONFIG);
  if (config.getLastRow() === 0) {
    config.appendRow(['Chave', 'Valor']);
    config.appendRow(['goal', 5000]);
    config.setFrozenRows(1);
  }

  let auth = ss.getSheetByName(SHEET_AUTH);
  if (!auth) auth = ss.insertSheet(SHEET_AUTH);
  if (auth.getLastRow() === 0) {
    auth.appendRow(['Usuario', 'Senha', 'Papel']);
    auth.appendRow(['Artur', '1234', 'admin']);
    auth.appendRow(['Gabriela', 'gabi123', 'vendedora']);
    auth.appendRow(['Larissa', 'lari123', 'vendedora']);
    auth.setFrozenRows(1);
  }

  // Remove a aba padrão "Sheet1"/"Página1" se estiver vazia
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Página1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(def);
  }

  migrateAddSplitPaymentColumns();
  migrateAuthToUsernameSchema();

  SpreadsheetApp.flush();
  Logger.log('Planilhas configuradas com sucesso. Pode implantar como Web App.');
}

/**
 * Rode esta função UMA VEZ se sua planilha já estava em uso ANTES da
 * funcionalidade de pagamento dividido (Pix + Cartão) existir — ela só
 * adiciona os cabeçalhos das 3 colunas novas (ValorPix, ValorCartao,
 * TipoCartao) na aba Vendas, sem apagar nenhuma venda já registrada.
 * Se a planilha já tiver essas colunas, rodar de novo não faz mal nenhum.
 */
function migrateAddSplitPaymentColumns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_VENDAS);
  if (!sheet) return;
  const currentHeaders = sheet.getRange(1, 1, 1, VENDAS_HEADERS.length).getValues()[0];
  if (currentHeaders[9] === 'ValorPix' && currentHeaders[10] === 'ValorCartao' && currentHeaders[11] === 'TipoCartao') {
    return; // já migrada
  }
  sheet.getRange(1, 10, 1, 3).setValues([['ValorPix', 'ValorCartao', 'TipoCartao']]);
  SpreadsheetApp.flush();
  Logger.log('Colunas de pagamento dividido adicionadas com sucesso.');
}

/**
 * Rode esta função UMA VEZ se sua aba "Auth" ainda estiver no formato antigo
 * (colunas Papel/Senha, onde a coluna A já continha o nome de usuário — ex.
 * "admin", "Gabriela", "Larissa"). Ela adiciona a coluna "Papel" com o nível
 * de acesso de cada usuário (admin ou vendedora), sem apagar nenhuma senha
 * já cadastrada. Se a aba já estiver no formato novo, rodar de novo não faz
 * mal nenhum.
 */
function migrateAuthToUsernameSchema() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AUTH);
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, 3).getValues()[0];
  if (headers[0] === 'Usuario' && headers[2] === 'Papel') return; // já migrada

  sheet.getRange(1, 1, 1, 2).setValues([['Usuario', 'Senha']]);
  sheet.getRange(1, 3).setValue('Papel');

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const usernames = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const papeis = usernames.map(function (r) {
      return [String(r[0]).toLowerCase() === 'admin' ? 'admin' : 'vendedora'];
    });
    sheet.getRange(2, 3, papeis.length, 1).setValues(papeis);
  }
  SpreadsheetApp.flush();
  Logger.log('Auth migrada para o novo esquema de usuário/senha com sucesso.');
}
