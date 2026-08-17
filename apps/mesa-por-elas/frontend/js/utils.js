// Utilitários genéricos, sem dependência de estado ou de rede.

export function fmtBRL(v){
  return v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

export function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

export function dateOfSale(s){
  return new Date(s.timestamp).toISOString().slice(0,10);
}

export function selectChoice(groupId, val){
  document.querySelectorAll('#'+groupId+' .choice-btn').forEach(b=>{
    b.classList.toggle('selected', b.dataset.val===val);
  });
}

export function csvEscape(val){
  const str = String(val ?? '');
  if(/[",\n;]/.test(str)){
    return '"' + str.replace(/"/g,'""') + '"';
  }
  return str;
}

// ---------- Helpers de pagamento (cobrem pagamento único e dividido) ----------
export function pixPortion(s){
  if(typeof s.pixAmount === 'number') return s.pixAmount;
  return s.payment === 'pix' ? s.amount : 0; // vendas antigas, sem os campos novos
}
export function cardPortion(s){
  if(typeof s.cardAmount === 'number') return s.cardAmount;
  return s.payment === 'pix' ? 0 : s.amount; // vendas antigas, sem os campos novos
}
export function paymentLabel(s){
  const cardLabel = (t)=> t==='credito' ? 'Crédito' : 'Débito';
  if(s.payment === 'misto') return `Pix + ${cardLabel(s.cardType)}`;
  if(s.payment === 'pix') return 'Pix';
  return cardLabel(s.payment);
}
export function paymentPillClass(s){
  if(s.payment === 'misto') return 'misto';
  return s.payment === 'pix' ? 'pix' : 'cartao';
}
