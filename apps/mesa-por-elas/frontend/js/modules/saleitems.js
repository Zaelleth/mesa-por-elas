// Módulo Itens de Venda — o que é vendido no sistema (hoje: Ingresso do
// evento e Assinatura do Club). Chamado de "Itens de Venda", não "Produtos",
// já que o projeto não é uma loja.
//
// Gerenciamento (criar/editar/inativar) é restrito a admin e gestor — a
// aba fica escondida do menu pra vendedora (ver auth.js). A LISTAGEM em si
// (fetchSaleItems/populateItemSelect) é usada por qualquer papel, porque
// toda venda precisa de um item escolhido no formulário.
//
// Sem exclusão pelo app, de propósito — só inativação. Ver SaleItems.js no
// backend para o porquê disso ser seguro mesmo se alguém excluir um item
// direto na planilha.

import { state } from '../state.js';
import { fmtBRL } from '../utils.js';
import { apiGet, apiPost } from '../api.js';

// ---------- Comunicação com o backend ----------
export async function fetchSaleItems(){
  try{
    const res = await apiGet('getSaleItems');
    state.saleItems = (res && res.ok && res.items) ? res.items : [];
  }catch(e){ state.saleItems = []; }
}

async function addSaleItemAPI(item){
  const res = await apiPost('addSaleItem', { item });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao criar o item.');
  return res.item;
}
async function updateSaleItemAPI(id, item){
  const res = await apiPost('updateSaleItem', { id, item });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao salvar as alterações.');
}
async function setSaleItemActiveAPI(id, active){
  const res = await apiPost('setSaleItemActive', { id, active });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao alterar o status do item.');
}

// ---------- Seletor de item, usado no formulário de venda ----------
/**
 * Preenche o <select> de item da venda com todos os itens ATIVOS — mais o
 * item atualmente selecionado, mesmo que já tenha sido inativado depois
 * (garante que editar uma venda antiga continue funcionando).
 */
// Precisa bater com CLUB_SUBSCRIPTION_ITEM_NAMES em ClubSubscriptions.js
// (backend) — é assim que o sistema reconhece "este item é a assinatura".
const CLUB_SUBSCRIPTION_ITEM_NAME = 'Assinatura Club';

/**
 * Mostra/esconde o campo "Dia de vencimento" (usado só quando o item
 * selecionado é a assinatura do Club). Centralizado aqui — chamado sempre
 * que a seleção de item muda, seja por escolha manual (evento 'change') ou
 * programaticamente (populateItemSelect, abaixo) — assim esse campo nunca
 * mais fica com a visibilidade desincronizada da seleção de verdade.
 */
export function applyBillingDayVisibility(itemId){
  const wrap = document.getElementById('billingDayFieldWrap');
  if(!wrap) return;
  const item = state.saleItems.find(i=>i.id === itemId);
  const isSubscription = !!(item && item.name && item.name.toLowerCase() === CLUB_SUBSCRIPTION_ITEM_NAME.toLowerCase());
  wrap.style.display = isSubscription ? '' : 'none';
  if(!isSubscription){
    const input = document.getElementById('fBillingDay');
    if(input){ input.value = ''; input.classList.remove('invalid'); }
    const errorEl = document.getElementById('fBillingDayError');
    if(errorEl) errorEl.textContent = '';
  }
}

export function populateItemSelect(preselectId){
  const select = document.getElementById('itemSelect');
  if(!select) return;

  // Se não veio um preselectId explícito (edição de venda), preserva a
  // seleção que a pessoa já tinha feito, contanto que ainda seja válida —
  // isso é o que evita que a atualização silenciosa em segundo plano (a
  // cada 15s) resete o que já estava escolhido no meio do preenchimento.
  // Só quando NÃO existe nenhuma seleção prévia (formulário realmente
  // "zerado") é que o campo nasce vazio, forçando uma escolha ativa.
  const keepId = preselectId || (state.selectedItemId && state.saleItems.some(i=>i.id===state.selectedItemId) ? state.selectedItemId : null);

  select.innerHTML = '';
  let items = state.saleItems.filter(i=>i.active);
  if(keepId && !items.some(i=>i.id===keepId)){
    const keepItem = state.saleItems.find(i=>i.id===keepId);
    if(keepItem) items = [...items, keepItem];
  }
  items.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));

  if(items.length === 0){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhum item cadastrado';
    select.appendChild(opt);
    state.selectedItemId = null;
    applyBillingDayVisibility(null);
    return;
  }

  if(!keepId){
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione um item...';
    select.appendChild(placeholder);
  }

  items.forEach(item=>{
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name + (!item.active ? ' (inativo)' : '');
    select.appendChild(opt);
  });

  select.value = keepId || '';
  state.selectedItemId = keepId || null;
  applyBillingDayVisibility(state.selectedItemId);
}

/** Preço sugerido do item selecionado no momento — usado para pré-preencher o valor da venda. */
export function getSelectedItemPrice(){
  const item = state.saleItems.find(i=>i.id === state.selectedItemId);
  return item ? item.price : 0;
}

// ---------- Formulário (tela de gerenciamento) ----------
function setFieldError(id, message){
  document.getElementById(id).classList.add('invalid');
  document.getElementById(id+'Error').textContent = message;
}
function clearFieldError(id){
  document.getElementById(id).classList.remove('invalid');
  document.getElementById(id+'Error').textContent = '';
}

export function resetSaleItemForm(){
  document.getElementById('siName').value = '';
  document.getElementById('siPrice').value = '';
  document.getElementById('siName').classList.remove('invalid');
  document.getElementById('siPrice').classList.remove('invalid');
  clearFieldError('siPrice');
  state.editingSaleItemId = null;
  document.getElementById('saleItemFormCard').style.display = 'none';
  document.getElementById('saleItemFormMsg').textContent = '';
}

function openSaleItemForm(mode, item){
  document.getElementById('saleItemFormCard').style.display = '';
  document.getElementById('saleItemFormMsg').textContent = '';
  if(mode === 'edit' && item){
    state.editingSaleItemId = item.id;
    document.getElementById('saleItemFormTitle').textContent = 'Editar item';
    document.getElementById('saleItemFormHint').textContent = 'Altere os dados e salve as mudanças';
    document.getElementById('siName').value = item.name || '';
    document.getElementById('siPrice').value = item.price;
    document.getElementById('saleItemSubmitBtn').textContent = 'Salvar alterações';
  } else {
    state.editingSaleItemId = null;
    document.getElementById('saleItemFormTitle').textContent = 'Novo item';
    document.getElementById('saleItemFormHint').textContent = 'Preencha o nome e o preço sugerido';
    document.getElementById('siName').value = '';
    document.getElementById('siPrice').value = '';
    document.getElementById('saleItemSubmitBtn').textContent = 'Salvar item';
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

// ---------- Renderização ----------
export function renderSaleItemsList(){
  const container = document.getElementById('saleItemsListContainer');
  if(!container) return;
  const list = [...state.saleItems].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  container.innerHTML = '';

  if(list.length === 0){
    container.innerHTML = '<div class="empty-row">Nenhum item cadastrado ainda</div>';
    return;
  }

  list.forEach(item=>{
    const row = document.createElement('div');
    row.className = 'sale-row';
    if(!item.active) row.style.opacity = '0.6';
    row.innerHTML = `
      <div class="sale-row-main">
        <div class="sale-row-name">${item.name}${!item.active ? ' <span class="pill inactive">Inativo</span>' : ''}</div>
        <div class="sale-row-meta">Preço sugerido: R$ ${fmtBRL(item.price)}</div>
      </div>
      <div class="sale-row-actions">
        <button class="toggle-active-btn" data-id="${item.id}" title="${item.active ? 'Inativar' : 'Reativar'}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2.2v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <path d="M4.6 4.3a5.3 5.3 0 1 0 6.8 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
          </svg>
        </button>
        <button class="edit-btn" data-id="${item.id}" title="Editar">✎</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const item = state.saleItems.find(i=>i.id === b.dataset.id);
      if(item) openSaleItemForm('edit', item);
    });
  });
  container.querySelectorAll('.toggle-active-btn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const item = state.saleItems.find(i=>i.id === b.dataset.id);
      if(!item) return;
      const willActivate = !item.active;
      const confirmMsg = willActivate
        ? `Reativar "${item.name}"? Ele volta a aparecer no formulário de Nova Venda.`
        : `Inativar "${item.name}"? Ele some do formulário de Nova Venda, mas o histórico de vendas continua intacto.`;
      if(confirm(confirmMsg)){
        try{
          await setSaleItemActiveAPI(item.id, willActivate);
          item.active = willActivate;
          renderSaleItemsList();
        }catch(err){
          alert(err.message);
        }
      }
    });
  });
}

export async function loadAndRenderSaleItems(){
  await fetchSaleItems();
  renderSaleItemsList();
}

// ---------- Listeners ----------
export function initSaleItemsListeners(){
  document.getElementById('btnNewSaleItem').addEventListener('click', ()=> openSaleItemForm('new'));
  document.getElementById('saleItemCancelBtn').addEventListener('click', resetSaleItemForm);

  document.getElementById('siPrice').addEventListener('blur', e=>{
    const v = e.target.value;
    const n = Number(v);
    if(v.trim() === '' || isNaN(n) || n < 0) setFieldError('siPrice', 'Informe um preço numérico válido (pode ser 0).');
    else clearFieldError('siPrice');
  });

  document.getElementById('saleItemSubmitBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('saleItemFormMsg');
    const name = document.getElementById('siName').value.trim();
    const priceRaw = document.getElementById('siPrice').value;
    const price = Number(priceRaw);
    const isEditing = !!state.editingSaleItemId;

    clearFieldError('siPrice');

    if(!name){
      msg.textContent = 'Preencha o nome do item.';
      msg.className = 'form-msg err';
      return;
    }
    if(priceRaw.trim() === '' || isNaN(price) || price < 0){
      setFieldError('siPrice', 'Informe um preço numérico válido (pode ser 0).');
      msg.textContent = 'Informe um preço numérico válido (pode ser 0, mas não pode ficar em branco).';
      msg.className = 'form-msg err';
      return;
    }

    const submitBtn = document.getElementById('saleItemSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando…';

    const itemFields = { name, price };

    try{
      if(isEditing){
        await updateSaleItemAPI(state.editingSaleItemId, itemFields);
        const idx = state.saleItems.findIndex(i=>i.id === state.editingSaleItemId);
        if(idx !== -1) state.saleItems[idx] = { ...state.saleItems[idx], ...itemFields };
      } else {
        const savedItem = await addSaleItemAPI(itemFields);
        state.saleItems.push(savedItem);
      }
      resetSaleItemForm();
      renderSaleItemsList();
    }catch(err){
      msg.textContent = err.message;
      msg.className = 'form-msg err';
      submitBtn.disabled = false;
      submitBtn.textContent = isEditing ? 'Salvar alterações' : 'Salvar item';
    }
  });
}
