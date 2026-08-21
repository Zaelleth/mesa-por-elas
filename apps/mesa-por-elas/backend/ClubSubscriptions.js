/**
 * ClubSubscriptions.js — CRUD da aba "club_subscriptions".
 * Schema: subscription_id | customer_id | status | monthly_price | payment_method | started_at | canceled_at | billing_day
 *
 * Regras de negócio (decididas explicitamente com o usuário):
 *   - Uma assinatura é ÚNICA por customer_id — nunca existem duas linhas
 *     para a mesma cliente. A primeira venda do item de assinatura cria a
 *     linha; qualquer venda seguinte reativa a mesma linha (nunca cria outra).
 *   - Assinaturas NUNCA são excluídas — cancelar só muda o status.
 *   - Reativar preserva started_at original (o "tempo de casa" não reseta).
 *
 * billing_day é o DIA DO MÊS (1 a 28) em que a cobrança vence todo mês —
 * limitado a 28 de propósito, pra nunca cair num dia que não existe em
 * algum mês (ex: dia 31 em fevereiro). Escolhido no formulário de venda
 * (opcional); se não informado, usa o dia da própria venda como padrão. É
 * isso que resolve o due_date de club_payments, que antes ficava sempre
 * fixo no dia 1 do mês, sem opção de personalizar.
 *
 * Identificação de qual item vendido é "a assinatura": não existe uma
 * coluna nova em saleitems pra isso, de propósito (decisão do usuário) — o
 * sistema casa o NOME do item vendido (resolvido via sales.saleitem_id)
 * contra CLUB_SUBSCRIPTION_ITEM_NAMES, abaixo. Isso já cobre o item de hoje
 * ("Assinatura Club") e deixa espaço pra adicionar variantes futuras
 * (ex: "Assinatura Anual") só editando essa lista, sem mexer em schema.
 */

const SHEET_CLUB_SUBSCRIPTIONS = 'club_subscriptions';
const CLUB_SUBSCRIPTIONS_HEADERS = ['subscription_id', 'customer_id', 'status', 'monthly_price', 'payment_method', 'started_at', 'canceled_at', 'billing_day'];

const CLUB_SUBSCRIPTION_ITEM_NAMES = ['Assinatura Club'];

/** Confere se o NOME de um item vendido corresponde a uma assinatura do Club. */
function isClubSubscriptionItemName(name) {
  return CLUB_SUBSCRIPTION_ITEM_NAMES.some(function (n) {
    return n.toLowerCase() === String(name || '').toLowerCase();
  });
}

function getClubSubscriptionsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLUB_SUBSCRIPTIONS);
}

function findClubSubscriptionRowByCustomerId(sheet, customerId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // coluna B = customer_id
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(customerId)) return i + 2;
  }
  return -1;
}

function findClubSubscriptionRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function getNextClubSubscriptionId(sheet) {
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

/**
 * Lê todas as assinaturas, já resolvendo o nome/CPF da cliente (mesmo
 * padrão de leitura-única-e-mapa usado em Sales.js).
 */
function readClubSubscriptions() {
  const sheet = getClubSubscriptionsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, CLUB_SUBSCRIPTIONS_HEADERS.length).getValues();
  const customerMap = getCustomerLookupMap();
  return values
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      const customerInfo = customerMap[String(r[1])];
      return {
        id: String(r[0]),
        customerId: String(r[1]),
        customerName: customerInfo ? customerInfo.name : '(cliente removido)',
        status: r[2],
        monthlyPrice: Number(r[3]),
        paymentMethod: r[4],
        startedAt: r[5] instanceof Date ? r[5].toISOString() : r[5],
        canceledAt: r[6] ? (r[6] instanceof Date ? r[6].toISOString() : r[6]) : null,
        billingDay: (Number(r[7]) >= 1 && Number(r[7]) <= 28) ? Number(r[7]) : 1
      };
    });
}

/**
 * Cria a assinatura (se essa cliente nunca assinou) ou reativa a existente
 * (se ela já tinha uma linha, ativa ou cancelada) — nunca cria uma segunda
 * linha para o mesmo customer_id. Chamada por Sales.js logo depois de uma
 * venda do item de assinatura.
 */
function upsertClubSubscription(customerId, monthlyPrice, paymentMethod, saleTimestamp, billingDay) {
  Logger.log('upsertClubSubscription recebeu: customerId=' + customerId + ' billingDay=' + billingDay + ' (tipo: ' + typeof billingDay + ')');
  const sheet = getClubSubscriptionsSheet();
  const row = findClubSubscriptionRowByCustomerId(sheet, customerId);

  const validBillingDay = (billingDay && billingDay >= 1 && billingDay <= 28) ? billingDay : null;

  if (row === -1) {
    // Assinatura nova: sem escolha explícita, usa o dia do mês da própria
    // venda como vencimento — nunca fica em branco.
    const resolvedBillingDay = validBillingDay || new Date(saleTimestamp).getDate();
    Logger.log('Assinatura NOVA — resolvedBillingDay=' + resolvedBillingDay + ' (validBillingDay=' + validBillingDay + ')');
    const id = getNextClubSubscriptionId(sheet);
    sheet.appendRow([id, customerId, 'ativa', Number(monthlyPrice), paymentMethod, saleTimestamp, '', resolvedBillingDay]);
    SpreadsheetApp.flush();
    setCustomerClubFlag(customerId, true);
    return { id: id, isNew: true, startedAt: saleTimestamp };
  }

  // Reativação: preserva started_at original (regra explícita do usuário —
  // cancelar e voltar não reseta o "tempo de casa" da cliente).
  //
  // Prioridade pro dia de vencimento, nessa ordem: (1) um novo dia
  // explicitamente escolhido agora; (2) o que já estava configurado antes,
  // SE for um valor válido; (3) o dia da venda atual, como último recurso —
  // isso é o que garante que a coluna nunca fica em branco, mesmo que a
  // linha já existisse de antes dessa funcionalidade ter sido criada (e
  // por isso já estivesse com essa célula vazia).
  const startedAt = sheet.getRange(row, 6).getValue();
  const currentBillingDayRaw = Number(sheet.getRange(row, 8).getValue());
  const currentBillingDayValid = (currentBillingDayRaw >= 1 && currentBillingDayRaw <= 28) ? currentBillingDayRaw : null;
  const finalBillingDay = validBillingDay || currentBillingDayValid || new Date(saleTimestamp).getDate();

  sheet.getRange(row, 3, 1, 3).setValues([[ 'ativa', Number(monthlyPrice), paymentMethod ]]); // status, monthly_price, payment_method
  sheet.getRange(row, 7).setValue(''); // limpa canceled_at ao reativar
  sheet.getRange(row, 8).setValue(finalBillingDay);
  SpreadsheetApp.flush();
  setCustomerClubFlag(customerId, true);
  const id = sheet.getRange(row, 1).getValue();
  return { id: id, isNew: false, startedAt: startedAt instanceof Date ? startedAt.toISOString() : startedAt };
}

/** Cancela uma assinatura — nunca exclui a linha, só muda o status. Restrito a admin/gestor (gate em Main.js). */
function cancelClubSubscription(id) {
  const sheet = getClubSubscriptionsSheet();
  const row = findClubSubscriptionRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Assinatura não encontrada.' };
  const customerId = sheet.getRange(row, 2).getValue();
  sheet.getRange(row, 3).setValue('cancelada');
  sheet.getRange(row, 7).setValue(new Date().toISOString());
  SpreadsheetApp.flush();
  setCustomerClubFlag(customerId, false);
  return { ok: true };
}
