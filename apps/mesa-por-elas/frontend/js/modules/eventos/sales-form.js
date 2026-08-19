// Módulo Eventos — formulário de registrar/editar venda.
// Nota sobre import circular: este arquivo importa renderDashboard/renderRecent
// de dashboard.js, que por sua vez importa startEdit daqui. Isso é seguro em
// módulos ES porque nenhuma das duas pontas usa o import no topo do arquivo —
// só dentro de funções, que só rodam depois que ambos os módulos já terminaram
// de ser avaliados (ex: clique num botão, envio do formulário).

import { state } from '../../state.js';
import { fmtBRL, selectChoice, pixPortion, cardPortion, isValidEmail, isValidCPF } from '../../utils.js';
import { addSaleAPI, updateSaleAPI } from './sales-data.js';
import { populateSellerGroup } from '../../auth.js';

function toggleSplitPaymentBlocks(isSplit){
  document.getElementById('singlePaymentBlock').style.display = isSplit ? 'none' : '';
  document.getElementById('splitPaymentBlock').style.display = isSplit ? '' : 'none';
}

function updateSplitTotalLabel(){
  const pix = parseFloat(document.getElementById('fPixAmount').value) || 0;
  const card = parseFloat(document.getElementById('fCardAmount').value) || 0;
  document.getElementById('splitTotalLabel').textContent = 'R$ ' + fmtBRL(pix + card);
}

/** Marca um campo como inválido: borda vermelha + mensagem explicativa embaixo. */
function setFieldError(id, message){
  document.getElementById(id).classList.add('invalid');
  document.getElementById(id+'Error').textContent = message;
}
/** Remove a marcação de erro (borda + mensagem) de um campo. */
function clearFieldError(id){
  document.getElementById(id).classList.remove('invalid');
  document.getElementById(id+'Error').textContent = '';
}

/**
 * Procura, entre as vendas já registradas, alguma com o mesmo CPF, telefone
 * ou e-mail informado — mas de um nome diferente. Se achar, é sinal de que
 * esse contato já pertence a outra cliente cadastrada, então o registro
 * deve ser bloqueado (evita duas pessoas "roubando" o cadastro uma da
 * outra, seja por erro de digitação ou má-fé).
 * `excludeId` evita que uma venda em edição seja comparada consigo mesma.
 */
function findIdentityConflict(name, cpf, phone, email, excludeId){
  const normalizedName = name.trim().toLowerCase();
  const normalizedEmail = email ? email.trim().toLowerCase() : '';
  const match = state.sales.find(s=>{
    if(excludeId && s.id === excludeId) return false;
    const cpfMatch = cpf && s.cpf && s.cpf === cpf;
    const phoneMatch = phone && s.phone && s.phone === phone;
    const emailMatch = normalizedEmail && s.email && s.email.trim().toLowerCase() === normalizedEmail;
    return cpfMatch || phoneMatch || emailMatch;
  });
  if(match && match.name.trim().toLowerCase() !== normalizedName){
    return match;
  }
  return null;
}

/**
 * Busca a venda mais recente com esse nome exato (sem diferenciar
 * maiúsculas/acentuação de caixa) e devolve telefone/CPF/e-mail dela, para
 * autopreencher o formulário quando a cliente já é conhecida.
 */
function findLatestSaleByName(name, excludeId){
  const normalizedName = name.trim().toLowerCase();
  if(!normalizedName) return null;
  const matches = state.sales.filter(s=>{
    if(excludeId && s.id === excludeId) return false;
    return s.name && s.name.trim().toLowerCase() === normalizedName;
  });
  if(matches.length === 0) return null;
  matches.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  return matches[0];
}

export function startEdit(id){
  const sale = state.sales.find(s=>s.id===id);
  if(!sale) return;
  state.editingId = id;
  document.getElementById('fName').value = sale.name;
  document.getElementById('fPhone').value = sale.phone;
  document.getElementById('fCpf').value = sale.cpf;
  document.getElementById('fEmail').value = sale.email;
  populateSellerGroup(sale.seller);

  if(sale.payment === 'misto'){
    document.getElementById('fSplitPayment').checked = true;
    toggleSplitPaymentBlocks(true);
    document.getElementById('fPixAmount').value = pixPortion(sale);
    document.getElementById('fCardAmount').value = cardPortion(sale);
    updateSplitTotalLabel();
    state.selectedCardType = sale.cardType || 'debito';
    selectChoice('cardTypeGroup', state.selectedCardType);
    state.selectedPayment = null;
  } else {
    document.getElementById('fSplitPayment').checked = false;
    toggleSplitPaymentBlocks(false);
    document.getElementById('fAmount').value = sale.amount;
    state.selectedPayment = sale.payment;
    selectChoice('paymentGroup', sale.payment);
  }

  document.getElementById('formTitle').textContent = 'Editar venda';
  document.getElementById('formHint').textContent = 'Altere os dados e salve as mudanças';
  document.getElementById('submitBtn').textContent = 'Salvar alterações';
  document.getElementById('cancelEditBtn').style.display = 'block';

  document.querySelector('nav.tabs button[data-tab="venda"]').click();
  window.scrollTo({top:0, behavior:'smooth'});
}

export function resetForm(){
  ['fName','fPhone','fCpf','fEmail','fAmount','fPixAmount','fCardAmount'].forEach(id=>{
    document.getElementById(id).value='';
    document.getElementById(id).classList.remove('invalid');
  });
  clearFieldError('fCpf');
  clearFieldError('fEmail');
  document.querySelectorAll('.choice-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('fSplitPayment').checked = false;
  toggleSplitPaymentBlocks(false);
  updateSplitTotalLabel();
  state.selectedPayment = null; state.selectedCardType = null; state.editingId = null;
  document.getElementById('formTitle').textContent = 'Registrar venda';
  document.getElementById('formHint').textContent = 'Preencha os dados da cliente e da venda';
  document.getElementById('submitBtn').textContent = 'Registrar venda';
  document.getElementById('cancelEditBtn').style.display = 'none';
  populateSellerGroup();
}

/** Liga todos os listeners do formulário de venda (máscaras, escolhas, envio). */
export function initSalesFormListeners(){
  document.getElementById('cancelEditBtn').addEventListener('click', ()=>{
    resetForm();
    document.getElementById('formMsg').textContent = '';
  });

  document.getElementById('paymentGroup').addEventListener('click', e=>{
    const btn = e.target.closest('.choice-btn');
    if(!btn) return;
    document.querySelectorAll('#paymentGroup .choice-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedPayment = btn.dataset.val;
  });
  document.getElementById('sellerSelect').addEventListener('change', e=>{
    state.selectedSeller = e.target.value;
  });

  // Autopreenchimento: ao terminar de digitar o nome completo (perder o
  // foco do campo), busca a venda mais recente com esse nome e preenche
  // telefone/CPF/e-mail automaticamente, caso a cliente já seja conhecida.
  document.getElementById('fName').addEventListener('blur', e=>{
    const typedName = e.target.value.trim();
    if(!typedName) return;
    const found = findLatestSaleByName(typedName, state.editingId);
    if(found){
      document.getElementById('fPhone').value = found.phone || '';
      document.getElementById('fCpf').value = found.cpf || '';
      document.getElementById('fEmail').value = found.email || '';
    }
  });

  // Máscara de CPF
  document.getElementById('fCpf').addEventListener('input', e=>{
    let v = e.target.value.replace(/\D/g,'').slice(0,11);
    v = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
    e.target.value = v;
  });
  // Máscara de telefone
  document.getElementById('fPhone').addEventListener('input', e=>{
    let v = e.target.value.replace(/\D/g,'').slice(0,11);
    if(v.length>10) v = v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
    else if(v.length>6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
    else if(v.length>2) v = v.replace(/(\d{2})(\d{0,5})/,'($1) $2');
    e.target.value = v;
  });

  // Força e-mail em minúsculo em tempo real (independe de Caps Lock) —
  // evita duplicidade de cadastro por diferença só de caixa (ex:
  // "Maria@Email.com" vs "maria@email.com" tratados como pessoas
  // diferentes na checagem de identidade) e mantém o banco mais limpo.
  document.getElementById('fEmail').addEventListener('input', e=>{
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    e.target.value = e.target.value.toLowerCase();
    e.target.setSelectionRange(start, end);
  });

  // Feedback visual (borda vermelha) ao sair do campo, se o valor digitado
  // não for válido. E-mail é opcional, então só marca erro se algo foi
  // digitado e está no formato errado — campo vazio não é erro.
  document.getElementById('fEmail').addEventListener('blur', e=>{
    const v = e.target.value.trim();
    if(v.length > 0 && !isValidEmail(v)) setFieldError('fEmail', 'E-mail inválido. Confira o endereço digitado.');
    else clearFieldError('fEmail');
  });
  document.getElementById('fCpf').addEventListener('blur', e=>{
    const v = e.target.value.trim();
    if(v.length > 0 && !isValidCPF(v)) setFieldError('fCpf', 'CPF inválido. Confira os números digitados.');
    else clearFieldError('fCpf');
  });

  document.getElementById('fSplitPayment').addEventListener('change', e=>{
    toggleSplitPaymentBlocks(e.target.checked);
  });
  document.getElementById('fPixAmount').addEventListener('input', updateSplitTotalLabel);
  document.getElementById('fCardAmount').addEventListener('input', updateSplitTotalLabel);
  document.getElementById('cardTypeGroup').addEventListener('click', e=>{
    const btn = e.target.closest('.choice-btn');
    if(!btn) return;
    document.querySelectorAll('#cardTypeGroup .choice-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedCardType = btn.dataset.val;
  });

  document.getElementById('submitBtn').addEventListener('click', async ()=>{
    // Importado aqui dentro (não no topo do arquivo) para não criar um
    // segundo ciclo de import — dashboard.js já importa este arquivo.
    const { renderDashboard, renderRecent } = await import('./dashboard.js');

    const name = document.getElementById('fName').value.trim();
    const phone = document.getElementById('fPhone').value.trim();
    const cpf = document.getElementById('fCpf').value.trim();
    const email = document.getElementById('fEmail').value.trim();
    const msg = document.getElementById('formMsg');
    const isSplit = document.getElementById('fSplitPayment').checked;

    clearFieldError('fCpf');
    clearFieldError('fEmail');

    if(!name || !phone || !cpf || !state.selectedSeller){
      msg.textContent = 'Preencha nome completo, telefone, CPF e vendedora.';
      msg.className = 'form-msg err';
      return;
    }

    if(!isValidCPF(cpf)){
      setFieldError('fCpf', 'CPF inválido. Confira os números digitados.');
      msg.textContent = 'CPF inválido. Confira os números digitados.';
      msg.className = 'form-msg err';
      return;
    }

    if(email && !isValidEmail(email)){
      setFieldError('fEmail', 'E-mail inválido. Confira o endereço digitado.');
      msg.textContent = 'E-mail inválido. Confira o endereço digitado.';
      msg.className = 'form-msg err';
      return;
    }

    const identityConflict = findIdentityConflict(name, cpf, phone, email, state.editingId);
    if(identityConflict){
      msg.textContent = 'Esse cpf, telefone ou email já está cadastrado no nome de outra pessoa.';
      msg.className = 'form-msg err';
      return;
    }

    let amount, payment, cardType, pixAmount, cardAmount;

    if(isSplit){
      pixAmount = parseFloat(document.getElementById('fPixAmount').value) || 0;
      cardAmount = parseFloat(document.getElementById('fCardAmount').value) || 0;
      amount = pixAmount + cardAmount;
      if(pixAmount <= 0 || cardAmount <= 0 || !state.selectedCardType){
        msg.textContent = 'Para pagamento dividido, informe os dois valores (maiores que zero) e o tipo do cartão.';
        msg.className = 'form-msg err';
        return;
      }
      payment = 'misto';
      cardType = state.selectedCardType;
    } else {
      amount = parseFloat(document.getElementById('fAmount').value);
      if(!amount || amount<=0 || !state.selectedPayment){
        msg.textContent = 'Preencha o valor e a forma de pagamento.';
        msg.className = 'form-msg err';
        return;
      }
      payment = state.selectedPayment;
      cardType = (payment === 'debito' || payment === 'credito') ? payment : null;
      pixAmount = payment === 'pix' ? amount : 0;
      cardAmount = payment === 'pix' ? 0 : amount;
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando…';

    const saleFields = { name, phone, cpf, email, amount, payment, cardType, pixAmount, cardAmount, seller: state.selectedSeller };

    if(state.editingId){
      try{
        await updateSaleAPI(state.editingId, saleFields);
        const idx = state.sales.findIndex(s=>s.id===state.editingId);
        if(idx !== -1) state.sales[idx] = { ...state.sales[idx], ...saleFields };
      }catch(err){
        msg.textContent = 'Não foi possível salvar. Verifique sua conexão e tente novamente.';
        msg.className = 'form-msg err';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar alterações';
        return;
      }
      msg.textContent = 'Alterações salvas com sucesso!';
      msg.className = 'form-msg ok';
      submitBtn.disabled = false;
      resetForm();
      renderRecent();
      renderDashboard();
      setTimeout(()=>{ msg.textContent=''; }, 3000);
      return;
    }

    try{
      const savedSale = await addSaleAPI(saleFields);
      state.sales.push(savedSale);
    }catch(err){
      msg.textContent = 'Não foi possível registrar. Verifique sua conexão e tente novamente.';
      msg.className = 'form-msg err';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar venda';
      return;
    }

    msg.textContent = 'Venda registrada com sucesso!';
    msg.className = 'form-msg ok';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar venda';

    resetForm();
    renderRecent();
    setTimeout(()=>{ msg.textContent=''; }, 3000);
  });
}
