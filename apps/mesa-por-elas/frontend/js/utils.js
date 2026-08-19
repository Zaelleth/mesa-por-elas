// Utilitários genéricos, sem dependência de estado ou de rede.

// ---------- Hierarquia de papéis: admin > gestor > vendedora ----------
// Centralizado aqui para não espalhar a definição de "quem está acima da
// vendedora" por vários arquivos — qualquer checagem de "isso é exclusivo
// de vendedora ou não" deve usar isElevatedRole(), não comparar string direto.
export function isElevatedRole(role){
  return role === 'admin' || role === 'gestor';
}

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

// ---------- Validação ----------

/** Checagem de formato de e-mail (permissiva o bastante para casos reais, sem ser leniente demais). */
export function isValidEmail(email){
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

/**
 * Validação de CPF pelo algoritmo oficial do dígito verificador — mesma
 * lógica usada por sites que "sabem" se um CPF é inválido sem consultar
 * nada externamente. Roda inteiramente no navegador: não envia o CPF para
 * nenhum serviço de terceiros, só confere a matemática.
 */
export function isValidCPF(cpf){
  const digits = String(cpf).replace(/\D/g,'');
  if(digits.length !== 11) return false;
  if(/^(\d)\1{10}$/.test(digits)) return false; // todos os dígitos iguais (111.111.111-11 etc.)

  let sum = 0;
  for(let i=0;i<9;i++) sum += parseInt(digits[i],10) * (10 - i);
  let firstCheck = 11 - (sum % 11);
  if(firstCheck >= 10) firstCheck = 0;
  if(firstCheck !== parseInt(digits[9],10)) return false;

  sum = 0;
  for(let i=0;i<10;i++) sum += parseInt(digits[i],10) * (11 - i);
  let secondCheck = 11 - (sum % 11);
  if(secondCheck >= 10) secondCheck = 0;
  if(secondCheck !== parseInt(digits[10],10)) return false;

  return true;
}

// ---------- Máscaras de campo (compartilhadas entre o formulário de venda e a tela de Clientes) ----------
export function maskCpf(value){
  let v = value.replace(/\D/g,'').slice(0,11);
  v = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  return v;
}
export function maskPhone(value){
  let v = value.replace(/\D/g,'').slice(0,11);
  if(v.length>10) v = v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  else if(v.length>6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
  else if(v.length>2) v = v.replace(/(\d{2})(\d{0,5})/,'($1) $2');
  return v;
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
