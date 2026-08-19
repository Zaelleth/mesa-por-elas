// Módulo Usuários — cadastro de acesso ao sistema.
// Visível para admin e gestor (ver auth.js). Dentro da tela, porém, um
// gestor tem visão mais restrita do que um admin — ver PERMISSION HELPERS
// abaixo. Essas checagens no frontend são só para a UI não oferecer botões
// que vão falhar; a validação de verdade sempre acontece no backend
// (Users.js), então mesmo que alguém burle a interface, nada é alterado
// sem passar pela checagem do servidor.

import { state } from '../state.js';
import { selectChoice } from '../utils.js';
import { apiGet, apiPost } from '../api.js';

const ROLE_OPTIONS = [
  { val: 'admin', label: 'Administrador' },
  { val: 'gestor', label: 'Gestor' },
  { val: 'vendedora', label: 'Vendedora' }
];

function roleLabel(role){
  const found = ROLE_OPTIONS.find(r=>r.val === role);
  return found ? found.label : role;
}

// ---------- Permission helpers (espelham a hierarquia do backend) ----------
function canEditUser(target){
  const role = state.currentRole;
  if(role === 'admin') return true;
  if(role === 'gestor'){
    const isSelf = target.login === state.currentUser;
    if(target.role === 'admin') return false;
    if(target.role === 'gestor' && !isSelf) return false;
    return true; // vendedora, ou a própria conta de gestor
  }
  return false;
}
function canDeleteUser(target){
  const role = state.currentRole;
  if(role === 'admin') return true;
  if(role === 'gestor'){
    return target.role !== 'admin' && target.role !== 'gestor';
  }
  return false;
}

// ---------- Comunicação com o backend ----------
async function fetchUsers(){
  try{
    const res = await apiGet('getUsers');
    state.users = (res && res.ok && res.users) ? res.users : [];
  }catch(e){ state.users = []; }
}

async function addUserAPI(user){
  const res = await apiPost('addUser', { user });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao criar o usuário.');
  return res.user;
}
async function updateUserAPI(id, user){
  const res = await apiPost('updateUser', { id, user });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao salvar as alterações.');
}
async function deleteUserAPI(id){
  const res = await apiPost('deleteUser', { id });
  if(!res || !res.ok) throw new Error((res && res.error) || 'Erro ao excluir o usuário.');
}

// ---------- Formulário ----------

/**
 * Preenche o seletor de função com só as opções que a pessoa logada tem
 * permissão de atribuir. Um gestor só pode conceder "Vendedora" — a única
 * exceção é ver a própria função atual ("Gestor") ao editar a si mesmo,
 * pra não sumir a opção que já está selecionada.
 */
function populateRoleGroup(targetCurrentRole){
  const group = document.getElementById('roleGroup');
  group.innerHTML = '';
  const isAdmin = state.currentRole === 'admin';
  const allowed = ROLE_OPTIONS.filter(r=>{
    if(isAdmin) return true;
    if(r.val === 'vendedora') return true;
    if(r.val === 'gestor' && targetCurrentRole === 'gestor') return true; // editando a própria conta
    return false;
  });
  allowed.forEach(r=>{
    const btn = document.createElement('div');
    btn.className = 'choice-btn';
    btn.dataset.val = r.val;
    btn.textContent = r.label;
    group.appendChild(btn);
  });
}

export function resetUserForm(){
  ['uName','uEmail','uLogin','uPassword'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('#roleGroup .choice-btn').forEach(b=>b.classList.remove('selected'));
  state.selectedUserRole = null;
  state.editingUserId = null;
  document.getElementById('userFormCard').style.display = 'none';
  document.getElementById('userFormMsg').textContent = '';
}

function openUserForm(mode, user){
  document.getElementById('userFormCard').style.display = '';
  document.getElementById('userFormMsg').textContent = '';
  if(mode === 'edit' && user){
    state.editingUserId = user.id;
    document.getElementById('userFormTitle').textContent = 'Editar usuário';
    document.getElementById('userFormHint').textContent = 'Altere os dados e salve as mudanças';
    document.getElementById('uName').value = user.name || '';
    document.getElementById('uEmail').value = user.email || '';
    document.getElementById('uLogin').value = user.login || '';
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'Deixe em branco para manter a atual';
    document.getElementById('uPasswordLabel').textContent = 'Nova senha (opcional)';
    document.getElementById('userSubmitBtn').textContent = 'Salvar alterações';
    populateRoleGroup(user.role);
    state.selectedUserRole = user.role;
    selectChoice('roleGroup', user.role);
  } else {
    state.editingUserId = null;
    document.getElementById('userFormTitle').textContent = 'Novo usuário';
    document.getElementById('userFormHint').textContent = 'Preencha os dados de acesso';
    document.getElementById('uName').value = '';
    document.getElementById('uEmail').value = '';
    document.getElementById('uLogin').value = '';
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'Senha de acesso';
    document.getElementById('uPasswordLabel').textContent = 'Senha';
    document.getElementById('userSubmitBtn').textContent = 'Salvar usuário';
    populateRoleGroup(null);
    state.selectedUserRole = null;
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

// ---------- Renderização ----------
export function renderUsersList(){
  const container = document.getElementById('usersListContainer');
  if(!container) return;
  const list = [...state.users].sort((a,b)=>a.name.localeCompare(b.name, 'pt-BR'));
  container.innerHTML = '';

  if(list.length === 0){
    container.innerHTML = '<div class="empty-row">Nenhum usuário cadastrado ainda</div>';
    return;
  }

  list.forEach(u=>{
    const canEdit = canEditUser(u);
    const canDelete = canDeleteUser(u);
    const row = document.createElement('div');
    row.className = 'sale-row';
    row.innerHTML = `
      <div class="sale-row-main">
        <div class="sale-row-name">${u.name}</div>
        <div class="sale-row-meta">
          Login: ${u.login} &middot; <span class="pill ${u.role}">${roleLabel(u.role)}</span>${u.email ? ' &middot; ' + u.email : ''}
        </div>
      </div>
      <div class="sale-row-actions">
        ${canEdit ? `<button class="edit-btn" data-id="${u.id}" title="Editar">✎</button>` : ''}
        ${canDelete ? `<button class="del-btn" data-id="${u.id}" title="Excluir">✕</button>` : ''}
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const user = state.users.find(u=>u.id === b.dataset.id);
      if(user) openUserForm('edit', user);
    });
  });
  container.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const user = state.users.find(u=>u.id === b.dataset.id);
      const label = user ? `"${user.name}"` : 'este usuário';
      if(confirm(`Excluir ${label}? Essa pessoa deixará de conseguir acessar o sistema.`)){
        try{
          await deleteUserAPI(b.dataset.id);
          state.users = state.users.filter(u=>u.id !== b.dataset.id);
          renderUsersList();
        }catch(err){
          alert(err.message);
        }
      }
    });
  });
}

export async function loadAndRenderUsers(){
  await fetchUsers();
  renderUsersList();
}

// ---------- Listeners ----------
export function initUsersListeners(){
  document.getElementById('btnNewUser').addEventListener('click', ()=> openUserForm('new'));
  document.getElementById('userCancelBtn').addEventListener('click', resetUserForm);

  // Mesma regra do formulário de venda: e-mail sempre em minúsculo, digitado
  // ou colado, independente de Caps Lock.
  document.getElementById('uEmail').addEventListener('input', e=>{
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    e.target.value = e.target.value.toLowerCase();
    e.target.setSelectionRange(start, end);
  });

  document.getElementById('roleGroup').addEventListener('click', e=>{
    const btn = e.target.closest('.choice-btn');
    if(!btn) return;
    document.querySelectorAll('#roleGroup .choice-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedUserRole = btn.dataset.val;
  });

  document.getElementById('userSubmitBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('userFormMsg');
    const name = document.getElementById('uName').value.trim();
    const email = document.getElementById('uEmail').value.trim();
    const login = document.getElementById('uLogin').value.trim();
    const password = document.getElementById('uPassword').value;
    const isEditing = !!state.editingUserId;

    if(!name || !login || !state.selectedUserRole || (!isEditing && !password)){
      msg.textContent = 'Preencha nome, login, função' + (isEditing ? '' : ' e senha') + '.';
      msg.className = 'form-msg err';
      return;
    }

    const submitBtn = document.getElementById('userSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando…';

    const userFields = { name, email, login, password, role: state.selectedUserRole };

    try{
      if(isEditing){
        await updateUserAPI(state.editingUserId, userFields);
        const idx = state.users.findIndex(u=>u.id === state.editingUserId);
        if(idx !== -1) state.users[idx] = { ...state.users[idx], name, email, login, role: state.selectedUserRole };
      } else {
        const savedUser = await addUserAPI(userFields);
        state.users.push(savedUser);
      }
      resetUserForm();
      renderUsersList();
    }catch(err){
      msg.textContent = err.message;
      msg.className = 'form-msg err';
      submitBtn.disabled = false;
      submitBtn.textContent = isEditing ? 'Salvar alterações' : 'Salvar usuário';
    }
  });
}
