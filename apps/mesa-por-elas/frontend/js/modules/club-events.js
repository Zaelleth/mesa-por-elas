// Módulo Club — Eventos (calendário de encontros). Diferente de clientes e
// itens de venda, aqui a exclusão pelo app é permitida — nenhuma outra
// tabela referencia um evento, então não tem o mesmo risco de "quebrar"
// dado histórico. Visível a todo mundo; gerenciar (criar/editar/excluir) é
// restrito a admin/gestor.

import { state } from '../state.js';
import { isElevatedRole } from '../utils.js';
import { apiGet, apiPost } from '../api.js';

export async function fetchClubEvents(){
  try{
    const res = await apiGet('getClubEvents');
    state.clubEvents = (res && res.ok && res.events) ? res.events : [];
  }catch(e){ state.clubEvents = []; }
}

async function addClubEventAPI(event){
  const res = await apiPost('addClubEvent', { event });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao criar o encontro.');
  return res.event;
}
async function updateClubEventAPI(id, event){
  const res = await apiPost('updateClubEvent', { id, event });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao salvar as alterações.');
}
async function deleteClubEventAPI(id){
  const res = await apiPost('deleteClubEvent', { id });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao excluir o encontro.');
}

export function resetClubEventForm(){
  ['ceTitle','ceDate','ceLocation','ceDescription'].forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('ceExclusive').checked = false;
  state.editingClubEventId = null;
  document.getElementById('clubEventFormCard').style.display = 'none';
  document.getElementById('clubEventFormMsg').textContent = '';
}

function openClubEventForm(mode, ev){
  document.getElementById('clubEventFormCard').style.display = '';
  document.getElementById('clubEventFormMsg').textContent = '';
  if(mode === 'edit' && ev){
    state.editingClubEventId = ev.id;
    document.getElementById('clubEventFormTitle').textContent = 'Editar encontro';
    document.getElementById('ceTitle').value = ev.title || '';
    document.getElementById('ceDate').value = ev.eventDate ? ev.eventDate.slice(0,16) : '';
    document.getElementById('ceLocation').value = ev.location || '';
    document.getElementById('ceDescription').value = ev.description || '';
    document.getElementById('ceExclusive').checked = !!ev.clubExclusive;
    document.getElementById('clubEventSubmitBtn').textContent = 'Salvar alterações';
  } else {
    state.editingClubEventId = null;
    document.getElementById('clubEventFormTitle').textContent = 'Novo encontro';
    document.getElementById('ceTitle').value = '';
    document.getElementById('ceDate').value = '';
    document.getElementById('ceLocation').value = '';
    document.getElementById('ceDescription').value = '';
    document.getElementById('ceExclusive').checked = false;
    document.getElementById('clubEventSubmitBtn').textContent = 'Salvar encontro';
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

export function renderClubEventsList(){
  const container = document.getElementById('clubEventsList');
  const canManage = isElevatedRole(state.currentRole);
  const list = [...state.clubEvents].sort((a,b)=> new Date(a.eventDate) - new Date(b.eventDate));

  if(list.length === 0){
    container.innerHTML = '<div class="empty-row">Nenhum encontro cadastrado ainda</div>';
    return;
  }

  container.innerHTML = list.map(ev=>{
    const d = new Date(ev.eventDate);
    const dateStr = d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="sale-row">
        <div class="sale-row-main">
          <div class="sale-row-name">${ev.title}${ev.clubExclusive ? ' <span class="pill club">★ Exclusivo Club</span>' : ''}</div>
          <div class="sale-row-meta">${dateStr} &middot; ${timeStr}${ev.location ? ' &middot; ' + ev.location : ''}</div>
        </div>
        ${canManage ? `<div class="sale-row-actions">
          <button class="edit-btn" data-id="${ev.id}" title="Editar">✎</button>
          <button class="del-btn" data-id="${ev.id}" title="Excluir">✕</button>
        </div>` : ''}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const ev = state.clubEvents.find(e=>e.id === b.dataset.id);
      if(ev) openClubEventForm('edit', ev);
    });
  });
  container.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const ev = state.clubEvents.find(e=>e.id === b.dataset.id);
      const label = ev ? `"${ev.title}"` : 'este encontro';
      if(confirm(`Excluir o encontro ${label}? Essa ação não pode ser desfeita.`)){
        try{
          await deleteClubEventAPI(b.dataset.id);
          state.clubEvents = state.clubEvents.filter(e=>e.id !== b.dataset.id);
          renderClubEventsList();
        }catch(err){
          alert(err.message);
        }
      }
    });
  });
}

export async function loadAndRenderClubEvents(){
  await fetchClubEvents();
  renderClubEventsList();
}

export function initClubEventsListeners(){
  document.getElementById('btnNewClubEvent').addEventListener('click', ()=> openClubEventForm('new'));
  document.getElementById('clubEventCancelBtn').addEventListener('click', resetClubEventForm);

  document.getElementById('clubEventSubmitBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('clubEventFormMsg');
    const title = document.getElementById('ceTitle').value.trim();
    const dateVal = document.getElementById('ceDate').value;
    const location = document.getElementById('ceLocation').value.trim();
    const description = document.getElementById('ceDescription').value.trim();
    const clubExclusive = document.getElementById('ceExclusive').checked;
    const isEditing = !!state.editingClubEventId;

    if(!title || !dateVal){
      msg.textContent = 'Preencha o título e a data do encontro.';
      msg.className = 'form-msg err';
      return;
    }
    const eventDate = new Date(dateVal).toISOString();

    const submitBtn = document.getElementById('clubEventSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando…';

    const eventFields = { title, eventDate, location, description, clubExclusive };

    try{
      if(isEditing){
        await updateClubEventAPI(state.editingClubEventId, eventFields);
        const idx = state.clubEvents.findIndex(e=>e.id === state.editingClubEventId);
        if(idx !== -1) state.clubEvents[idx] = { ...state.clubEvents[idx], ...eventFields };
      } else {
        const saved = await addClubEventAPI(eventFields);
        state.clubEvents.push(saved);
      }
      resetClubEventForm();
      renderClubEventsList();
    }catch(err){
      msg.textContent = err.message;
      msg.className = 'form-msg err';
      submitBtn.disabled = false;
      submitBtn.textContent = isEditing ? 'Salvar alterações' : 'Salvar encontro';
    }
  });
}
