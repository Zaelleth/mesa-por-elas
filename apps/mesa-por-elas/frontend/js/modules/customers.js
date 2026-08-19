// Módulo Clientes — cadastro de clientes, visível para todos os papéis
// (admin, gestor e vendedora) com as mesmas funcionalidades liberadas.
//
// Não existe exclusão de cliente pelo app — só criação e edição. Excluir um
// cliente (se algum dia for realmente necessário) é uma operação manual
// direto na planilha, fora do sistema, justamente para não correr o risco
// de apagar sem querer o histórico de compras de alguém.

import { state } from '../state.js';
import { fmtBRL, maskCpf, maskPhone, isValidEmail, isValidCPF, paymentLabel, paymentPillClass } from '../utils.js';
import { apiGet, apiPost } from '../api.js';
import { openModal, closeModal } from '../modal.js';

const SORT_FIELDS = [
  { key: 'created_at', label: 'Data de registro' },
  { key: 'name', label: 'Nome' },
  { key: 'purchases', label: 'Quantidade de compras' },
  { key: 'club', label: 'Club' }
];

function cpfDigits(cpf){ return String(cpf || '').replace(/\D/g,''); }

/** Quantas vendas essa cliente já tem — usado tanto na ordenação quanto no card de detalhe. */
function purchaseCount(customer){
  return state.sales.filter(s => s.cpf && cpfDigits(s.cpf) === cpfDigits(customer.cpf)).length;
}

function compareBy(field){
  switch(field){
    case 'created_at':
      return (a,b)=> new Date(a.createdAt) - new Date(b.createdAt);
    case 'name':
      return (a,b)=> a.name.localeCompare(b.name, 'pt-BR');
    case 'purchases':
      return (a,b)=> purchaseCount(a) - purchaseCount(b);
    case 'club':
      return (a,b)=> (a.club?1:0) - (b.club?1:0);
    default:
      return ()=>0;
  }
}

// ---------- Comunicação com o backend ----------
export async function fetchCustomers(){
  try{
    const res = await apiGet('getCustomers');
    state.customers = (res && res.ok && res.customers) ? res.customers : [];
  }catch(e){ state.customers = []; }
}

async function addCustomerAPI(customer){
  const res = await apiPost('addCustomer', { customer });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao criar o cliente.');
  return res.customer;
}
async function updateCustomerAPI(id, customer){
  const res = await apiPost('updateCustomer', { id, customer });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao salvar as alterações.');
}

// ---------- Formulário ----------
function setFieldError(id, message){
  document.getElementById(id).classList.add('invalid');
  document.getElementById(id+'Error').textContent = message;
}
function clearFieldError(id){
  document.getElementById(id).classList.remove('invalid');
  document.getElementById(id+'Error').textContent = '';
}

export function resetCustomerForm(){
  ['cName','cPhone','cCpf','cEmail'].forEach(id=>{
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('invalid');
  });
  document.getElementById('cClub').checked = false;
  clearFieldError('cCpf');
  clearFieldError('cEmail');
  state.editingCustomerId = null;
  document.getElementById('customerFormCard').style.display = 'none';
  document.getElementById('customerFormMsg').textContent = '';
}

function openCustomerForm(mode, customer){
  document.getElementById('customerFormCard').style.display = '';
  document.getElementById('customerFormMsg').textContent = '';
  if(mode === 'edit' && customer){
    state.editingCustomerId = customer.id;
    document.getElementById('customerFormTitle').textContent = 'Editar cliente';
    document.getElementById('customerFormHint').textContent = 'Altere os dados e salve as mudanças';
    document.getElementById('cName').value = customer.name || '';
    document.getElementById('cPhone').value = customer.phone || '';
    document.getElementById('cCpf').value = customer.cpf || '';
    document.getElementById('cEmail').value = customer.email || '';
    document.getElementById('cClub').checked = !!customer.club;
    document.getElementById('customerSubmitBtn').textContent = 'Salvar alterações';
  } else {
    state.editingCustomerId = null;
    document.getElementById('customerFormTitle').textContent = 'Novo cliente';
    document.getElementById('customerFormHint').textContent = 'Preencha os dados de contato';
    document.getElementById('cName').value = '';
    document.getElementById('cPhone').value = '';
    document.getElementById('cCpf').value = '';
    document.getElementById('cEmail').value = '';
    document.getElementById('cClub').checked = false;
    document.getElementById('customerSubmitBtn').textContent = 'Salvar cliente';
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

// ---------- Visão expandida (modal com histórico de compras) ----------
function openCustomerDetail(customer){
  const digits = c => String(c || '').replace(/\D/g,'');
  const sales = state.sales
    .filter(s => s.cpf && digits(s.cpf) === digits(customer.cpf))
    .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));

  const totalSpent = sales.reduce((a,s)=>a+s.amount,0);

  const salesHtml = sales.length === 0
    ? '<div class="empty-row">Nenhuma venda registrada para esse cliente ainda</div>'
    : sales.map(s=>{
        const d = new Date(s.timestamp);
        const dateStr = d.toLocaleDateString('pt-BR');
        return `
          <div class="sale-row">
            <div class="sale-row-main">
              <div class="sale-row-name">${dateStr}</div>
              <div class="sale-row-meta">
                ${s.sellerName} &middot; <span class="pill ${paymentPillClass(s)}">${paymentLabel(s)}</span>
              </div>
            </div>
            <div class="sale-row-amount">R$ ${fmtBRL(s.amount)}</div>
          </div>`;
      }).join('');

  openModal(`
    <h3>${customer.name}${customer.club ? ' <span class="pill club">★ Club</span>' : ''}</h3>
    <div class="modal-message">
      CPF: ${customer.cpf} &middot; Telefone: ${customer.phone}${customer.email ? ' &middot; ' + customer.email : ''}
    </div>
    <div class="stat-card gold" style="margin-bottom:20px;">
      <div class="label">Total gasto</div>
      <div class="amount">R$ ${fmtBRL(totalSpent)}</div>
      <div class="sub">${sales.length} ${sales.length===1?'venda':'vendas'}</div>
    </div>
    <h3 style="font-size:14px;margin-bottom:10px;">Histórico de vendas</h3>
    <div class="sales-list">${salesHtml}</div>
    <div class="modal-actions" style="margin-top:20px;">
      <button class="btn-outline" id="detailCloseBtn" style="width:auto;">Fechar</button>
      <button class="submit-btn" id="detailEditBtn" style="width:auto;">Editar cliente</button>
    </div>
  `);

  document.getElementById('detailCloseBtn').addEventListener('click', closeModal);
  document.getElementById('detailEditBtn').addEventListener('click', ()=>{
    closeModal();
    openCustomerForm('edit', customer);
  });
}

// ---------- Renderização ----------
function updateCustomerSortTrigger(){
  const fieldMeta = SORT_FIELDS.find(f=>f.key===state.customersSort.field);
  const arrow = state.customersSort.dir === 'desc' ? '↓' : '↑';
  document.getElementById('customerSortLabel').textContent = `${fieldMeta.label} ${arrow}`;
  document.querySelectorAll('#customerSortMenu .sort-option').forEach(btn=>{
    const isActive = btn.dataset.field === state.customersSort.field;
    btn.classList.toggle('active', isActive);
    btn.querySelector('.dir-arrow').textContent = isActive ? arrow : '';
  });
  document.getElementById('btnClubOnly').classList.toggle('toggled', state.customersClubOnly);
}

export function renderCustomersList(){
  const container = document.getElementById('customersListContainer');
  if(!container) return;

  let list = [...state.customers];
  if(state.customersClubOnly) list = list.filter(c=>c.club);
  list.sort(compareBy(state.customersSort.field));
  if(state.customersSort.dir === 'desc') list.reverse();

  container.innerHTML = '';

  if(list.length === 0){
    container.innerHTML = `<div class="empty-row">${state.customersClubOnly ? 'Nenhum cliente do Club ainda' : 'Nenhum cliente cadastrado ainda'}</div>`;
    updateCustomerSortTrigger();
    return;
  }

  list.forEach(c=>{
    const row = document.createElement('div');
    row.className = 'sale-row';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <div class="sale-row-main">
        <div class="sale-row-name">${c.name}${c.club ? ' <span class="pill club">★ Club</span>' : ''}</div>
        <div class="sale-row-meta">
          CPF: ${c.cpf} &middot; ${c.phone}${c.email ? ' &middot; ' + c.email : ''}
        </div>
      </div>
      <div class="sale-row-actions">
        <button class="edit-btn" data-id="${c.id}" title="Editar">✎</button>
      </div>
    `;
    // Clicar no card (fora dos botões) abre a visão expandida.
    row.addEventListener('click', e=>{
      if(e.target.closest('button')) return;
      openCustomerDetail(c);
    });
    container.appendChild(row);
  });

  container.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', e=>{
      e.stopPropagation();
      const customer = state.customers.find(c=>c.id === b.dataset.id);
      if(customer) openCustomerForm('edit', customer);
    });
  });

  updateCustomerSortTrigger();
}

export async function loadAndRenderCustomers(){
  await fetchCustomers();
  renderCustomersList();
}

// ---------- Listeners ----------
export function initCustomersListeners(){
  document.getElementById('btnNewCustomer').addEventListener('click', ()=> openCustomerForm('new'));
  document.getElementById('customerCancelBtn').addEventListener('click', resetCustomerForm);

  // Menu de ordenação — mesmo padrão da tela Vendas.
  const sortMenu = document.getElementById('customerSortMenu');
  sortMenu.innerHTML = '';
  SORT_FIELDS.forEach(f=>{
    const btn = document.createElement('button');
    btn.className = 'sort-option';
    btn.dataset.field = f.key;
    btn.innerHTML = `<span>${f.label}</span><span class="dir-arrow"></span>`;
    sortMenu.appendChild(btn);
  });
  sortMenu.addEventListener('click', e=>{
    const btn = e.target.closest('.sort-option');
    if(!btn) return;
    const field = btn.dataset.field;
    if(state.customersSort.field === field){
      state.customersSort.dir = state.customersSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.customersSort.field = field;
      state.customersSort.dir = field === 'created_at' ? 'desc' : 'asc';
    }
    renderCustomersList();
  });
  document.getElementById('btnCustomerSortMenu').addEventListener('click', e=>{
    e.stopPropagation();
    sortMenu.classList.toggle('open');
  });
  document.addEventListener('click', ()=>{
    sortMenu.classList.remove('open');
  });

  // Filtro "Só Club"
  document.getElementById('btnClubOnly').addEventListener('click', ()=>{
    state.customersClubOnly = !state.customersClubOnly;
    renderCustomersList();
  });

  document.getElementById('cCpf').addEventListener('input', e=>{
    e.target.value = maskCpf(e.target.value);
  });
  document.getElementById('cPhone').addEventListener('input', e=>{
    e.target.value = maskPhone(e.target.value);
  });
  document.getElementById('cEmail').addEventListener('input', e=>{
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    e.target.value = e.target.value.toLowerCase();
    e.target.setSelectionRange(start, end);
  });

  document.getElementById('cEmail').addEventListener('blur', e=>{
    const v = e.target.value.trim();
    if(v.length > 0 && !isValidEmail(v)) setFieldError('cEmail', 'E-mail inválido. Confira o endereço digitado.');
    else clearFieldError('cEmail');
  });
  document.getElementById('cCpf').addEventListener('blur', e=>{
    const v = e.target.value.trim();
    if(v.length > 0 && !isValidCPF(v)) setFieldError('cCpf', 'CPF inválido. Confira os números digitados.');
    else clearFieldError('cCpf');
  });

  document.getElementById('customerSubmitBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('customerFormMsg');
    const name = document.getElementById('cName').value.trim();
    const phone = document.getElementById('cPhone').value.trim();
    const cpf = document.getElementById('cCpf').value.trim();
    const email = document.getElementById('cEmail').value.trim();
    const isEditing = !!state.editingCustomerId;

    clearFieldError('cCpf');
    clearFieldError('cEmail');

    if(!name || !phone || !cpf){
      msg.textContent = 'Preencha nome, telefone e CPF.';
      msg.className = 'form-msg err';
      return;
    }
    if(!isValidCPF(cpf)){
      setFieldError('cCpf', 'CPF inválido. Confira os números digitados.');
      msg.textContent = 'CPF inválido. Confira os números digitados.';
      msg.className = 'form-msg err';
      return;
    }
    if(email && !isValidEmail(email)){
      setFieldError('cEmail', 'E-mail inválido. Confira o endereço digitado.');
      msg.textContent = 'E-mail inválido. Confira o endereço digitado.';
      msg.className = 'form-msg err';
      return;
    }

    const submitBtn = document.getElementById('customerSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando…';

    const customerFields = { name, phone, cpf, email, club: document.getElementById('cClub').checked };

    try{
      if(isEditing){
        await updateCustomerAPI(state.editingCustomerId, customerFields);
        const idx = state.customers.findIndex(c=>c.id === state.editingCustomerId);
        if(idx !== -1) state.customers[idx] = { ...state.customers[idx], ...customerFields };
      } else {
        const savedCustomer = await addCustomerAPI(customerFields);
        state.customers.push(savedCustomer);
      }
      resetCustomerForm();
      renderCustomersList();
    }catch(err){
      msg.textContent = err.message;
      msg.className = 'form-msg err';
      submitBtn.disabled = false;
      submitBtn.textContent = isEditing ? 'Salvar alterações' : 'Salvar cliente';
    }
  });
}
