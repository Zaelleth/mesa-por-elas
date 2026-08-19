// Modal genérico, reutilizável em qualquer tela do app.
// Dois usos:
//   1. confirmModal({...}) — pergunta sim/não estilizada (ex: "telefone
//      diferente do cadastrado, atualizar?"), devolve uma Promise<boolean>.
//   2. openModal(html) / closeModal() — painel de conteúdo livre (ex: ficha
//      expandida de um cliente, com o histórico de compras).
// Não depende de nenhum outro módulo do app — só manipula o DOM.

/**
 * Mostra um modal de confirmação com dois botões e devolve uma Promise que
 * resolve `true` (confirmou) ou `false` (cancelou ou clicou fora).
 */
export function confirmModal({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>${title}</h3>
        <p class="modal-message">${message}</p>
        <div class="modal-actions">
          <button class="btn-outline" id="modalCancelBtn" style="width:auto;">${cancelLabel}</button>
          <button class="submit-btn" id="modalConfirmBtn" style="width:auto;">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector('#modalCancelBtn').addEventListener('click', () => cleanup(false));
    overlay.querySelector('#modalConfirmBtn').addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
  });
}

/** Abre um painel de conteúdo livre (HTML já pronto). Use closeModal() pra fechar. */
export function openModal(innerHtml, { wide = true } = {}) {
  closeModal(); // garante que não fica um modal velho por baixo
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dynamicModalOverlay';
  overlay.innerHTML = `<div class="modal-card ${wide ? 'modal-card-wide' : ''}">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  return overlay;
}

export function closeModal() {
  const el = document.getElementById('dynamicModalOverlay');
  if (el) el.remove();
}
