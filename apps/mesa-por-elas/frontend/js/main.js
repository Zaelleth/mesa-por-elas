// Ponto de entrada do app Mesa por Elas.
// Importa e conecta todos os módulos; não contém lógica de negócio própria.

import { state } from './state.js';
import { attemptLogin, logout } from './auth.js';
import { loadData, startAutoRefresh } from './modules/eventos/sales-data.js';
import { renderDashboard, renderRecent, initDashboardListeners } from './modules/eventos/dashboard.js';
import { renderVendasList, initVendasListeners } from './modules/eventos/vendas-list.js';
import { initSalesFormListeners, resetForm } from './modules/eventos/sales-form.js';
// import { initClubDashboard } from './modules/club/dashboard.js';
// import { initClubSubscribers } from './modules/club/subscribers.js';

// ---------- Login ----------
document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const msg = document.getElementById('loginMsg');
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  if(!username || !password){
    msg.textContent = 'Preencha usuário e senha.';
    return;
  }
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando…';
  try{
    const result = await attemptLogin(username, password);
    if(result.ok){
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = '';
      document.getElementById('loadingMsg').style.display = '';
      await loadData();
      document.getElementById('loadingMsg').style.display = 'none';
      renderDashboard();
      renderRecent();
      renderVendasList();
      startAutoRefresh(()=>{
        renderRecent();
        if(document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
        if(document.getElementById('view-vendas').classList.contains('active')) renderVendasList();
      });
    } else {
      msg.textContent = result.error;
    }
  }catch(e){
    msg.textContent = 'Não foi possível conectar. Verifique sua internet e a URL da API.';
  }finally{
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';
  }
});

// ---------- Logout ----------
document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await logout();
  document.getElementById('loginForm').reset();
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('sellerGroup').style.pointerEvents = '';
  document.getElementById('sellerGroup').style.opacity = '';
});

// ---------- Navegação entre abas ----------
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const previousBtn = document.querySelector('nav.tabs button.active');
    const leavingTab = previousBtn ? previousBtn.dataset.tab : null;

    // Se a pessoa estava na tela de Nova Venda (registrando ou editando) e
    // clicou em outra aba sem enviar o formulário, descartamos o rascunho.
    // Isso evita que, ao voltar depois, ela caia de novo numa edição antiga
    // "presa" na tela, achando que ainda está mexendo naquela venda.
    if(leavingTab === 'venda' && btn.dataset.tab !== 'venda'){
      resetForm();
      document.getElementById('formMsg').textContent = '';
    }

    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+btn.dataset.tab).classList.add('active');
    document.getElementById('pageTitle').textContent = btn.dataset.label || btn.textContent.trim();
    if(btn.dataset.tab==='dashboard') renderDashboard();
    if(btn.dataset.tab==='vendas') renderVendasList();
  });
});

// ---------- Inicialização ----------
initDashboardListeners();
initVendasListeners();
initSalesFormListeners();

// Subtítulo do topo mostra sempre a data de hoje (formatada por extenso).
const todayLabel = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
});
document.getElementById('pageSub').textContent = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

// Não há pré-carregamento de dados aqui: como toda leitura exige uma sessão
// válida, os dados só são buscados depois de um login bem-sucedido (acima).
document.getElementById('loadingMsg').style.display = 'none';
