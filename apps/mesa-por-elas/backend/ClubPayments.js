/**
 * ClubPayments.js — CRUD da aba "club_payments".
 * Schema: payment_id | subscription_id | billing_period | due_date | paid_date | amount | status
 *
 * billing_period é uma DATA de verdade (sempre normalizada pro dia 1 do
 * mês, ex: 2026-08-01), não duas colunas separadas de mês/ano — mesma
 * lógica usada por sistemas de cobrança recorrente reais (Stripe, etc.):
 * mês/ano é informação DERIVADA de uma data, não um dado primário à parte.
 *
 * status guardado é só 'pendente'/'pago'/'cancelado' — "atrasado" nunca é
 * gravado, é calculado na leitura (due_date já passou + ainda pendente).
 * Isso evita ter que "empurrar" status desatualizado com o tempo.
 *
 * O app só REGISTRA pagamento (marcado manualmente) — não processa
 * cobrança de verdade nenhuma, por decisão do usuário.
 */

const SHEET_CLUB_PAYMENTS = 'club_payments';
const CLUB_PAYMENTS_HEADERS = ['payment_id', 'subscription_id', 'billing_period', 'due_date', 'paid_date', 'amount', 'status'];

function getClubPaymentsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLUB_PAYMENTS);
}

function findClubPaymentRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/** Acha a linha de cobrança de uma assinatura num mês específico (evita duplicar). */
function findClubPaymentRow(sheet, subscriptionId, billingPeriodDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, 2, lastRow - 1, 2).getValues(); // subscription_id, billing_period
  const targetKey = billingPeriodDate.getFullYear() + '-' + billingPeriodDate.getMonth();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) !== String(subscriptionId)) continue;
    const rowDate = values[i][1] instanceof Date ? values[i][1] : new Date(values[i][1]);
    const rowKey = rowDate.getFullYear() + '-' + rowDate.getMonth();
    if (rowKey === targetKey) return i + 2;
  }
  return -1;
}

function getNextClubPaymentId(sheet) {
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

/** Normaliza qualquer data pro dia 1 do mês dela, meia-noite — é isso que vira billing_period. */
function firstDayOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Lê todas as cobranças, calculando "atrasado" na hora (nunca gravado).
 */
function readClubPayments() {
  const sheet = getClubPaymentsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, CLUB_PAYMENTS_HEADERS.length).getValues();
  const subMap = {};
  readClubSubscriptions().forEach(function (s) { subMap[s.id] = s; });
  const now = new Date();

  return values
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      const dueDate = r[3] instanceof Date ? r[3] : new Date(r[3]);
      let status = r[6];
      if (status === 'pendente' && dueDate < now) status = 'atrasado';
      const sub = subMap[String(r[1])];
      return {
        id: String(r[0]),
        subscriptionId: String(r[1]),
        customerName: sub ? sub.customerName : '(assinatura removida)',
        billingPeriod: r[2] instanceof Date ? r[2].toISOString() : r[2],
        dueDate: r[3] instanceof Date ? r[3].toISOString() : r[3],
        paidDate: r[4] ? (r[4] instanceof Date ? r[4].toISOString() : r[4]) : null,
        amount: Number(r[5]),
        status: status
      };
    });
}

/**
 * Chamada por Sales.js logo após uma venda de assinatura: registra o MÊS
 * DA VENDA como já pago (a venda que originou isso já é o pagamento
 * confirmado). Se por algum motivo já existir uma cobrança pra esse mês
 * (ex: reativação no mesmo mês em que já tinha sido gerada como pendente),
 * atualiza ela em vez de duplicar.
 */
function recordSubscriptionSalePayment(subscriptionId, amount, saleTimestamp) {
  const sheet = getClubPaymentsSheet();
  const billingPeriod = firstDayOfMonth(saleTimestamp);
  const existingRow = findClubPaymentRow(sheet, subscriptionId, billingPeriod);

  if (existingRow !== -1) {
    sheet.getRange(existingRow, 5, 1, 3).setValues([[ saleTimestamp, Number(amount), 'pago' ]]); // paid_date, amount, status
    SpreadsheetApp.flush();
    return;
  }

  const id = getNextClubPaymentId(sheet);
  sheet.appendRow([
    id, subscriptionId, billingPeriod.toISOString(), billingPeriod.toISOString(),
    saleTimestamp, Number(amount), 'pago'
  ]);
  SpreadsheetApp.flush();
}

/**
 * Gera as cobranças PENDENTES dos próximos meses (padrão: 3 meses à
 * frente) para toda assinatura com status='ativa', sem duplicar cobranças
 * que já existem pra aquele mês. Chamada por:
 *   1. O gatilho mensal automático (ver Setup.js — precisa ser instalado
 *      uma vez, é o que garante isso rodar sozinho, sem ninguém abrir o app).
 *   2. Toda vez que a tela de Pagamentos do Club é aberta (checagem
 *      oportunista — rede de segurança caso o gatilho não esteja instalado).
 * Idempotente: rodar de novo no mesmo mês não duplica nada.
 */
function generateUpcomingClubPayments(monthsAhead) {
  monthsAhead = monthsAhead || 3;
  const subsSheet = getClubSubscriptionsSheet();
  const subsLastRow = subsSheet.getLastRow();
  if (subsLastRow < 2) return { generated: 0 };

  const subsValues = subsSheet.getRange(2, 1, subsLastRow - 1, CLUB_SUBSCRIPTIONS_HEADERS.length).getValues();
  const paymentsSheet = getClubPaymentsSheet();
  const today = new Date();
  let generated = 0;

  subsValues.forEach(function (r) {
    const subscriptionId = r[0];
    const status = r[2];
    const monthlyPrice = Number(r[3]);
    if (status !== 'ativa') return;

    for (let i = 0; i <= monthsAhead; i++) {
      const period = new Date(today.getFullYear(), today.getMonth() + i, 1);
      if (findClubPaymentRow(paymentsSheet, subscriptionId, period) !== -1) continue;
      const id = getNextClubPaymentId(paymentsSheet);
      paymentsSheet.appendRow([id, subscriptionId, period.toISOString(), period.toISOString(), '', monthlyPrice, 'pendente']);
      generated++;
    }
  });

  if (generated > 0) SpreadsheetApp.flush();
  return { generated: generated };
}

/** Marca uma cobrança específica como paga manualmente. Restrito a admin/gestor (gate em Main.js). */
function markClubPaymentPaid(id) {
  const sheet = getClubPaymentsSheet();
  const row = findClubPaymentRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Cobrança não encontrada.' };
  sheet.getRange(row, 5).setValue(new Date().toISOString());
  sheet.getRange(row, 7).setValue('pago');
  SpreadsheetApp.flush();
  return { ok: true };
}
