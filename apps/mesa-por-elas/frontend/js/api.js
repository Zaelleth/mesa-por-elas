// Comunicação com o backend (Google Sheets via Apps Script).
// Este módulo não conhece auth.js diretamente (evita import circular) —
// quem quiser reagir a uma sessão expirada registra um callback aqui.

import { API_URL } from './config.js';
import { state } from './state.js';

let sessionExpiredHandler = null;

export function onSessionExpired(handler){
  sessionExpiredHandler = handler;
}

function notifyIfSessionInvalid(data){
  if(data && data.error === 'SESSION_INVALID' && sessionExpiredHandler){
    sessionExpiredHandler();
  }
}

export async function apiGet(action){
  const token = state.sessionToken || '';
  const url = `${API_URL}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Falha na conexão com o servidor.');
  const data = await res.json();
  notifyIfSessionInvalid(data);
  return data;
}

export async function apiPost(action, payload, tokenOverride){
  const token = (tokenOverride !== undefined) ? tokenOverride : (state.sessionToken || '');
  const res = await fetch(API_URL, {
    method: 'POST',
    // Content-Type text/plain evita o pre-flight de CORS que o Apps Script não trata
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...payload })
  });
  if(!res.ok) throw new Error('Falha na conexão com o servidor.');
  const data = await res.json();
  notifyIfSessionInvalid(data);
  return data;
}
