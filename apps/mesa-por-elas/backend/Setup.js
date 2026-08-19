/**
 * Setup.js — Criação inicial das abas e migrações de uso único.
 * As funções daqui são chamadas manualmente pelo editor do Apps Script
 * (menu de funções → selecionar → Executar), nunca pelo doGet/doPost.
 */

/** Rode esta função UMA VEZ pelo editor de Apps Script, antes de publicar (instalação nova). */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Se a planilha já tinha as abas antigas (Vendas/Users/Config, cabeçalhos
  // em português), migra tudo para o schema novo antes de mais nada.
  migrateToSnakeCaseSchema();

  let sales = ss.getSheetByName(SHEET_SALES);
  if (!sales) sales = ss.insertSheet(SHEET_SALES);
  if (sales.getLastRow() === 0) {
    sales.appendRow(SALES_HEADERS);
    sales.setFrozenRows(1);
  }

  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) settings = ss.insertSheet(SHEET_SETTINGS);
  if (settings.getLastRow() === 0) {
    settings.appendRow(SETTINGS_HEADERS);
    settings.appendRow([1, 'goal', 5000]);
    settings.setFrozenRows(1);
  }

  let users = ss.getSheetByName(SHEET_USERS);
  if (!users) users = ss.insertSheet(SHEET_USERS);
  if (users.getLastRow() === 0) {
    users.appendRow(USERS_HEADERS);
    users.appendRow([1, 'Administrador', '', 'admin', '1234', 'admin']);
    users.setFrozenRows(1);
  }

  // Remove a aba padrão "Sheet1"/"Página1" se estiver vazia
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Página1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(def);
  }

  SpreadsheetApp.flush();
  Logger.log('Planilhas configuradas com sucesso. Pode implantar como Web App.');
}

/**
 * ⚠️ Rode esta função UMA VEZ se sua planilha ainda estiver no formato
 * anterior (abas "Vendas" / "Users" com U maiúsculo / "Config", cabeçalhos
 * em português). Ela, nessa ordem:
 *   1. Renomeia as abas para os nomes novos: sales, users, settings.
 *   2. Reescreve a linha de cabeçalho de cada uma para snake_case.
 *   3. Se a aba settings ainda não tinha a coluna setting_id, adiciona.
 *   4. Ajusta as vendas já existentes: deixa em branco a coluna do meio de
 *      pagamento que não foi usado (em vez de manter um 0 gravado ali).
 *
 * Não apaga nenhuma venda, usuário ou configuração já cadastrada. Segura de
 * rodar mais de uma vez — se já estiver tudo migrado, não faz nada.
 */
function migrateToSnakeCaseSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  renameSheetIfNeeded_(ss, 'Vendas', SHEET_SALES);
  renameSheetIfNeeded_(ss, 'Users', SHEET_USERS);
  renameSheetIfNeeded_(ss, 'Config', SHEET_SETTINGS);

  rewriteHeaderRow_(ss, SHEET_SALES, SALES_HEADERS);
  rewriteHeaderRow_(ss, SHEET_USERS, USERS_HEADERS);
  rewriteHeaderRow_(ss, SHEET_SETTINGS, SETTINGS_HEADERS);

  addSettingsIdIfMissing_(ss);
  blankOutUnusedPaymentColumns_(ss);

  SpreadsheetApp.flush();
  Logger.log('Migração para o novo schema (snake_case) concluída.');
}

function renameSheetIfNeeded_(ss, oldName, newName) {
  if (ss.getSheetByName(newName)) return; // já migrada
  const oldSheet = ss.getSheetByName(oldName);
  if (!oldSheet) return; // não existe (instalação nova, ou nome antigo diferente)
  oldSheet.setName(newName);
}

function rewriteHeaderRow_(ss, sheetName, headers) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

/**
 * A aba settings pode ter nascido só com [Chave, Valor], sem coluna de ID.
 * Se a primeira célula de dados não for um número, assume esse formato
 * antigo e desloca os dados para [setting_id, setting_key, setting_value].
 */
function addSettingsIdIfMissing_(ss) {
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const firstCell = sheet.getRange(2, 1).getValue();
  if (firstCell !== '' && !isNaN(Number(firstCell))) return; // já tem setting_id numérico

  const numRows = lastRow - 1;
  const oldData = sheet.getRange(2, 1, numRows, 2).getValues(); // [Chave, Valor] antigos
  const newData = oldData.map(function (r, i) { return [i + 1, r[0], r[1]]; });
  sheet.getRange(2, 1, numRows, 3).setValues(newData);
}

/**
 * Para cada venda já cadastrada, recalcula pix_amount/card_amount/card_type
 * a partir de payment_method + amount, deixando em branco o que não se
 * aplica (regra nova). Vendas "misto" mantêm os valores como já estavam.
 */
function blankOutUnusedPaymentColumns_(ss) {
  const sheet = ss.getSheetByName(SHEET_SALES);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const numRows = lastRow - 1;

  const amountPayment = sheet.getRange(2, 6, numRows, 2).getValues(); // F:G → amount, payment_method
  const splitCols = sheet.getRange(2, 10, numRows, 3).getValues();    // J:L → pix, card, card_type

  const out = amountPayment.map(function (ap, i) {
    const amount = ap[0];
    const payment = ap[1];
    let pix = splitCols[i][0];
    let card = splitCols[i][1];
    let cardType = splitCols[i][2];
    if (payment === 'pix') {
      pix = amount; card = ''; cardType = '';
    } else if (payment === 'debito' || payment === 'credito') {
      pix = ''; card = amount; cardType = payment;
    }
    // 'misto' não é tocado — mantém o que já estava gravado.
    return [pix, card, cardType];
  });

  sheet.getRange(2, 10, numRows, 3).setValues(out);
}

/**
 * ⚠️ FUNÇÃO DESTRUTIVA — apaga TODOS os usuários cadastrados na aba "users"
 * e a recria do zero, no formato:
 *   user_id | name | email | login | password | role
 *
 * Semeia um único administrador inicial, para você conseguir entrar de novo
 * depois do reset:
 *   Login: admin   |   Senha: 1234
 *
 * TROQUE ESSA SENHA imediatamente depois de logar — pela própria tela de
 * Usuários dentro do app, sem precisar voltar aqui no editor.
 *
 * Rode isso pelo editor do Apps Script (menu de funções → Executar).
 * NUNCA é chamada automaticamente pelo doGet/doPost.
 */
function resetUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_USERS);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_USERS);
  sheet.appendRow(USERS_HEADERS);
  sheet.setFrozenRows(1);
  sheet.appendRow([1, 'Administrador', '', 'admin', '1234', 'admin']);
  SpreadsheetApp.flush();
  Logger.log('Usuários zerados com sucesso. Login inicial: admin / 1234 — troque a senha assim que entrar.');
}

/**
 * Rode esta função UMA VEZ se você já tinha usuários criados com o ID antigo
 * (uma string aleatória, ex: "1oj-F6N-..."). Ela renumera todos os usuários
 * já cadastrados para IDs sequenciais (1, 2, 3...), na ordem em que já estão
 * na planilha — sem alterar nome, login, senha ou função de ninguém.
 *
 * Seguro de rodar: nenhuma outra aba referencia o ID do usuário hoje (as
 * vendas guardam o Login da vendedora, não o ID), então renumerar não quebra
 * nenhum vínculo existente.
 */
function renumberUserIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Nenhum usuário cadastrado ainda — nada a renumerar.');
    return;
  }
  const numRows = lastRow - 1;
  const newIds = [];
  for (let i = 1; i <= numRows; i++) newIds.push([i]);
  sheet.getRange(2, 1, numRows, 1).setValues(newIds);
  SpreadsheetApp.flush();
  Logger.log('IDs de usuários renumerados sequencialmente: 1 a ' + numRows + '.');
}

/**
 * Rode esta função UMA VEZ se suas vendas já existentes tiverem o ID antigo
 * (uma string aleatória). Renumera para sequencial (1, 2, 3...), na ordem em
 * que já estão na planilha — sem alterar nenhum outro dado da venda.
 */
function renumberSaleIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALES);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Nenhuma venda cadastrada ainda — nada a renumerar.');
    return;
  }
  const numRows = lastRow - 1;
  const newIds = [];
  for (let i = 1; i <= numRows; i++) newIds.push([i]);
  sheet.getRange(2, 1, numRows, 1).setValues(newIds);
  SpreadsheetApp.flush();
  Logger.log('IDs de vendas renumerados sequencialmente: 1 a ' + numRows + '.');
}
