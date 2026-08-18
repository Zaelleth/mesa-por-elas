/**
 * BACKEND — "A Mesa por Elas" — Controle de Vendas
 * -------------------------------------------------
 * Este projeto está dividido em arquivos por responsabilidade:
 *   Main.js    → roteamento HTTP (este arquivo)
 *   Auth.js    → login, sessões, controle de acesso
 *   Sales.js   → CRUD de vendas (aba "Vendas")
 *   Config.js  → meta de vendas (aba "Config")
 *   Setup.js   → criação inicial e migrações de planilha
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
