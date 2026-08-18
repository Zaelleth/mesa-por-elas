// Ponto de entrada do app Mesa por Elas.
// Importa e conecta todos os módulos; não contém lógica de negócio própria.

import { state } from './state.js';
import { attemptLogin, logout } from './auth.js';
import { loadData, startAutoRefresh } from './modules/eventos/sales-data.js';
import { renderDashboard, renderRecent, initDashboardListeners } from './modules/eventos/dashboard.js';
import { initSalesFormListeners } from './modules/eventos/sales-form.js';
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
      startAutoRefresh(()=>{
        renderRecent();
        if(document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
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
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+btn.dataset.tab).classList.add('active');
    document.getElementById('pageTitle').textContent = btn.dataset.label || btn.textContent.trim();
    if(btn.dataset.tab==='dashboard') renderDashboard();
  });
});

// ---------- Inicialização ----------
initDashboardListeners();
initSalesFormListeners();

// Não há pré-carregamento de dados aqui: como toda leitura exige uma sessão
// válida, os dados só são buscados depois de um login bem-sucedido (acima).
document.getElementById('loadingMsg').style.display = 'none';
