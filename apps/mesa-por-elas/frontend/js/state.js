// Estado compartilhado entre módulos.
// Usamos um único objeto mutável (em vez de "let" exportados) para evitar
// qualquer ambiguidade sobre live-binding entre arquivos — todo módulo que
// importar `state` enxerga e altera exatamente o mesmo objeto.

import { EVENT_DATE } from './config.js';

export const state = {
  // Sessão / autenticação
  sessionToken: null,
  currentRole: null,   // 'admin' | 'vendedora'
  currentUser: null,   // nome de usuário logado
  knownSellers: [],    // lista de vendedoras cadastradas (aba Auth)

  // Dados do módulo Eventos
  sales: [],
  goalValue: 5000,
  currentFilterDate: EVENT_DATE,
  autoRefreshTimer: null,

  // Gráficos (guardamos a instância para poder destruir antes de recriar)
  sellerChart: null,
  paymentChart: null,

  // Formulário de venda em edição
  selectedPayment: null,
  selectedSeller: null,
  selectedCardType: null,
  editingId: null
};
