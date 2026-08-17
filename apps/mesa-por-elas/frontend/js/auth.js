// Autenticação, sessão e controle de permissões (admin vs. vendedora).

import { BOOTSTRAP_TOKEN } from './config.js';
import { state } from './state.js';
import { apiGet, apiPost, onSessionExpired } from './api.js';
import { selectChoice } from './utils.js';

async function loginAPI(username, password){
  return apiPost('login', { username, password }, BOOTSTRAP_TOKEN);
}

export async function fetchSellers(){
  try{
    const res = await apiGet('getSellers');
    state.knownSellers = (res && res.ok && res.sellers) ? res.sellers : [];
  }catch(e){ state.knownSellers = []; }
}

export function populateSellerGroup(){
  const group = document.getElementById('sellerGroup');
  group.innerHTML = '';
  // Garante que a própria pessoa logada apareça como opção, mesmo se a lista
  // de vendedoras ainda não tiver sido carregada por algum motivo.
  const names = new Set(state.knownSellers);
  if(state.currentRole !== 'admin' && state.currentUser) names.add(state.currentUser);
  [...names].sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(name=>{
    const btn = document.createElement('div');
    btn.className = 'choice-btn';
    btn.dataset.val = name;
    btn.textContent = name;
    group.appendChild(btn);
  });
}

export function applyRolePermissions(){
  const isAdmin = state.currentRole === 'admin';
  document.querySelector('nav.tabs button[data-tab="dashboard"]').style.display = isAdmin ? '' : 'none';
  document.querySelector('nav.tabs button[data-tab="venda"]').style.display = '';
  document.getElementById('view-dashboard').classList.remove('active');
  document.getElementById('view-venda').classList.remove('active');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));

  populateSellerGroup();

  if(isAdmin){
    document.querySelector('nav.tabs button[data-tab="dashboard"]').classList.add('active');
    document.getElementById('view-dashboard').classList.add('active');
    document.getElementById('sellerGroup').style.pointerEvents = '';
    document.getElementById('sellerGroup').style.opacity = '';
  } else {
    document.querySelector('nav.tabs button[data-tab="venda"]').classList.add('active');
    document.getElementById('view-venda').classList.add('active');
    // Trava a escolha de vendedora na própria pessoa logada
    state.selectedSeller = state.currentUser;
    selectChoice('sellerGroup', state.currentUser);
    document.getElementById('sellerGroup').style.pointerEvents = 'none';
    document.getElementById('sellerGroup').style.opacity = '0.65';
  }
  document.getElementById('whoLabel').textContent = state.currentUser;
}

// Chamado sempre que o servidor recusa o token de sessão (ex: expirou depois
// de muitas horas sem uso, ou o script foi republicado). Devolve a pessoa
// para a tela de login sem travar o app.
function handleSessionExpired(){
  if(!state.currentRole) return; // já estava deslogado, nada a fazer
  state.sessionToken = null;
  state.currentRole = null;
  state.currentUser = null;
  if(state.autoRefreshTimer){ clearInterval(state.autoRefreshTimer); state.autoRefreshTimer = null; }
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginMsg').textContent = 'Sua sessão expirou. Faça login novamente.';
}
onSessionExpired(handleSessionExpired);

/**
 * Executa o login e, em caso de sucesso, prepara o app (busca vendedoras,
 * aplica permissões). Quem chama essa função é responsável por carregar os
 * dados de vendas e iniciar a UI pós-login (ver main.js).
 * Retorna { ok, error? }.
 */
export async function attemptLogin(username, password){
  const res = await loginAPI(username, password);
  if(res && res.ok){
    state.currentUser = res.username || username;
    state.currentRole = res.role;
    state.sessionToken = res.sessionToken;
    await fetchSellers();
    applyRolePermissions();
    return { ok: true };
  }
  const error = (res && res.error === 'Acesso não autorizado.')
    ? 'Token de acesso não confere entre o HTML e o Code.gs.'
    : (res && res.error) || 'Usuário ou senha incorretos.';
  return { ok: false, error };
}

export async function logout(){
  if(state.sessionToken){
    try{ await apiPost('logout', {}); }catch(e){ /* ignora falha de rede ao sair */ }
  }
  if(state.autoRefreshTimer){ clearInterval(state.autoRefreshTimer); state.autoRefreshTimer = null; }
  state.sessionToken = null;
  state.currentRole = null;
  state.currentUser = null;
}
