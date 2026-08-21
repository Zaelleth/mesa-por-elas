// Módulo Club — dashboard e assinantes do Mesa por Elas Club.
//
// A fonte de verdade sobre "quem é assinante" e "há quanto tempo" agora é
// club_subscriptions (criada/reativada automaticamente quando alguém
// compra o item "Assinatura Club" — ver Sales.js no backend), não mais o
// booleano customers.club. Esse booleano continua existindo (usado como
// selo rápido na tela Clientes), mas não é mais tocado por aqui.

import { state } from '../state.js';
import { fmtBRL, isElevatedRole } from '../utils.js';
import { apiGet, apiPost } from '../api.js';

export async function fetchClubSubscriptions(){
  try{
    const res = await apiGet('getClubSubscriptions');
    state.clubSubscriptions = (res && res.ok && res.subscriptions) ? res.subscriptions : [];
  }catch(e){ state.clubSubscriptions = []; }
}

function activeSubscriptions(){
  return state.clubSubscriptions.filter(s=>s.status==='ativa');
}

/**
 * Tempo de assinatura em texto, seguindo a cascata pedida:
 * 0-60s → segundos | 1-60min → minutos | 1-23h → horas
 * 1-30 dias → dias | 1-12 meses → meses | 12+ meses → anos
 * (meses/anos calculados por divisão simples de dias, não calendário exato
 * — suficiente aqui, já que a diferença só importa na prática depois de
 * semanas/meses de assinatura, não no nível de dias exatos).
 */
function formatClubTenure(iso){
  if(!iso) return 'tempo desconhecido';
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs/1000));

  const plural = (n, singular, pluralWord) => `${n} ${n===1 ? singular : pluralWord}`;

  if(sec < 60) return plural(sec,'segundo','segundos');
  const min = Math.floor(sec/60);
  if(min < 60) return plural(min,'minuto','minutos');
  const hours = Math.floor(min/60);
  if(hours < 24) return plural(hours,'hora','horas');
  const days = Math.floor(hours/24);
  if(days <= 30) return plural(days,'dia','dias');
  const months = Math.floor(days/30);
  if(months <= 12) return plural(months,'mês','meses');
  const years = Math.floor(months/12);
  return plural(years,'ano','anos');
}

// ---------- Dashboard do Club ----------
export function renderClubDashboard(){
  const active = activeSubscriptions();
  document.getElementById('clubStatTotal').textContent = active.length;

  const now = new Date();
  const monthKey = now.getFullYear()+'-'+now.getMonth();
  const monthRevenue = state.clubPayments
    .filter(p=>{
      const d = new Date(p.billingPeriod);
      return p.status==='pago' && (d.getFullYear()+'-'+d.getMonth())===monthKey;
    })
    .reduce((a,p)=>a+p.amount,0);
  document.getElementById('clubStatRevenue').textContent = 'R$ ' + fmtBRL(monthRevenue);

  const overdueCount = state.clubPayments.filter(p=>p.status==='atrasado').length;
  document.getElementById('clubStatOverdue').textContent = overdueCount;

  const recent = [...active].sort((a,b)=> new Date(b.startedAt) - new Date(a.startedAt)).slice(0,3);
  const veteran = [...active].sort((a,b)=> new Date(a.startedAt) - new Date(b.startedAt)).slice(0,5);

  const recentContainer = document.getElementById('clubRecentList');
  recentContainer.innerHTML = recent.length === 0
    ? '<div class="empty-row">Nenhuma assinante ainda</div>'
    : recent.map(s=>`
      <div class="sale-row">
        <div class="sale-row-main">
          <div class="sale-row-name">${s.customerName}</div>
          <div class="sale-row-meta">Assinante há ${formatClubTenure(s.startedAt)}</div>
        </div>
      </div>
    `).join('');

  const veteranContainer = document.getElementById('clubVeteranList');
  veteranContainer.innerHTML = veteran.length === 0
    ? '<div class="empty-row">Nenhuma assinante ainda</div>'
    : veteran.map((s,i)=>`
      <div class="sale-row">
        <div class="sale-row-main">
          <div class="sale-row-name"><span class="rank-badge">${i+1}º</span>${s.customerName}</div>
          <div class="sale-row-meta">Assinante há ${formatClubTenure(s.startedAt)}</div>
        </div>
      </div>
    `).join('');
}

// ---------- Listagem de assinantes (ativas) ----------
export function renderClubAssinantes(){
  const container = document.getElementById('clubAssinantesList');
  const list = [...activeSubscriptions()].sort((a,b)=>a.customerName.localeCompare(b.customerName,'pt-BR'));
  const canManage = isElevatedRole(state.currentRole);

  if(list.length === 0){
    container.innerHTML = '<div class="empty-row">Nenhuma assinante ativa no momento</div>';
    return;
  }

  container.innerHTML = list.map(s=>`
    <div class="sale-row">
      <div class="sale-row-main">
        <div class="sale-row-name">${s.customerName} <span class="pill club">★ Club</span></div>
        <div class="sale-row-meta">
          Assinante há ${formatClubTenure(s.startedAt)} &middot; R$ ${fmtBRL(s.monthlyPrice)}/mês &middot; Vence dia ${s.billingDay}
        </div>
      </div>
      ${canManage ? `<div class="sale-row-actions"><button class="del-btn" data-id="${s.id}" title="Cancelar assinatura">✕</button></div>` : ''}
    </div>
  `).join('');

  container.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const sub = state.clubSubscriptions.find(s=>s.id === b.dataset.id);
      const label = sub ? `"${sub.customerName}"` : 'esta assinante';
      if(confirm(`Cancelar a assinatura de ${label}? Ela sai da lista de assinantes ativas, mas o histórico é preservado — se ela assinar de novo depois, o tempo de casa dela é mantido.`)){
        try{
          await apiPost('cancelClubSubscription', { id: b.dataset.id });
          if(sub) sub.status = 'cancelada';
          renderClubAssinantes();
          renderClubDashboard();
        }catch(err){
          alert('Não foi possível cancelar. Verifique sua conexão e tente novamente.');
        }
      }
    });
  });
}

export function initClubListeners(){
  // Sem formulário próprio — assinaturas nascem/reativam sozinhas via
  // venda do item de assinatura (ver Sales.js). A única ação manual aqui é
  // cancelar, já ligada na renderização acima.
}
