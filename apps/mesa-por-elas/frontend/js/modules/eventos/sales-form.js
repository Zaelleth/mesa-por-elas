// Módulo Eventos — formulário de registrar/editar venda.
// Nota sobre import circular: este arquivo importa renderDashboard/renderRecent
// de dashboard.js, que por sua vez importa startEdit daqui. Isso é seguro em
// módulos ES porque nenhuma das duas pontas usa o import no topo do arquivo —
// só dentro de funções, que só rodam depois que ambos os módulos já terminaram
// de ser avaliados (ex: clique num botão, envio do formulário).

import { state } from '../../state.js';
import { fmtBRL, selectChoice, pixPortion, cardPortion } from '../../utils.js';
import { addSaleAPI, updateSaleAPI } from './sales-data.js';

function toggleSplitPaymentBlocks(isSplit){
  document.getElementById('singlePaymentBlock').style.display = isSplit ? 'none' : '';
  document.getElementById('splitPaymentBlock').style.display = isSplit ? '' : 'none';
}

function updateSplitTotalLabel(){
  const pix = parseFloat(document.getElementById('fPixAmount').value) || 0;
  const card = parseFloat(document.getElementById('fCardAmount').value) || 0;
  document.getElementById('splitTotalLabel').textContent = 'R$ ' + fmtBRL(pix + card);
}

export function startEdit(id){
  const sale = state.sales.find(s=>s.id===id);
  if(!sale) return;
  state.editingId = id;
  document.getElementById('fName').value = sale.name;
  document.getElementById('fPhone').value = sale.phone;
  document.getElementById('fCpf').value = sale.cpf;
  document.getElementById('fEmail').value = sale.email;
  state.selectedSeller = sale.seller;
  selectChoice('sellerGroup', sale.seller);

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
  ['fName','fPhone','fCpf','fEmail','fAmount','fPixAmount','fCardAmount'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('.choice-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('fSplitPayment').checked = false;
  toggleSplitPaymentBlocks(false);
  updateSplitTotalLabel();
  state.selectedPayment = null; state.selectedSeller = null; state.selectedCardType = null; state.editingId = null;
  document.getElementById('formTitle').textContent = 'Registrar venda';
  document.getElementById('formHint').textContent = 'Preencha os dados da cliente e da venda';
  document.getElementById('submitBtn').textContent = 'Registrar venda';
  document.getElementById('cancelEditBtn').style.display = 'none';
  if(state.currentRole && state.currentRole !== 'admin'){
    state.selectedSeller = state.currentUser;
    selectChoice('sellerGroup', state.currentUser);
  }
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
  document.getElementById('sellerGroup').addEventListener('click', e=>{
    const btn = e.target.closest('.choice-btn');
    if(!btn) return;
    document.querySelectorAll('#sellerGroup .choice-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedSeller = btn.dataset.val;
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

    if(!name || !phone || !cpf || !email || !state.selectedSeller){
      msg.textContent = 'Preencha todos os campos, incluindo a vendedora.';
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
