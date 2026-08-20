// Módulo Club — Pagamentos. O app nunca processa cobrança de verdade (por
// decisão do usuário): só registra o que já foi pago em outro lugar. As
// linhas em si nascem sozinhas — geradas automaticamente pelo backend (via
// gatilho mensal, ou como checagem oportunista ao abrir esta tela) — a
// única ação manual aqui é marcar uma cobrança pendente/atrasada como paga.

import { state } from '../state.js';
import { fmtBRL, isElevatedRole } from '../utils.js';
import { apiGet, apiPost } from '../api.js';

export async function fetchClubPayments(){
  try{
    const res = await apiGet('getClubPayments');
    state.clubPayments = (res && res.ok && res.payments) ? res.payments : [];
  }catch(e){ state.clubPayments = []; }
}

function statusLabel(status){
  return { pendente:'Pendente', pago:'Pago', atrasado:'Atrasado', cancelado:'Cancelado' }[status] || status;
}

export function renderClubPayments(){
  const container = document.getElementById('clubPaymentsList');
  const list = [...state.clubPayments].sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate));
  const canManage = isElevatedRole(state.currentRole);

  if(list.length === 0){
    container.innerHTML = '<div class="empty-row">Nenhuma cobrança gerada ainda — assim que a primeira assinatura for vendida, os próximos meses aparecem aqui sozinhos</div>';
    return;
  }

  container.innerHTML = list.map(p=>{
    const period = new Date(p.billingPeriod).toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
    const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
    const canMark = canManage && (p.status === 'pendente' || p.status === 'atrasado');
    return `
      <div class="sale-row">
        <div class="sale-row-main">
          <div class="sale-row-name">${p.customerName}</div>
          <div class="sale-row-meta">
            ${periodLabel} &middot; R$ ${fmtBRL(p.amount)} &middot; <span class="pill ${p.status}">${statusLabel(p.status)}</span>
          </div>
        </div>
        ${canMark ? `<div class="sale-row-actions"><button class="edit-btn" data-id="${p.id}" title="Marcar como pago">✓</button></div>` : ''}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(confirm('Marcar essa cobrança como paga?')){
        try{
          await apiPost('markClubPaymentPaid', { id: b.dataset.id });
          const p = state.clubPayments.find(x=>x.id === b.dataset.id);
          if(p) p.status = 'pago';
          renderClubPayments();
        }catch(err){
          alert('Não foi possível marcar como pago. Verifique sua conexão e tente novamente.');
        }
      }
    });
  });
}

export async function loadAndRenderClubPayments(){
  await fetchClubPayments();
  renderClubPayments();
}

export function initClubPaymentsListeners(){
  // Sem formulário — cobranças só nascem automaticamente, nunca criadas à mão.
}
