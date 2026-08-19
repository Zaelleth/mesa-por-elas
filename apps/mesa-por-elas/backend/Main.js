/**
 * BACKEND — "A Mesa por Elas" — Controle de Vendas
 * -------------------------------------------------
 * Este projeto está dividido em arquivos por responsabilidade:
 *   Main.js      → roteamento HTTP (este arquivo)
 *   Auth.js      → login, sessões, controle de acesso
 *   Users.js     → CRUD do cadastro de usuários (aba "users")
 *   Customers.js → CRUD de clientes (aba "customers")
 *   Sales.js     → CRUD de vendas (aba "sales")
 *   Settings.js  → configurações (aba "settings")
 *   Setup.js     → criação inicial e migrações de planilha
 *
 * No Apps Script, todos os arquivos compartilham o mesmo escopo global —
 * ou seja, uma função definida em Sales.js pode ser chamada normalmente
 * a partir daqui, sem import nenhum. A ordem dos arquivos não importa para
 * a execução (só reflete a ordem alfabética no editor).
 *
 * COMO INSTALAR (resumo — veja o guia completo em docs/mesa-por-elas.md):
 * 1. clasp push para enviar todos os arquivos.
 * 2. Rode a função setupSheets() (em Setup.js) uma única vez.
 * 3. Implante como aplicativo da web (Deploy > New deployment > Web app).
 * 4. Copie a URL gerada (termina em /exec) e cole em js/config.js no frontend.
 */

function doGet(e) {
  try {
    if (!isValidSession(e.parameter.token)) {
      return jsonOut({ ok: false, error: 'SESSION_INVALID' });
    }
    const action = e.parameter.action;
    if (action === 'getSales') return jsonOut({ ok: true, sales: readSales() });
    if (action === 'getConfig') return jsonOut({ ok: true, goal: readConfig().goal });
    if (action === 'getSellers') return jsonOut({ ok: true, sellers: getSellers() });
    // Tela de Clientes é visível para todo mundo (admin, gestor e
    // vendedora) — sem gate extra além de ter uma sessão válida.
    if (action === 'getCustomers') return jsonOut({ ok: true, customers: readCustomers() });
    if (action === 'getUsers') {
      if (!isAdminOrGestorSession(e.parameter.token)) {
        return jsonOut({ ok: false, error: 'Acesso restrito a administradores e gestores.' });
      }
      return jsonOut({ ok: true, users: readUsers() });
    }
    return jsonOut({ ok: false, error: 'Ação GET desconhecida.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Espera até 15s caso outro dispositivo esteja gravando ao mesmo tempo.
    // Isso é o que garante que várias pessoas possam usar o app sem corromper dados.
    lock.waitLock(15000);
  } catch (err) {
    return jsonOut({ ok: false, error: 'Sistema ocupado no momento, tente novamente em instantes.' });
  }

  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;

    if (action === 'login') {
      if (!isValidBootstrapToken(body.token)) {
        return jsonOut({ ok: false, error: 'Acesso não autorizado.' });
      }
      return jsonOut(login(body.username, body.password));
    }

    // Todas as ações abaixo exigem uma sessão válida (obtida via login).
    if (!isValidSession(body.token)) {
      return jsonOut({ ok: false, error: 'SESSION_INVALID' });
    }

    if (action === 'logout') {
      CacheService.getScriptCache().remove('session_' + body.token);
      return jsonOut({ ok: true });
    }
    if (action === 'addSale') return jsonOut(addSale(body.sale));
    if (action === 'updateSale') return jsonOut(updateSale(body.id, body.sale));
    if (action === 'deleteSale') return jsonOut(deleteSale(body.id));
    if (action === 'saveConfig') return jsonOut(saveConfig(body.goal));

    // Clientes: qualquer pessoa logada pode cadastrar/editar — não existe
    // exclusão de cliente pelo app (decisão de produto), só pela planilha.
    if (action === 'addCustomer') return jsonOut(addCustomer(body.customer));
    if (action === 'updateCustomer') return jsonOut(updateCustomer(body.id, body.customer));

    if (action === 'addUser') {
      const session = getSessionData(body.token);
      if (!session || (session.role !== 'admin' && session.role !== 'gestor')) {
        return jsonOut({ ok: false, error: 'Acesso restrito a administradores e gestores.' });
      }
      return jsonOut(addUser(body.user, session.role));
    }
    if (action === 'updateUser') {
      const session = getSessionData(body.token);
      if (!session || (session.role !== 'admin' && session.role !== 'gestor')) {
        return jsonOut({ ok: false, error: 'Acesso restrito a administradores e gestores.' });
      }
      return jsonOut(updateUser(body.id, body.user, session.role, session.username));
    }
    if (action === 'deleteUser') {
      const session = getSessionData(body.token);
      if (!session || (session.role !== 'admin' && session.role !== 'gestor')) {
        return jsonOut({ ok: false, error: 'Acesso restrito a administradores e gestores.' });
      }
      return jsonOut(deleteUser(body.id, session.role));
    }
    if (action === 'setUserActive') {
      const session = getSessionData(body.token);
      if (!session || (session.role !== 'admin' && session.role !== 'gestor')) {
        return jsonOut({ ok: false, error: 'Acesso restrito a administradores e gestores.' });
      }
      return jsonOut(setUserActive(body.id, body.active, session.role, session.username));
    }

    return jsonOut({ ok: false, error: 'Ação POST desconhecida.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
