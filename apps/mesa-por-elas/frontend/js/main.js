// Ponto de entrada do app Mesa por Elas.
// Importa e conecta todos os módulos; não contém lógica de negócio própria.

import { state } from './state.js';
import { isElevatedRole } from './utils.js';
import { attemptLogin, logout, fetchSellers, populateSellerGroup } from './auth.js';
import { loadData, startAutoRefresh } from './modules/eventos/sales-data.js';
import { renderDashboard, renderRecent, initDashboardListeners } from './modules/eventos/dashboard.js';
import { renderVendasList, initVendasListeners } from './modules/eventos/vendas-list.js';
import { initSalesFormListeners, resetForm } from './modules/eventos/sales-form.js';
import { loadAndRenderUsers, initUsersListeners, resetUserForm, fetchUsers, renderUsersList } from './modules/users.js';
import { fetchCustomers, loadAndRenderCustomers, initCustomersListeners, resetCustomerForm, renderCustomersList } from './modules/customers.js';
import { fetchSaleItems, populateItemSelect, loadAndRenderSaleItems, initSaleItemsListeners, resetSaleItemForm, renderSaleItemsList } from './modules/saleitems.js';
import { renderClubDashboard, renderClubAssinantes, initClubListeners, fetchClubSubscriptions } from './modules/club.js';
import { fetchClubPayments, loadAndRenderClubPayments, initClubPaymentsListeners, renderClubPayments } from './modules/club-payments.js';
import { fetchClubEvents, loadAndRenderClubEvents, initClubEventsListeners, resetClubEventForm, renderClubEventsList } from './modules/club-events.js';
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
      await fetchCustomers();
      await fetchSaleItems();
      await fetchClubSubscriptions();
      await fetchClubPayments();
      populateItemSelect();
      document.getElementById('loadingMsg').style.display = 'none';
      renderRecent();

      // Se a pessoa abriu um link direto (ex: mesaporelas.../#clientes) ou
      // voltou de uma sessão anterior com um hash na URL, respeita essa
      // aba. Senão, cai no padrão do papel (Dashboard pra admin/gestor,
      // Nova Venda pra vendedora). activateTab() já protege contra hash
      // inválido ou de uma aba sem permissão pro papel da pessoa.
      const initialTab = getTabFromHash() || (isElevatedRole(state.currentRole) ? 'dashboard' : 'venda');
      await activateTab(initialTab);
      setTabHashSilently(document.querySelector('nav.tabs button.active').dataset.tab);

      startAutoRefresh(async ()=>{
        renderRecent();
        if(document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
        if(document.getElementById('view-vendas').classList.contains('active')) renderVendasList();

        // Mantém os dropdowns/listas sempre frescos em segundo plano — não
        // só ao trocar de aba. Isso evita que duas pessoas usando o
        // sistema ao mesmo tempo vejam dado desatualizado por minutos.
        //
        // populateItemSelect()/populateSellerGroup() são seguros de rodar
        // mesmo com a aba escondida: os elementos <select> continuam
        // existindo no DOM (só ficam com display:none via CSS), e as duas
        // funções preservam a seleção atual se ela ainda for válida — não
        // há "piscar" porque isso é uma troca de innerHTML dentro de um
        // elemento que já não está sendo redesenhado na tela naquele momento.
        await fetchSaleItems();
        populateItemSelect();
        if(document.getElementById('view-itens').classList.contains('active')) renderSaleItemsList();

        await fetchCustomers();
        if(document.getElementById('view-clientes').classList.contains('active')) renderCustomersList();

        // Dados do Club também entram na atualização silenciosa em segundo
        // plano — mesmo princípio: duas pessoas gerenciando o Club ao
        // mesmo tempo (ex: uma cancelando uma assinatura, outra vendo o
        // dashboard) devem ver o reflexo sem precisar trocar de aba.
        await fetchClubSubscriptions();
        await fetchClubPayments();
        if(document.getElementById('view-club-dashboard').classList.contains('active')) renderClubDashboard();
        if(document.getElementById('view-club-assinantes').classList.contains('active')) renderClubAssinantes();
        if(document.getElementById('view-club-pagamentos').classList.contains('active')) renderClubPayments();
        if(document.getElementById('view-club-eventos').classList.contains('active')){
          await fetchClubEvents();
          renderClubEventsList();
        }

        if(isElevatedRole(state.currentRole)){
          await fetchSellers();
          populateSellerGroup();
          await fetchUsers();
          if(document.getElementById('view-usuarios').classList.contains('active')) renderUsersList();
        }
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
  history.replaceState(null, '', location.pathname + location.search);
});

// ---------- Navegação entre abas (URL própria via hash, ex: #vendas) ----------
// Por que hash (#vendas) em vez de caminho de verdade (/vendas): o site é
// hospedado como arquivo estático (GitHub Pages). Com hash, o servidor
// sempre entrega o mesmo index.html não importa a URL, e quem decide a
// "rota" é o JavaScript — então atualizar a página, abrir um link direto ou
// usar o botão voltar/avançar do navegador funciona sem nenhuma configuração
// especial no servidor (com /vendas de verdade, isso exigiria um truque de
// 404.html, e teria risco de quebrar se mal configurado).

function getTabFromHash(){
  return (location.hash || '').replace('#','') || null;
}

/** Deixa a URL refletindo a aba certa SEM criar uma entrada nova no histórico e sem disparar 'hashchange' (usado só na primeira ativação, logo após o login). */
function setTabHashSilently(tabKey){
  const newUrl = location.pathname + location.search + '#' + tabKey;
  history.replaceState(null, '', newUrl);
}

/**
 * Única função responsável por "isso é a aba ativa agora" — troca classes,
 * mostra/esconde views, descarta rascunhos de formulário ao sair de uma
 * aba, e carrega os dados daquela tela. Não mexe na URL: quem decide o hash
 * é sempre o chamador (clique do menu ou o listener de 'hashchange').
 */
const CLUB_TABS = ['club-dashboard', 'club-assinantes', 'club-pagamentos', 'club-eventos'];

async function activateTab(tabKey){
  const inClubMode = CLUB_TABS.includes(tabKey);
  const mainNav = document.querySelector('aside.sidebar > nav.tabs:not(#clubTabs)');
  const clubNav = document.getElementById('clubTabs');
  const activeNav = inClubMode ? clubNav : mainNav;

  let targetBtn = activeNav.querySelector(`button[data-tab="${tabKey}"]`);
  // Aba inexistente, ou escondida pro papel atual (ex: vendedora abrindo
  // #usuarios direto pela URL) — cai pro padrão do papel, em vez de quebrar.
  if(!targetBtn || targetBtn.style.display === 'none'){
    tabKey = isElevatedRole(state.currentRole) ? 'dashboard' : 'venda';
    targetBtn = mainNav.querySelector(`button[data-tab="${tabKey}"]`);
  }

  const previousBtn = document.querySelector('nav.tabs button.active');
  const leavingTab = previousBtn ? previousBtn.dataset.tab : null;

  // Se a pessoa estava na tela de Nova Venda (registrando ou editando) e
  // saiu sem enviar o formulário, descartamos o rascunho. Isso evita que,
  // ao voltar depois, ela caia de novo numa edição antiga "presa" na tela.
  if(leavingTab === 'venda' && leavingTab !== tabKey){
    resetForm();
    document.getElementById('formMsg').textContent = '';
  }
  // Mesma lógica de segurança aplicada aos outros formulários de gestão.
  if(leavingTab === 'usuarios' && leavingTab !== tabKey){
    resetUserForm();
  }
  if(leavingTab === 'clientes' && leavingTab !== tabKey){
    resetCustomerForm();
  }
  if(leavingTab === 'itens' && leavingTab !== tabKey){
    resetSaleItemForm();
  }
  if(leavingTab === 'club-eventos' && leavingTab !== tabKey){
    resetClubEventForm();
  }

  // Troca o "modo" visual do app inteiro: menu lateral e paleta de cores.
  // Isso acontece toda vez que activateTab roda — não só ao clicar em
  // "Club"/"Voltar" — então funciona igual não importa como a pessoa chegou
  // ali (clique, link direto, botão voltar/avançar do navegador).
  document.body.classList.toggle('club-mode', inClubMode);
  mainNav.style.display = inClubMode ? 'none' : '';
  clubNav.style.display = inClubMode ? '' : 'none';

  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
  targetBtn.classList.add('active');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+tabKey).classList.add('active');
  document.getElementById('pageTitle').textContent = targetBtn.dataset.label || targetBtn.textContent.trim();

  if(tabKey==='dashboard') renderDashboard();
  if(tabKey==='vendas') renderVendasList();
  if(tabKey==='usuarios') loadAndRenderUsers();
  if(tabKey==='clientes') loadAndRenderCustomers();
  if(tabKey==='itens') loadAndRenderSaleItems();
  if(tabKey==='club-dashboard') renderClubDashboard();
  if(tabKey==='club-assinantes') renderClubAssinantes();
  if(tabKey==='club-pagamentos') loadAndRenderClubPayments();
  if(tabKey==='club-eventos') loadAndRenderClubEvents();
  if(tabKey==='venda' && isElevatedRole(state.currentRole)){
    // Busca a lista de vendedoras fresca a cada entrada nessa aba — se um
    // admin/gestor acabou de cadastrar ou remover alguém em "Usuários",
    // o dropdown reflete isso na hora, sem precisar deslogar e logar de novo.
    await fetchSellers();
    populateSellerGroup();
  }
}

document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    // Só troca o hash — quem efetivamente ativa a aba é o listener de
    // 'hashchange' abaixo. Isso garante uma única fonte de verdade pra
    // troca de aba, não importa se ela veio de um clique no menu, do botão
    // voltar/avançar do navegador, ou de alguém abrindo um link direto
    // (ex: mesaporelas.../#clientes).
    if(getTabFromHash() !== btn.dataset.tab){
      location.hash = btn.dataset.tab;
    }
  });
});

window.addEventListener('hashchange', ()=>{
  if(document.getElementById('mainApp').style.display === 'none') return; // ainda não logado — hash é aplicado depois do login
  const tabKey = getTabFromHash();
  if(tabKey) activateTab(tabKey);
});

// ---------- Inicialização ----------
initDashboardListeners();
initVendasListeners();
initSalesFormListeners();
initUsersListeners();
initCustomersListeners();
initSaleItemsListeners();
initClubListeners();
initClubPaymentsListeners();
initClubEventsListeners();

// Subtítulo do topo mostra sempre a data de hoje (formatada por extenso).
const todayLabel = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
});
document.getElementById('pageSub').textContent = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

// Não há pré-carregamento de dados aqui: como toda leitura exige uma sessão
// válida, os dados só são buscados depois de um login bem-sucedido (acima).
document.getElementById('loadingMsg').style.display = 'none';
