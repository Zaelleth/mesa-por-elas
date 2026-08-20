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

  let customers = ss.getSheetByName(SHEET_CUSTOMERS);
  if (!customers) customers = ss.insertSheet(SHEET_CUSTOMERS);
  if (customers.getLastRow() === 0) {
    customers.appendRow(CUSTOMERS_HEADERS);
    customers.setFrozenRows(1);
  }

  let saleitems = ss.getSheetByName(SHEET_SALEITEMS);
  if (!saleitems) saleitems = ss.insertSheet(SHEET_SALEITEMS);
  if (saleitems.getLastRow() === 0) {
    saleitems.appendRow(SALEITEMS_HEADERS);
    saleitems.appendRow([1, 'Ingresso Mesa por Elas', 0, true, new Date().toISOString()]);
    saleitems.appendRow([2, 'Assinatura Club', 0, true, new Date().toISOString()]);
    saleitems.setFrozenRows(1);
  }

  let clubSubscriptions = ss.getSheetByName(SHEET_CLUB_SUBSCRIPTIONS);
  if (!clubSubscriptions) clubSubscriptions = ss.insertSheet(SHEET_CLUB_SUBSCRIPTIONS);
  if (clubSubscriptions.getLastRow() === 0) {
    clubSubscriptions.appendRow(CLUB_SUBSCRIPTIONS_HEADERS);
    clubSubscriptions.setFrozenRows(1);
  }

  let clubPayments = ss.getSheetByName(SHEET_CLUB_PAYMENTS);
  if (!clubPayments) clubPayments = ss.insertSheet(SHEET_CLUB_PAYMENTS);
  if (clubPayments.getLastRow() === 0) {
    clubPayments.appendRow(CLUB_PAYMENTS_HEADERS);
    clubPayments.setFrozenRows(1);
  }

  let clubEvents = ss.getSheetByName(SHEET_CLUB_EVENTS);
  if (!clubEvents) clubEvents = ss.insertSheet(SHEET_CLUB_EVENTS);
  if (clubEvents.getLastRow() === 0) {
    clubEvents.appendRow(CLUB_EVENTS_HEADERS);
    clubEvents.setFrozenRows(1);
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
    users.appendRow([1, 'Administrador', '', 'admin', '1234', 'admin', true]);
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
 *   user_id | name | email | login | password | role | active
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
  sheet.appendRow([1, 'Administrador', '', 'admin', '1234', 'admin', true]);
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

/**
 * ⚠️ Rode esta função UMA VEZ depois de atualizar o código para a versão
 * com seller_id (chave estrangeira para users) e a coluna "active" em
 * users. Ela, nessa ordem:
 *   1. Adiciona a coluna "active" na aba users, marcando TRUE para todo
 *      mundo já cadastrado — ninguém perde acesso por causa da migração.
 *   2. Troca o cabeçalho "seller_login" por "seller_id" na aba sales.
 *   3. Converte o VALOR de cada linha de sales: onde antes tinha o login
 *      da vendedora (texto), passa a ter o user_id dela (número), buscando
 *      a correspondência na aba users.
 *
 * Vendas cujo login antigo não bate com nenhum usuário atual (ex: a conta
 * já tinha sido excluída antes dessa migração existir) ficam registradas no
 * log de execução para revisão manual — o valor original não é apagado, só
 * não é convertido, para não perder a informação.
 *
 * Não apaga nenhum dado. Segura de rodar mais de uma vez.
 */
function migrateSellerAndActiveColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const usersSheet = ss.getSheetByName(SHEET_USERS);
  if (usersSheet) {
    const currentHeaders = usersSheet.getRange(1, 1, 1, Math.max(usersSheet.getLastColumn(), 7)).getValues()[0];
    if (currentHeaders[6] !== 'active') {
      usersSheet.getRange(1, 7).setValue('active');
      const lastRow = usersSheet.getLastRow();
      if (lastRow >= 2) {
        const numRows = lastRow - 1;
        const activeCol = usersSheet.getRange(2, 7, numRows, 1).getValues();
        const filled = activeCol.map(function (r) { return [r[0] === '' ? true : r[0]]; });
        usersSheet.getRange(2, 7, numRows, 1).setValues(filled);
      }
      Logger.log('Coluna "active" adicionada à aba users (todos marcados como ativos).');
    }
  }

  const salesSheet = ss.getSheetByName(SHEET_SALES);
  if (salesSheet) {
    salesSheet.getRange(1, 8).setValue('seller_id');

    const lastRow = salesSheet.getLastRow();
    if (lastRow >= 2 && usersSheet) {
      const numRows = lastRow - 1;
      const sellerCol = salesSheet.getRange(2, 8, numRows, 1).getValues();

      const loginToId = {};
      const uLastRow = usersSheet.getLastRow();
      if (uLastRow >= 2) {
        const uValues = usersSheet.getRange(2, 1, uLastRow - 1, 4).getValues(); // user_id..login
        uValues.forEach(function (r) { loginToId[String(r[3]).toLowerCase()] = r[0]; });
      }

      let unresolved = 0;
      const converted = sellerCol.map(function (r) {
        const raw = r[0];
        if (raw === '' || raw === null) return [raw];
        if (!isNaN(Number(raw))) return [raw]; // já é número — já migrado, não mexe
        const id = loginToId[String(raw).toLowerCase()];
        if (id === undefined) { unresolved++; return [raw]; } // mantém o texto antigo, sem apagar
        return [id];
      });
      salesSheet.getRange(2, 8, numRows, 1).setValues(converted);

      if (unresolved > 0) {
        Logger.log('Atenção: ' + unresolved + ' venda(s) com login de vendedora não encontrado em users — mantidas com o texto antigo na coluna seller_id. Revise manualmente se necessário.');
      }
    }
  }

  SpreadsheetApp.flush();
  Logger.log('Migração de seller_id (foreign key) e coluna active concluída.');
}

/**
 * ⚠️ Rode esta função UMA VEZ depois de atualizar o código para a versão
 * com a tabela customers (normalização de cliente). Ela:
 *   1. Cria a aba "customers" com o cabeçalho certo, se ainda não existir.
 *   2. Reescreve o cabeçalho da aba "sales" para o novo formato (9 colunas:
 *      sale_id, customer_id, amount, payment_method, seller_id, created_at,
 *      pix_amount, card_amount, card_type — no lugar das 12 colunas antigas
 *      que guardavam nome/telefone/CPF/e-mail direto na venda).
 *
 * IMPORTANTE: essa migração assume que a aba "sales" está SEM linhas de
 * dados (só o cabeçalho) — a estrutura de colunas mudou de um jeito que não
 * dá pra converter automaticamente linha por linha (4 colunas viraram 1).
 * Se ainda houver vendas cadastradas, a função para e avisa no log, sem
 * mexer em nada — exclua manualmente as linhas de dados da aba sales
 * (mantendo só o cabeçalho) e rode de novo.
 *
 * Segura de rodar mais de uma vez.
 */
function migrateToCustomersSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let customers = ss.getSheetByName(SHEET_CUSTOMERS);
  if (!customers) {
    customers = ss.insertSheet(SHEET_CUSTOMERS);
    customers.appendRow(CUSTOMERS_HEADERS);
    customers.setFrozenRows(1);
    Logger.log('Aba "customers" criada.');
  }

  const sales = ss.getSheetByName(SHEET_SALES);
  if (sales) {
    const lastRow = sales.getLastRow();
    if (lastRow > 1) {
      Logger.log(
        'ATENÇÃO: a aba "sales" ainda tem ' + (lastRow - 1) + ' linha(s) de dados. ' +
        'Essa migração reestrutura as colunas de sales de um jeito incompatível com o formato ' +
        'antigo (4 colunas de cliente viram 1 coluna de customer_id) — exclua manualmente as ' +
        'linhas de dados (mantendo só o cabeçalho da linha 1) e rode esta função de novo.'
      );
      return;
    }
    sales.getRange(1, 1, 1, SALES_HEADERS.length).setValues([SALES_HEADERS]);
    const currentLastCol = sales.getLastColumn();
    if (currentLastCol > SALES_HEADERS.length) {
      sales.deleteColumns(SALES_HEADERS.length + 1, currentLastCol - SALES_HEADERS.length);
    }
  }

  SpreadsheetApp.flush();
  Logger.log('Migração para o schema com customers concluída.');
}

/**
 * Rode esta função UMA VEZ se sua aba "customers" ainda não tiver a coluna
 * "club" (ou seja, se ela nasceu no formato de 6 colunas, antes dessa
 * funcionalidade existir). Insere a coluna nova na posição certa (antes de
 * "created_at"), marcando FALSE para todo mundo já cadastrado — ninguém
 * vira cliente do Club sozinho só por causa dessa migração.
 * Segura de rodar mais de uma vez.
 */
function migrateAddClubColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CUSTOMERS);
  if (!sheet) {
    Logger.log('Aba "customers" não encontrada — rode migrateToCustomersSchema() primeiro.');
    return;
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), CUSTOMERS_HEADERS.length)).getValues()[0];
  if (headers[5] === 'club') {
    Logger.log('A coluna "club" já existe — nada a fazer.');
    return;
  }

  // Insere uma coluna em branco antes da posição F (empurra "created_at" pra G).
  sheet.insertColumnBefore(6);
  sheet.getRange(1, 6).setValue('club');

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const numRows = lastRow - 1;
    const falseValues = [];
    for (let i = 0; i < numRows; i++) falseValues.push([false]);
    sheet.getRange(2, 6, numRows, 1).setValues(falseValues);
  }

  SpreadsheetApp.flush();
  Logger.log('Coluna "club" adicionada à aba customers (todos marcados como não-Club).');
}

/**
 * ⚠️ Rode esta função UMA VEZ depois de atualizar o código para a versão
 * com itens de venda (saleitems). Ela, nessa ordem:
 *   1. Cria a aba "saleitems" com o cabeçalho certo e os dois itens que já
 *      existem hoje (Ingresso e Assinatura Club), se a aba ainda não existir.
 *   2. Insere a coluna "saleitem_id" na aba "sales" (antes de "amount").
 *
 * IMPORTANTE: como o app não tinha noção de "item vendido" até agora, não
 * existe como saber retroativamente qual item cada venda antiga representa.
 * Toda venda já cadastrada é marcada com o item de ID 1 (Ingresso Mesa por
 * Elas) por padrão — é a suposição mais razoável, já que o Club nem tinha
 * fluxo de venda até este momento. Revise manualmente na planilha se algum
 * caso específico precisar ser corrigido para "Assinatura Club" (ID 2).
 *
 * Preços de Ingresso e Assinatura Club nascem como 0 — edite os valores
 * reais na aba saleitems (ou pela própria tela "Itens de Venda" no app)
 * antes de publicar para o time.
 *
 * Segura de rodar mais de uma vez.
 */
function migrateAddSaleItemsSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let itemsSheet = ss.getSheetByName(SHEET_SALEITEMS);
  if (!itemsSheet) {
    itemsSheet = ss.insertSheet(SHEET_SALEITEMS);
    itemsSheet.appendRow(SALEITEMS_HEADERS);
    itemsSheet.appendRow([1, 'Ingresso Mesa por Elas', 0, true, new Date().toISOString()]);
    itemsSheet.appendRow([2, 'Assinatura Club', 0, true, new Date().toISOString()]);
    itemsSheet.setFrozenRows(1);
    Logger.log('Aba "saleitems" criada com os itens padrão (preços zerados — edite antes de publicar).');
  }

  const salesSheet = ss.getSheetByName(SHEET_SALES);
  if (!salesSheet) {
    SpreadsheetApp.flush();
    return;
  }
  const headers = salesSheet.getRange(1, 1, 1, Math.max(salesSheet.getLastColumn(), SALES_HEADERS.length)).getValues()[0];
  if (headers[2] === 'saleitem_id') {
    Logger.log('A aba "sales" já tem a coluna "saleitem_id" — nada a fazer.');
    SpreadsheetApp.flush();
    return;
  }

  salesSheet.insertColumnBefore(3); // insere antes da coluna C ("amount" hoje)
  salesSheet.getRange(1, 3).setValue('saleitem_id');

  const lastRow = salesSheet.getLastRow();
  if (lastRow >= 2) {
    const numRows = lastRow - 1;
    const defaultItemId = 1; // Ingresso Mesa por Elas
    const values = [];
    for (let i = 0; i < numRows; i++) values.push([defaultItemId]);
    salesSheet.getRange(2, 3, numRows, 1).setValues(values);
    Logger.log(
      'Coluna "saleitem_id" adicionada à aba sales. ' + numRows +
      ' venda(s) já existente(s) marcada(s) com o item padrão (Ingresso Mesa por Elas, ID 1) — ' +
      'revise manualmente se alguma dessas vendas era, na verdade, do Club.'
    );
  }

  SpreadsheetApp.flush();
  Logger.log('Migração de itens de venda concluída.');
}

/**
 * ⚠️ Rode esta função UMA VEZ depois de atualizar o código para a versão
 * com o Club (assinaturas, cobranças e calendário). Cria as 3 abas novas
 * — club_subscriptions, club_payments, club_events — se ainda não
 * existirem. Não apaga nenhum dado. Segura de rodar mais de uma vez.
 */
function migrateAddClubTables() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let clubSubscriptions = ss.getSheetByName(SHEET_CLUB_SUBSCRIPTIONS);
  if (!clubSubscriptions) {
    clubSubscriptions = ss.insertSheet(SHEET_CLUB_SUBSCRIPTIONS);
    clubSubscriptions.appendRow(CLUB_SUBSCRIPTIONS_HEADERS);
    clubSubscriptions.setFrozenRows(1);
    Logger.log('Aba "club_subscriptions" criada.');
  }

  let clubPayments = ss.getSheetByName(SHEET_CLUB_PAYMENTS);
  if (!clubPayments) {
    clubPayments = ss.insertSheet(SHEET_CLUB_PAYMENTS);
    clubPayments.appendRow(CLUB_PAYMENTS_HEADERS);
    clubPayments.setFrozenRows(1);
    Logger.log('Aba "club_payments" criada.');
  }

  let clubEvents = ss.getSheetByName(SHEET_CLUB_EVENTS);
  if (!clubEvents) {
    clubEvents = ss.insertSheet(SHEET_CLUB_EVENTS);
    clubEvents.appendRow(CLUB_EVENTS_HEADERS);
    clubEvents.setFrozenRows(1);
    Logger.log('Aba "club_events" criada.');
  }

  SpreadsheetApp.flush();
  Logger.log('Migração das tabelas do Club concluída.');
}

/**
 * ⚠️ Rode esta função UMA VEZ pra instalar o gatilho mensal automático que
 * gera as próximas cobranças do Club sozinho, sem precisar de ninguém abrir
 * o app (todo dia 1 de cada mês, às 3h da manhã). Sem isso, a geração de
 * cobrança só acontece de forma "oportunista" — quando alguém abre a tela
 * de Pagamentos do Club — o que funciona, mas depende de alguém acessar o
 * app naquele mês. Segura de rodar de novo: remove qualquer gatilho antigo
 * pra essa mesma função antes de criar um novo, então nunca duplica.
 */
function installClubPaymentsMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'generateUpcomingClubPaymentsTriggered') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('generateUpcomingClubPaymentsTriggered')
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();
  Logger.log('Gatilho mensal de cobranças do Club instalado (todo dia 1, às 3h da manhã).');
}

/** Função chamada pelo gatilho automático — não chame direto, é só o "corpo" do gatilho instalado acima. */
function generateUpcomingClubPaymentsTriggered() {
  const result = generateUpcomingClubPayments(3);
  Logger.log('Gatilho mensal rodou: ' + result.generated + ' cobrança(s) nova(s) gerada(s).');
}
