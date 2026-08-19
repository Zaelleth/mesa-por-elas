// Autenticação, sessão e controle de permissões (admin / gestor / vendedora).

import { BOOTSTRAP_TOKEN } from './config.js';
import { state } from './state.js';
import { apiGet, apiPost, onSessionExpired } from './api.js';
import { isElevatedRole } from './utils.js';

async function loginAPI(username, password){
  return apiPost('login', { username, password }, BOOTSTRAP_TOKEN);
}

export async function fetchSellers(){
  try{
    const res = await apiGet('getSellers');
    state.knownSellers = (res && res.ok && res.sellers) ? res.sellers : [];
  }catch(e){ state.knownSellers = []; }
}

/**
 * Preenche o campo de vendedora do formulário de venda.
 * - admin/gestor: mostram um <select> com todas as vendedoras cadastradas
 *   (busca fresca a cada vez que essa função roda — ver main.js, que chama
 *   isso de novo toda vez que a aba "Nova Venda" é aberta, não só no login).
 * - vendedora: o campo inteiro fica escondido, já que a venda é sempre
 *   atribuída automaticamente à própria pessoa logada.
 *
 * @param {string|null} preselect Login a manter selecionado (usado ao editar
 *   uma venda antiga) — se essa vendedora não estiver mais na lista ativa
 *   (conta excluída depois), ela ainda aparece como opção, marcada.
 */
export function populateSellerGroup(preselect){
  const wrap = document.getElementById('sellerFieldWrap');
  const select = document.getElementById('sellerSelect');
  const elevated = isElevatedRole(state.currentRole);

  if(!elevated){
    wrap.style.display = 'none';
    state.selectedSeller = state.currentUser;
    return;
  }

  wrap.style.display = '';
  select.innerHTML = '';

  let names = [...state.knownSellers];
  if(preselect && !names.includes(preselect)) names.push(preselect);
  names.sort((a,b)=>a.localeCompare(b,'pt-BR'));

  if(names.length === 0){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhuma vendedora cadastrada';
    select.appendChild(opt);
    state.selectedSeller = null;
    return;
  }

  names.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name + (!state.knownSellers.includes(name) ? ' (conta removida)' : '');
    select.appendChild(opt);
  });

  const value = preselect || (names.includes(state.selectedSeller) ? state.selectedSeller : names[0]);
  select.value = value;
  state.selectedSeller = value;
}

export function applyRolePermissions(){
  const elevated = isElevatedRole(state.currentRole); // admin ou gestor
  document.querySelector('nav.tabs button[data-tab="dashboard"]').style.display = elevated ? '' : 'none';
  document.querySelector('nav.tabs button[data-tab="usuarios"]').style.display = elevated ? '' : 'none';
  document.querySelector('nav.tabs button[data-tab="venda"]').style.display = '';
  document.getElementById('view-dashboard').classList.remove('active');
  document.getElementById('view-venda').classList.remove('active');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));

  populateSellerGroup();

  if(elevated){
    document.querySelector('nav.tabs button[data-tab="dashboard"]').classList.add('active');
    document.getElementById('view-dashboard').classList.add('active');
    document.getElementById('pageTitle').textContent = 'Dashboard';
  } else {
    document.querySelector('nav.tabs button[data-tab="venda"]').classList.add('active');
    document.getElementById('view-venda').classList.add('active');
    document.getElementById('pageTitle').textContent = 'Nova Venda';
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
