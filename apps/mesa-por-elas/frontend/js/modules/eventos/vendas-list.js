// Módulo Eventos — tela "Vendas": listagem completa, com ordenação.

import { state } from '../../state.js';
import { fmtBRL, paymentLabel, paymentPillClass, isElevatedRole } from '../../utils.js';
import { deleteSaleAPI } from './sales-data.js';
import { startEdit } from './sales-form.js';

const SORT_FIELDS = [
  { key: 'data', label: 'Data' },
  { key: 'nome', label: 'Nome da cliente' },
  { key: 'pagamento', label: 'Método de pagamento' },
  { key: 'vendedora', label: 'Vendedora' },
  { key: 'misto', label: 'Pagamento em 2 meios' }
];

function compareBy(field){
  switch(field){
    case 'data':
      return (a,b)=> new Date(a.timestamp) - new Date(b.timestamp);
    case 'nome':
      return (a,b)=> a.name.localeCompare(b.name, 'pt-BR');
    case 'pagamento':
      return (a,b)=> paymentLabel(a).localeCompare(paymentLabel(b), 'pt-BR');
    case 'vendedora':
      return (a,b)=> a.seller.localeCompare(b.seller, 'pt-BR');
    case 'misto':
      return (a,b)=> (a.payment==='misto'?1:0) - (b.payment==='misto'?1:0);
    default:
      return ()=>0;
  }
}

function sortedSales(){
  // Mesma regra de visibilidade do restante do app: só vendedora vê apenas o que é dela.
  const base = isElevatedRole(state.currentRole)
    ? state.sales
    : state.sales.filter(s=>s.seller===state.currentUser);
  const list = [...base].sort(compareBy(state.vendasSort.field));
  if(state.vendasSort.dir === 'desc') list.reverse();
  return list;
}

function updateSortTrigger(){
  const fieldMeta = SORT_FIELDS.find(f=>f.key===state.vendasSort.field);
  const arrow = state.vendasSort.dir === 'desc' ? '↓' : '↑';
  document.getElementById('sortLabel').textContent = `${fieldMeta.label} ${arrow}`;
  document.querySelectorAll('#sortMenu .sort-option').forEach(btn=>{
    const isActive = btn.dataset.field === state.vendasSort.field;
    btn.classList.toggle('active', isActive);
    btn.querySelector('.dir-arrow').textContent = isActive ? arrow : '';
  });
}

export function renderVendasList(){
  const container = document.getElementById('salesListContainer');
  if(!container) return;
  const list = sortedSales();
  container.innerHTML = '';

  if(list.length === 0){
    container.innerHTML = '<div class="empty-row">Nenhuma venda registrada ainda</div>';
    updateSortTrigger();
    return;
  }

  list.forEach(s=>{
    const d = new Date(s.timestamp);
    const dateStr = d.toLocaleDateString('pt-BR');
    const timeStr = d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    const row = document.createElement('div');
    row.className = 'sale-row';
    row.innerHTML = `
      <div class="sale-row-main">
        <div class="sale-row-name">${s.name}</div>
        <div class="sale-row-meta">
          ${s.seller} &middot; <span class="pill ${paymentPillClass(s)}">${paymentLabel(s)}</span> &middot; ${dateStr} ${timeStr}
        </div>
      </div>
      <div class="sale-row-actions">
        <div class="sale-row-amount">R$ ${fmtBRL(s.amount)}</div>
        <button class="edit-btn" data-id="${s.id}" title="Editar">✎</button>
        <button class="del-btn" data-id="${s.id}" title="Excluir">✕</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=> startEdit(b.dataset.id));
  });
  container.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(confirm('Excluir esta venda?')){
        try{
          await deleteSaleAPI(b.dataset.id);
          state.sales = state.sales.filter(s=>s.id !== b.dataset.id);
          renderVendasList();
        }catch(err){
          alert('Não foi possível excluir. Verifique sua conexão e tente novamente.');
        }
      }
    });
  });

  updateSortTrigger();
}

export function initVendasListeners(){
  const menu = document.getElementById('sortMenu');
  const trigger = document.getElementById('btnSortMenu');
  if(!menu || !trigger) return;

  menu.innerHTML = '';
  SORT_FIELDS.forEach(f=>{
    const btn = document.createElement('button');
    btn.className = 'sort-option';
    btn.dataset.field = f.key;
    btn.innerHTML = `<span>${f.label}</span><span class="dir-arrow"></span>`;
    menu.appendChild(btn);
  });

  menu.addEventListener('click', e=>{
    const btn = e.target.closest('.sort-option');
    if(!btn) return;
    const field = btn.dataset.field;
    if(state.vendasSort.field === field){
      state.vendasSort.dir = state.vendasSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.vendasSort.field = field;
      state.vendasSort.dir = field === 'data' ? 'desc' : 'asc';
    }
    renderVendasList();
  });

  trigger.addEventListener('click', e=>{
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', ()=>{
    menu.classList.remove('open');
  });
}
