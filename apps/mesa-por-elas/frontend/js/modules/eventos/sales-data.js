// Módulo Eventos — comunicação de dados (vendas e meta) com o backend.

import { AUTO_REFRESH_MS } from '../../config.js';
import { state } from '../../state.js';
import { apiGet, apiPost } from '../../api.js';

export async function loadData(){
  try{
    const data = await apiGet('getSales');
    state.sales = (data && data.ok && data.sales) ? data.sales : [];
  }catch(e){ state.sales = []; }
  try{
    const cfg = await apiGet('getConfig');
    if(cfg && cfg.ok && cfg.goal) state.goalValue = cfg.goal;
  }catch(e){ /* mantém valor padrão */ }
  updateSyncLabel();
}

// Busca só as vendas mais recentes do servidor (usado no polling e após cada escrita)
export async function refreshSales(){
  try{
    const data = await apiGet('getSales');
    if(data && data.ok) state.sales = data.sales;
    updateSyncLabel();
  }catch(e){ /* falha momentânea: mantém os dados que já estão na tela */ }
}

export function updateSyncLabel(){
  const el = document.getElementById('syncLabel');
  if(!el) return;
  const now = new Date();
  el.textContent = 'Atualizado às ' + now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}

/**
 * Inicia o polling automático. Recebe callbacks de renderização para não
 * depender diretamente do módulo de dashboard (evita import desnecessário).
 */
export function startAutoRefresh(onRefreshed){
  if(state.autoRefreshTimer) return;
  state.autoRefreshTimer = setInterval(async ()=>{
    if(document.getElementById('mainApp').style.display === 'none') return;
    await refreshSales();
    onRefreshed();
  }, AUTO_REFRESH_MS);
}

export async function addSaleAPI(sale){
  const res = await apiPost('addSale', { sale });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao registrar a venda.');
  return res.sale;
}
export async function updateSaleAPI(id, sale){
  const res = await apiPost('updateSale', { id, sale });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao salvar as alterações.');
  return res;
}
export async function deleteSaleAPI(id){
  const res = await apiPost('deleteSale', { id });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao excluir a venda.');
}
export async function saveGoalConfig(){
  try{
    await apiPost('saveConfig', { goal: state.goalValue });
  }catch(e){ alert('Não foi possível salvar a meta. Verifique sua conexão.'); }
}
