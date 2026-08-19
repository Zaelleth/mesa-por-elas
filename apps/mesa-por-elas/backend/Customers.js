/**
 * Customers.js — CRUD da aba "customers".
 * Schema: customer_id | name | phone | cpf | email | club | created_at
 *
 * CPF é a identidade real da cliente (único). Telefone e e-mail NÃO são
 * únicos — podem ser compartilhados ou mudar ao longo do tempo, então nunca
 * bloqueiam nada sozinhos, só disparam uma confirmação no frontend antes de
 * atualizar o cadastro.
 *
 * "club" é booleano — pavimentação para o módulo Mesa por Elas Club, ainda
 * não implementado. Por enquanto, é só um sinalizador editável na tela de
 * Clientes, que já rende um selo especial na listagem.
 *
 * Não existe deleteCustomer nesta aba de propósito: a decisão de produto foi
 * que exclusão de cliente só acontece manualmente direto na planilha, nunca
 * pelo app — evita apagar sem querer o histórico de compras de alguém.
 */

const SHEET_CUSTOMERS = 'customers';
const CUSTOMERS_HEADERS = ['customer_id', 'name', 'phone', 'cpf', 'email', 'club', 'created_at'];

function getCustomersSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CUSTOMERS);
}

/** Mantém só os dígitos do CPF, para comparar/gravar sem depender de máscara idêntica. */
function normalizeCpfDigits(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

/** Ao contrário de "active" (Users.js), aqui o padrão para linha em branco é FALSE — ninguém vira Club sozinho. */
function normalizeClub(rawValue) {
  return rawValue === true || rawValue === 'TRUE' || rawValue === 'true';
}

function readCustomers() {
  const sheet = getCustomersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, CUSTOMERS_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        id: String(r[0]),
        name: r[1],
        phone: r[2],
        cpf: r[3],
        email: r[4],
        club: normalizeClub(r[5]),
        createdAt: r[6] instanceof Date ? r[6].toISOString() : r[6]
      };
    });
}

/**
 * Lê a aba customers UMA ÚNICA VEZ e devolve um mapa { customer_id: {name,
 * phone, cpf, email} } — mesmo padrão de otimização de getUserLookupMap()
 * (Users.js), usado por Sales.js para resolver todas as vendas de uma vez.
 */
function getCustomerLookupMap() {
  const sheet = getCustomersSheet();
  const map = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  const values = sheet.getRange(2, 1, lastRow - 1, CUSTOMERS_HEADERS.length).getValues();
  values.forEach(function (r) {
    if (!r[0]) return;
    map[String(r[0])] = { name: r[1], phone: r[2], cpf: r[3], email: r[4] };
  });
  return map;
}

function findCustomerRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function findCustomerRowByCpf(sheet, cpf) {
  const digits = normalizeCpfDigits(cpf);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const cpfs = sheet.getRange(2, 4, lastRow - 1, 1).getValues(); // coluna D = cpf
  for (let i = 0; i < cpfs.length; i++) {
    if (normalizeCpfDigits(cpfs[i][0]) === digits) return i + 2;
  }
  return -1;
}

function getNextCustomerId(sheet) {
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

/** Usado pela tela de Clientes para popular o formulário de edição, e por outras buscas pontuais. */
function getCustomerByCpf(cpf) {
  const sheet = getCustomersSheet();
  const row = findCustomerRowByCpf(sheet, cpf);
  if (row === -1) return null;
  const values = sheet.getRange(row, 1, 1, CUSTOMERS_HEADERS.length).getValues()[0];
  return { id: String(values[0]), name: values[1], phone: values[2], cpf: values[3], email: values[4], club: normalizeClub(values[5]) };
}

/** Cadastro manual de cliente pela tela de Clientes (independe de venda). */
function addCustomer(customer) {
  if (!customer || !customer.name || !customer.phone || !customer.cpf) {
    return { ok: false, error: 'Preencha nome, telefone e CPF.' };
  }
  const sheet = getCustomersSheet();
  if (findCustomerRowByCpf(sheet, customer.cpf) !== -1) {
    return { ok: false, error: 'Já existe um cliente cadastrado com esse CPF.' };
  }
  const id = getNextCustomerId(sheet);
  const createdAt = new Date().toISOString();
  const club = !!customer.club;
  sheet.appendRow([id, customer.name, customer.phone, customer.cpf, customer.email || '', club, createdAt]);
  SpreadsheetApp.flush();
  return { ok: true, customer: { id: String(id), name: customer.name, phone: customer.phone, cpf: customer.cpf, email: customer.email || '', club: club, createdAt: createdAt } };
}

/** Edição manual pela tela de Clientes. Não existe exclusão — só edição. */
function updateCustomer(id, customer) {
  if (!customer || !customer.name || !customer.phone || !customer.cpf) {
    return { ok: false, error: 'Preencha nome, telefone e CPF.' };
  }
  const sheet = getCustomersSheet();
  const row = findCustomerRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Cliente não encontrado.' };

  const existingCpfRow = findCustomerRowByCpf(sheet, customer.cpf);
  if (existingCpfRow !== -1 && existingCpfRow !== row) {
    return { ok: false, error: 'Já existe outro cliente cadastrado com esse CPF.' };
  }

  sheet.getRange(row, 2, 1, 5).setValues([[ customer.name, customer.phone, customer.cpf, customer.email || '', !!customer.club ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

/**
 * Núcleo chamado por Sales.js ao registrar/editar uma venda. Recebe os
 * dados de cliente digitados no formulário e decide:
 *   - CPF não encontrado  → cria cliente novo, devolve o customer_id novo.
 *   - CPF encontrado, nome bate → reaproveita o cliente. Se telefone/e-mail
 *     vieram diferentes do cadastro, atualiza (o frontend já confirmou isso
 *     com a pessoa antes de chamar a venda — ver confirmModal no app).
 *   - CPF encontrado, nome NÃO bate → recusa (identidade divergente). Essa é
 *     a única checagem que de fato bloqueia o registro da venda.
 */
function resolveCustomerForSale(input) {
  const sheet = getCustomersSheet();
  const row = findCustomerRowByCpf(sheet, input.cpf);

  if (row === -1) {
    const id = getNextCustomerId(sheet);
    const createdAt = new Date().toISOString();
    sheet.appendRow([id, input.name, input.phone, input.cpf, input.email || '', false, createdAt]);
    SpreadsheetApp.flush();
    return { ok: true, customerId: id };
  }

  const existingName = String(sheet.getRange(row, 2).getValue());
  if (existingName.trim().toLowerCase() !== String(input.name).trim().toLowerCase()) {
    return { ok: false, error: 'Esse CPF já está cadastrado no nome de outra pessoa.' };
  }

  const id = sheet.getRange(row, 1).getValue();
  // Só telefone/cpf/email — o status de club não é tocado por uma venda.
  sheet.getRange(row, 3, 1, 3).setValues([[ input.phone, input.cpf, input.email || '' ]]);
  SpreadsheetApp.flush();
  return { ok: true, customerId: id };
}
