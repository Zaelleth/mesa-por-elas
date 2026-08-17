// Módulo Eventos — dashboard, gráficos e exportação CSV.
// Observação: `Chart` vem do Chart.js carregado via <script> no index.html
// (variável global, não precisa de import).

import { state } from '../../state.js';
import { EVENT_DATE } from '../../config.js';
import { fmtBRL, dateOfSale, csvEscape, pixPortion, cardPortion, paymentLabel, paymentPillClass } from '../../utils.js';
import { deleteSaleAPI, refreshSales, saveGoalConfig } from './sales-data.js';
import { startEdit } from './sales-form.js';

export function filteredSales(){
  if(!state.currentFilterDate) return state.sales;
  return state.sales.filter(s=>dateOfSale(s)===state.currentFilterDate);
}

export function renderRecent(){
  const tbody = document.getElementById('recentTableBody');
  const base = (state.currentRole && state.currentRole !== 'admin')
    ? state.sales.filter(s=>s.seller===state.currentUser)
    : state.sales;
  const list = [...base].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,8);
  tbody.innerHTML = '';
  if(list.length===0){
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhuma venda ainda</td></tr>';
    return;
  }
  list.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${s.seller}</td><td><span class="pill ${paymentPillClass(s)}">${paymentLabel(s)}</span></td><td>R$ ${fmtBRL(s.amount)}</td>`;
    tbody.appendChild(tr);
  });
}

export function renderDashboard(){
  const list = filteredSales();
  const total = list.reduce((a,s)=>a+s.amount,0);
  const pixTotal = list.reduce((a,s)=>a+pixPortion(s),0);
  const cartaoTotal = list.reduce((a,s)=>a+cardPortion(s),0);
  const pixCount = list.filter(s=>pixPortion(s)>0).length;
  const cartaoCount = list.filter(s=>cardPortion(s)>0).length;

  document.getElementById('statTotal').textContent = 'R$ ' + fmtBRL(total);
  document.getElementById('statTotalCount').textContent = list.length + (list.length===1?' venda':' vendas');
  document.getElementById('statPix').textContent = 'R$ ' + fmtBRL(pixTotal);
  document.getElementById('statPixCount').textContent = pixCount + (pixCount===1?' venda':' vendas');
  document.getElementById('statCartao').textContent = 'R$ ' + fmtBRL(cartaoTotal);
  document.getElementById('statCartaoCount').textContent = cartaoCount + (cartaoCount===1?' venda':' vendas');

  document.getElementById('goalTotalLabel').textContent = fmtBRL(total);
  document.getElementById('goalInput').value = state.goalValue;
  const pct = Math.min(100, (total/state.goalValue)*100 || 0);
  document.getElementById('goalFill').style.width = pct + '%';

  // vendedoras
  const sellers = ['Gabriela','Larissa'];
  const colors = {Gabriela:'#cba869', Larissa:'#b98fa0'};
  const sellerGrid = document.getElementById('sellerGrid');
  sellerGrid.innerHTML = '';
  const sellerTotals = {};
  sellers.forEach(name=>{
    const sList = list.filter(s=>s.seller===name);
    const sTotal = sList.reduce((a,s)=>a+s.amount,0);
    sellerTotals[name] = sTotal;
    const card = document.createElement('div');
    card.className = 'seller-card';
    card.innerHTML = `<div>
        <div class="name"><span class="dot" style="background:${colors[name]}"></span>${name}</div>
        <div class="count">${sList.length} ${sList.length===1?'venda':'vendas'}</div>
      </div>
      <div class="amount">R$ ${fmtBRL(sTotal)}</div>`;
    sellerGrid.appendChild(card);
  });

  // tabela de vendas
  const tbody = document.getElementById('salesTableBody');
  tbody.innerHTML = '';
  if(list.length===0){
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhuma venda registrada ainda</td></tr>';
  }else{
    [...list].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).forEach(s=>{
      const tr = document.createElement('tr');
      const pillTitle = s.payment==='misto'
        ? ` title="Pix: R$ ${fmtBRL(pixPortion(s))} · Cartão: R$ ${fmtBRL(cardPortion(s))}"`
        : '';
      const time = new Date(s.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      tr.innerHTML = `<td>${s.name}</td><td>${s.seller}</td><td><span class="pill ${paymentPillClass(s)}"${pillTitle}>${paymentLabel(s)}</span></td>
        <td>R$ ${fmtBRL(s.amount)}</td><td>${time}</td>
        <td><button class="edit-btn" data-id="${s.id}" title="Editar">✎</button> <button class="del-btn" data-id="${s.id}" title="Excluir">✕</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.edit-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        startEdit(b.dataset.id);
      });
    });
    tbody.querySelectorAll('.del-btn').forEach(b=>{
      b.addEventListener('click', async ()=>{
        if(confirm('Excluir esta venda?')){
          try{
            await deleteSaleAPI(b.dataset.id);
            state.sales = state.sales.filter(s=>s.id !== b.dataset.id);
            renderDashboard();
            renderRecent();
          }catch(err){
            alert('Não foi possível excluir. Verifique sua conexão e tente novamente.');
          }
        }
      });
    });
  }

  // gráficos
  const sellerCtx = document.getElementById('sellerChart');
  const sellerData = sellers.map(n=>sellerTotals[n]);
  if(state.sellerChart) state.sellerChart.destroy();
  state.sellerChart = new Chart(sellerCtx, {
    type:'bar',
    data:{
      labels:sellers,
      datasets:[{
        data:sellerData,
        backgroundColor: sellers.map(n=>colors[n]),
        borderRadius:8,
        maxBarThickness:60
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:(ctx)=> 'R$ '+fmtBRL(ctx.raw)}}},
      scales:{
        x:{grid:{display:false}, ticks:{color:'#948e83', font:{family:'Inter'}}},
        y:{grid:{color:'#22222a'}, ticks:{color:'#948e83', callback:(v)=>'R$ '+v, font:{family:'Inter'}}}
      }
    }
  });

  const payCtx = document.getElementById('paymentChart');
  if(state.paymentChart) state.paymentChart.destroy();
  state.paymentChart = new Chart(payCtx, {
    type:'doughnut',
    data:{
      labels:['Pix','Cartão'],
      datasets:[{
        data:[pixTotal, cartaoTotal],
        backgroundColor:['#6fa89a','#cba869'],
        borderColor:'#17171d',
        borderWidth:3
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      cutout:'68%',
      plugins:{
        legend:{position:'bottom', labels:{color:'#c9c4ba', font:{family:'Inter', size:12}, boxWidth:10}},
        tooltip:{callbacks:{label:(ctx)=> ctx.label+': R$ '+fmtBRL(ctx.raw)}}
      }
    }
  });
}

// ---------- CSV export ----------
function exportCSV(){
  const list = [...filteredSales()].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  if(list.length===0){
    alert('Não há vendas para exportar nesse período.');
    return;
  }
  const headers = ['Nome completo','Telefone','E-mail','CPF','Valor total (R$)','Valor Pix (R$)','Valor Cartão (R$)','Forma de pagamento','Vendedora','Data','Hora'];
  const rows = list.map(s=>{
    const d = new Date(s.timestamp);
    const dateStr = d.toLocaleDateString('pt-BR');
    const timeStr = d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    return [
      s.name, s.phone, s.email, s.cpf,
      s.amount.toFixed(2).replace('.',','),
      pixPortion(s).toFixed(2).replace('.',','),
      cardPortion(s).toFixed(2).replace('.',','),
      paymentLabel(s),
      s.seller, dateStr, timeStr
    ].map(csvEscape).join(';');
  });
  const csvContent = '\uFEFF' + headers.map(csvEscape).join(';') + '\n' + rows.join('\n');
  const blob = new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const label = state.currentFilterDate ? state.currentFilterDate : 'todas-as-vendas';
  a.href = url;
  a.download = `vendas-a-mesa-por-elas-${label}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Liga todos os listeners da tela de dashboard (filtros, meta, exportar, atualizar). */
export function initDashboardListeners(){
  document.getElementById('dashDate').value = state.currentFilterDate;
  document.getElementById('dashDate').addEventListener('change', e=>{
    state.currentFilterDate = e.target.value;
    renderDashboard();
  });
  document.getElementById('btnToday').addEventListener('click', ()=>{
    state.currentFilterDate = EVENT_DATE;
    document.getElementById('dashDate').value = state.currentFilterDate;
    renderDashboard();
  });
  document.getElementById('btnAll').addEventListener('click', ()=>{
    state.currentFilterDate = null;
    renderDashboard();
  });
  document.getElementById('goalInput').addEventListener('change', e=>{
    const v = parseFloat(e.target.value);
    if(!isNaN(v) && v>0){
      state.goalValue = v;
      saveGoalConfig();
      renderDashboard();
    }
  });
  document.getElementById('btnExport').addEventListener('click', exportCSV);
  document.getElementById('btnRefresh').addEventListener('click', async ()=>{
    const btn = document.getElementById('btnRefresh');
    btn.disabled = true;
    await refreshSales();
    renderDashboard();
    renderRecent();
    btn.disabled = false;
  });
}
