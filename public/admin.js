const initData = window.Telegram?.WebApp?.initData || new URLSearchParams(location.hash.replace(/^#/, '')).get('tgWebAppData') || new URLSearchParams(location.search).get('tgWebAppData') || '';
const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData };
const status = document.getElementById('status');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number(value || 0).toFixed(2);
let state = { users: [], promos: [], transactions: [], adminLog: [] };
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error);
  return data;
}
function renderUsers(query = '') {
  const q = query.toLowerCase();
  const users = state.users.filter(u => `${u.id} ${u.username || ''} ${u.firstName || ''}`.toLowerCase().includes(q));
  document.getElementById('users').innerHTML = users.length ? users.map(u => `<div class="row"><b>${esc(u.firstName || 'Игрок')}<small class="muted"> ${u.username?'@'+esc(u.username):''}<br>ID ${esc(u.id)}</small></b><span>${money(u.balance)} USDT</span><span>Вагер ${money(u.wagerRemaining)}</span><span>${u.redeemedPromos} промо</span><button class="secondary" data-user="${esc(u.id)}">Баланс</button></div>`).join('') : '<p class="muted">Пользователи не найдены.</p>';
  document.querySelectorAll('[data-user]').forEach(button => button.onclick = () => { document.getElementById('balance-user').value = button.dataset.user; showTab('balances'); });
}
function renderTransactions(query = '') {
  const q = query.toLowerCase();
  const items = state.transactions.filter(t => `${t.userId} ${t.type} ${t.description} ${t.reference || ''}`.toLowerCase().includes(q));
  document.getElementById('transactions').innerHTML = items.length ? items.map(t => `<div class="row"><b>${esc(t.type)}<small class="muted"><br>${new Date(t.createdAt).toLocaleString('ru-RU')}</small></b><span>ID ${esc(t.userId)}</span><span>${Number(t.amount)>0?'+':''}${money(t.amount)} USDT</span><span>После ${money(t.balanceAfter)}</span><span>${esc(t.description)}</span></div>`).join('') : '<p class="muted">Транзакций пока нет.</p>';
}
function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('[data-section]').forEach(x => x.classList.toggle('hidden', x.dataset.section !== name));
}
async function load() {
  if (!initData) throw new Error('Откройте админку через Telegram Mini App.');
  state = await api('/api/admin/overview');
  document.getElementById('admin').textContent = `ID ${state.adminId}`;
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('stats').innerHTML = [['Пользователи',state.stats.users],['Баланс',`${money(state.stats.balance)} USDT`],['Вагер',`${money(state.stats.wager)} USDT`],['Депозиты',state.stats.paidInvoices],['Выплаты',state.stats.payouts]].map(x => `<div class="card stat"><b>${esc(x[1])}</b><small>${esc(x[0])}</small></div>`).join('');
  document.getElementById('promos').innerHTML = state.promos.length ? state.promos.map(p => `<div class="row"><b>${esc(p.code)}<small class="muted"><br>${p.active?'Активен':'Отключён'}</small></b><span>${money(p.amount)} USDT</span><span>Вагер ${money(p.wager)}</span><span>${p.used}/${p.limit}</span><button class="secondary" data-toggle="${esc(p.code)}">${p.active?'Отключить':'Включить'}</button></div>`).join('') : '<p class="muted">Промокодов пока нет.</p>';
  renderUsers(document.getElementById('user-search').value); renderTransactions(document.getElementById('transaction-search').value);
  document.getElementById('audit').innerHTML = state.adminLog.length ? state.adminLog.map(x => `<div class="row"><b>${esc(x.action)}</b><span>${esc(x.adminId)}</span><span>${esc(x.userId || x.code || '')}</span><span>${esc(x.amount || '')}</span><span>${new Date(x.at).toLocaleString('ru-RU')}</span></div>`).join('') : '<p class="muted">Действий пока нет.</p>';
  document.querySelectorAll('[data-toggle]').forEach(button => button.onclick = async () => { await api(`/api/admin/promos/${encodeURIComponent(button.dataset.toggle)}/toggle`, { method: 'POST' }); await load(); });
}
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => showTab(button.dataset.tab));
document.getElementById('user-search').oninput = event => renderUsers(event.target.value);
document.getElementById('transaction-search').oninput = event => renderTransactions(event.target.value);
document.getElementById('refresh').onclick = () => load();
document.getElementById('promo-form').onsubmit = async event => {
  event.preventDefault(); status.textContent = 'Создание…'; status.className = '';
  try { await api('/api/admin/promos', { method: 'POST', body: JSON.stringify({ code: document.getElementById('promo-code').value, amount: document.getElementById('promo-amount').value, wager: document.getElementById('promo-wager').value, limit: document.getElementById('promo-limit').value }) }); event.target.reset(); document.getElementById('promo-limit').value=100; document.getElementById('promo-wager').value=0; status.textContent='Промокод создан.'; await load(); } catch(error){ status.textContent=error.message; status.className='error'; }
};
document.getElementById('balance-form').onsubmit = async event => {
  event.preventDefault(); status.textContent='Изменение баланса…'; status.className='';
  const sign = document.getElementById('balance-operation').value === 'debit' ? -1 : 1;
  try { const result=await api('/api/admin/balance',{method:'POST',body:JSON.stringify({userId:document.getElementById('balance-user').value,amount:sign*Number(document.getElementById('balance-amount').value),reason:document.getElementById('balance-reason').value})}); status.textContent=`Баланс ID ${result.userId}: ${money(result.balance)} USDT`; event.target.reset(); await load(); } catch(error){status.textContent=error.message;status.className='error';}
};
document.getElementById('export-transactions').onclick = () => {
  const rows = [['date','user_id','type','amount','balance_after','description'],...state.transactions.map(t=>[t.createdAt,t.userId,t.type,t.amount,t.balanceAfter,t.description])];
  const csv=rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='bor-drop-transactions.csv'; a.click(); URL.revokeObjectURL(a.href);
};
load().catch(error => { status.textContent=error.message; status.className='error'; });
