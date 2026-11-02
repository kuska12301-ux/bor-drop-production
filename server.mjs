import http from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { FKPay, verifyFKWebhook } from './sdk/fk-pay.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const rawPage = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const paymentsScript = await readFile(new URL('./public/payments.js', import.meta.url));
const gamesScript = await readFile(new URL('./public/games.js', import.meta.url));
const rawAdminPage = await readFile(new URL('./public/admin.html', import.meta.url), 'utf8');
const adminScript = await readFile(new URL('./public/admin.js', import.meta.url));
const telegramSdk = '<script src="https://telegram.org/js/telegram-web-app.js"></script>';
const adminPage = rawAdminPage.replace('<main>', `${telegramSdk}<main>`);
const paymentUi = `<style>.payment-dialog{border:1px solid #ff852d66;border-radius:26px;padding:0;max-width:390px;width:calc(100% - 28px);overflow:hidden;background:#1d1528;color:#fff;box-shadow:0 28px 90px #000b}.payment-dialog::backdrop{background:#08050dbb;backdrop-filter:blur(8px)}.payment-head{padding:22px 22px 13px;background:radial-gradient(circle at 85% 0,#7730a755,transparent 45%),linear-gradient(135deg,#291738,#1b1425)}.payment-head h2{margin:4px 0 7px}.payment-body{padding:18px 22px 24px}.dialog-close{float:right;border:1px solid #ffffff22!important;background:#ffffff12!important;color:#fff!important;border-radius:50%;width:34px;height:34px;font-size:21px}.money-field{display:flex;align-items:center;margin:10px 0 15px;border:1px solid #6f527d;background:#110c19;border-radius:17px;padding:5px 12px;box-shadow:inset 0 0 0 1px #0005}.money-field input{width:100%;min-width:0;border:0!important;outline:0;background:transparent!important;color:#fff!important;font-size:28px!important;font-weight:850;padding:13px 5px!important}.money-field .unit{color:#ff9b45;font-weight:800}.payment-chips{display:flex;gap:7px;margin-bottom:16px}.payment-chips button{flex:1;border:1px solid #624770;background:#2b1e37;color:#e6dced;border-radius:11px;padding:9px 4px;font-weight:750}.payment-action{width:100%;min-height:50px;border-radius:15px!important}.payment-action:disabled{filter:grayscale(.35);opacity:.7}.payment-status{min-height:20px;margin:13px 2px 0!important;color:#cfc3d8!important}</style><dialog class="payment-dialog" id="deposit-dialog"><div class="payment-head"><form method="dialog"><button class="dialog-close" aria-label="Закрыть">×</button></form><h2>Пополнить баланс</h2><p class="sub">Оплата через FK Wallet в USDT</p></div><div class="payment-body"><label class="smalltitle" for="deposit-amount">Введите сумму</label><div class="money-field"><input id="deposit-amount" inputmode="decimal" type="number" min="0.10" max="10000" step="0.01" value="10.00"><span class="unit">USDT</span></div><div class="payment-chips" data-target="deposit-amount"><button type="button" data-value="5">$5</button><button type="button" data-value="10">$10</button><button type="button" data-value="25">$25</button><button type="button" data-value="50">$50</button></div><button class="primary payment-action" id="deposit-create">Создать счёт на оплату</button><p class="payment-status" id="deposit-status" role="status"></p></div></dialog><dialog class="payment-dialog" id="withdraw-dialog"><div class="payment-head"><form method="dialog"><button class="dialog-close" aria-label="Закрыть">×</button></form><h2>Вывести средства</h2><p class="sub">Автовыплата на ваш @username в FK Wallet</p></div><div class="payment-body"><label class="smalltitle" for="withdraw-amount">Введите сумму вывода</label><div class="money-field"><input id="withdraw-amount" inputmode="decimal" type="number" min="0.10" max="10000" step="0.01" value="5.00"><span class="unit">USDT</span></div><div class="payment-chips" data-target="withdraw-amount"><button type="button" data-value="1">$1</button><button type="button" data-value="5">$5</button><button type="button" data-value="10">$10</button><button type="button" data-value="all">Всё</button></div><button class="primary payment-action" id="withdraw-create">Вывести средства</button><p class="payment-status" id="withdraw-status" role="status"></p></div></dialog><script src="/payments.js"></script>`;
const page = rawPage.includes('</body>')
  ? rawPage.replace('</body>', `${telegramSdk}${paymentUi}<script src="/games.js"></script></body>`)
  : rawPage.replace('</html>', `${telegramSdk}${paymentUi}<script src="/games.js"></script></html>`);
const dataDir = new URL('./data/', import.meta.url);
const dbFile = new URL('./data/ledger.json', import.meta.url);
await mkdir(dataDir, { recursive: true });
let db = { users: {}, invoices: {}, payouts: {}, promos: {}, transactions: [], webhookEvents: {}, adminLog: [] };
try { db = JSON.parse(await readFile(dbFile, 'utf8')); } catch {}
db.users ||= {}; db.invoices ||= {}; db.payouts ||= {}; db.promos ||= {}; db.transactions ||= []; db.webhookEvents ||= {}; db.adminLog ||= []; db.games ||= {};
let saveQueue = Promise.resolve();
function persist() {
  saveQueue = saveQueue.then(async () => {
    const temp = new URL('./data/ledger.tmp', import.meta.url);
    await writeFile(temp, JSON.stringify(db, null, 2));
    await rename(temp, dbFile);
  });
  return saveQueue;
}

const paymentsEnabled = Boolean(process.env.FK_PAY_BASE_URL && process.env.FK_PAY_API_KEY && process.env.TELEGRAM_BOT_TOKEN);
const webhookEnabled = Boolean(paymentsEnabled && process.env.FK_WEBHOOK_SECRET);
const pay = paymentsEnabled ? new FKPay({ baseUrl: process.env.FK_PAY_BASE_URL, apiKey: process.env.FK_PAY_API_KEY }) : null;
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
async function getBody(req, limit = 64_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifyTelegram(initData) {
  if (!initData || !process.env.TELEGRAM_BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const received = params.get('hash');
  params.delete('hash'); params.delete('signature');
  const authDate = Number(params.get('auth_date'));
  if (!received || !authDate || Math.abs(Date.now() / 1000 - authDate) > 3600) return null;
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(params.get('user')); } catch { return null; }
}
const userFrom = req => verifyTelegram(req.headers['x-telegram-init-data']);
const isAdmin = user => Boolean(user?.id && process.env.ADMIN_ID && String(user.id) === String(process.env.ADMIN_ID));
const account = id => {
  const value = db.users[id] ||= { balance: '0.000000', wagerRemaining: '0.000000', creditedInvoices: [], redeemedPromos: [] };
  value.creditedInvoices ||= [];
  value.redeemedPromos ||= [];
  value.wagerRemaining ||= '0.000000';
  value.lastDailyBonus ||= 0;
  return value;
};
const recordTransaction = ({ userId, type, amount, balanceAfter, description, reference, adminId }) => {
  const item = { id: randomUUID(), userId: String(userId), type, amount: Number(amount).toFixed(6), balanceAfter: Number(balanceAfter).toFixed(6), description, reference, adminId, createdAt: new Date().toISOString() };
  db.transactions.unshift(item); db.transactions = db.transactions.slice(0, 20_000); return item;
};
const gameModes = new Set(['Jackpot', 'Арена', 'Колесо']);
const newRound = mode => ({ id: randomUUID(), mode, status: 'waiting', players: {}, bank: '0.000000', startAt: null, winner: null, createdAt: new Date().toISOString() });
const roundFor = mode => {
  let round = db.games[mode];
  if (!round || (round.status === 'finished' && Date.now() >= Number(round.resetAt || 0))) round = db.games[mode] = newRound(mode);
  return round;
};
const publicRound = round => ({ id: round.id, mode: round.mode, status: round.status, bank: round.bank, startAt: round.startAt, winner: round.winner, players: Object.values(round.players || {}).map(player => ({ id: player.id, name: player.name, username: player.username, photoUrl: player.photoUrl, amount: player.amount })) });
async function settleRound(round) {
  if (round.status !== 'countdown' || Date.now() < Number(round.startAt) || Object.keys(round.players).length < 2) return false;
  const players = Object.values(round.players); const bank = Number(round.bank);
  const seed = createHash('sha256').update(`${round.id}:${round.startAt}:${players.map(x => `${x.id}:${x.amount}`).join('|')}`).digest();
  let point = seed.readUInt32BE(0) / 0x100000000 * bank; let winner = players[players.length - 1];
  for (const player of players) { point -= Number(player.amount); if (point < 0) { winner = player; break; } }
  const wallet = account(String(winner.id)); wallet.balance = (Number(wallet.balance) + bank).toFixed(6);
  recordTransaction({ userId: winner.id, type: 'win', amount: bank, balanceAfter: wallet.balance, description: `Выигрыш · ${round.mode}`, reference: round.id });
  round.status = 'finished'; round.winner = { id: winner.id, name: winner.name, username: winner.username, photoUrl: winner.photoUrl, amount: bank.toFixed(6) }; round.finishedAt = Date.now(); round.resetAt = Date.now() + 8000;
  await persist(); return true;
}
let moneyQueue = Promise.resolve();
function serializeMoney(operation) {
  const result = moneyQueue.then(operation, operation);
  moneyQueue = result.catch(() => {});
  return result;
}
const normalizeInvoice = value => value?.invoice || value?.data?.invoice || value?.data || value;
async function creditPaidInvoice(remoteInvoice) {
  const invoice = normalizeInvoice(remoteInvoice);
  if (!invoice?.id) return false;
  const local = db.invoices[invoice.id];
  if (!local || !['paid', 'completed', 'success'].includes(String(invoice.status).toLowerCase())) return false;
  const user = account(local.userId);
  if (user.creditedInvoices.includes(invoice.id)) return false;
  user.balance = (Number(user.balance) + Number(local.amount)).toFixed(6);
  user.creditedInvoices.push(invoice.id);
  local.status = 'paid'; local.paidAt = new Date().toISOString();
  recordTransaction({ userId: local.userId, type: 'deposit', amount: local.amount, balanceAfter: user.balance, description: 'Пополнение FK Pay', reference: invoice.id });
  await persist();
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', paymentsEnabled, webhookEnabled });
    if (req.method === 'POST' && url.pathname === '/api/fk/webhook') {
      if (!webhookEnabled) return json(res, 503, { error: 'WEBHOOK_NOT_CONFIGURED' });
      const rawBody = await getBody(req);
      const valid = verifyFKWebhook({ secret: process.env.FK_WEBHOOK_SECRET, timestamp: req.headers['fk-timestamp'], signature: req.headers['fk-signature'], rawBody });
      if (!valid) return json(res, 401, { error: 'INVALID_SIGNATURE' });
      const event = JSON.parse(rawBody);
      const eventId = String(req.headers['fk-event-id'] || event.id || createHash('sha256').update(rawBody).digest('hex'));
      if (db.webhookEvents[eventId]) return json(res, 200, { ok: true, duplicate: true });
      db.webhookEvents[eventId] = new Date().toISOString();
      if (event.type === 'invoice.paid' || event.event === 'invoice.paid') await creditPaidInvoice(event.data?.invoice || event.invoice || event.data);
      await persist();
      return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) {
      const user = userFrom(req);
      if (!user?.id) return json(res, 401, { error: 'TELEGRAM_AUTH_REQUIRED' });
      const currentAccount = account(String(user.id));
      currentAccount.username = user.username || currentAccount.username;
      currentAccount.firstName = user.first_name || currentAccount.firstName;
      if (req.method === 'GET' && url.pathname === '/api/balance') return json(res, 200, { balance: currentAccount.balance, wagerRemaining: currentAccount.wagerRemaining, asset: 'USDT', isAdmin: isAdmin(user) });
      if (req.method === 'GET' && url.pathname === '/api/profile') return json(res, 200, { id: String(user.id), username: user.username, firstName: user.first_name, photoUrl: user.photo_url, balance: currentAccount.balance, wagerRemaining: currentAccount.wagerRemaining, lastDailyBonus: currentAccount.lastDailyBonus, isAdmin: isAdmin(user) });
      if (req.method === 'POST' && url.pathname === '/api/bonus/daily') {
        const result = await serializeMoney(async () => {
          const wallet = account(String(user.id));
          const waitMs = 86_400_000 - (Date.now() - Number(wallet.lastDailyBonus || 0));
          if (waitMs > 0) return { waitMs };
          const prizes = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10];
          const prize = prizes[Number.parseInt(randomUUID().slice(0, 8), 16) % prizes.length];
          const wager = prize * 5;
          wallet.balance = (Number(wallet.balance) + prize).toFixed(6);
          wallet.wagerRemaining = (Number(wallet.wagerRemaining) + wager).toFixed(6);
          wallet.lastDailyBonus = Date.now();
          recordTransaction({ userId: user.id, type: 'daily_bonus', amount: prize, balanceAfter: wallet.balance, description: 'Ежедневный бонус', reference: new Date().toISOString().slice(0, 10) });
          await persist();
          return { amount: prize.toFixed(6), wagerAdded: wager.toFixed(6), wagerRemaining: wallet.wagerRemaining, balance: wallet.balance, nextAt: wallet.lastDailyBonus + 86_400_000 };
        });
        if (result.waitMs) return json(res, 409, { error: 'BONUS_ALREADY_CLAIMED', message: 'Бонус уже получен. Возвращайтесь завтра.', waitMs: result.waitMs });
        return json(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/api/game/state') {
        const mode = String(url.searchParams.get('mode') || 'Jackpot'); if (!gameModes.has(mode)) return json(res, 400, { error: 'INVALID_MODE' });
        const round = roundFor(mode); await settleRound(round); return json(res, 200, publicRound(round));
      }
      if (req.method === 'POST' && url.pathname === '/api/game/bet') {
        const input = JSON.parse(await getBody(req) || '{}'); const mode = String(input.mode || 'Jackpot'); const amount = Math.round(Number(input.amount) * 100) / 100;
        if (!gameModes.has(mode) || !Number.isFinite(amount) || amount < 0.01) return json(res, 400, { error: 'INVALID_BET', message: 'Проверьте сумму ставки.' });
        const result = await serializeMoney(async () => {
          const round = roundFor(mode); await settleRound(round);
          if (round.status === 'finished' || (round.status === 'countdown' && Date.now() >= Number(round.startAt))) return { error: 'ROUND_CLOSED', message: 'Раунд уже закрыт.' };
          const wallet = account(String(user.id)); if (Number(wallet.balance) < amount) return { error: 'INSUFFICIENT_BALANCE', message: 'Недостаточно средств.' };
          wallet.balance = (Number(wallet.balance) - amount).toFixed(6); wallet.wagerRemaining = Math.max(0, Number(wallet.wagerRemaining) - amount).toFixed(6);
          const id = String(user.id); const existing = round.players[id];
          round.players[id] = { id, name: user.first_name || user.username || `Игрок ${id.slice(-4)}`, username: user.username, photoUrl: user.photo_url, amount: (Number(existing?.amount || 0) + amount).toFixed(6) };
          round.bank = (Number(round.bank) + amount).toFixed(6);
          if (Object.keys(round.players).length >= 2 && !round.startAt) { round.status = 'countdown'; round.startAt = Date.now() + 15000; }
          recordTransaction({ userId: id, type: 'bet', amount: -amount, balanceAfter: wallet.balance, description: `Ставка · ${mode}`, reference: round.id }); await persist();
          return { balance: wallet.balance, wagerRemaining: wallet.wagerRemaining, round: publicRound(round) };
        });
        return json(res, result.error ? 409 : 201, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/promos/redeem') {
        const input = JSON.parse(await getBody(req) || '{}');
        const code = String(input.code || '').trim().toUpperCase();
        const result = await serializeMoney(async () => {
          const promo = db.promos[code];
          const wallet = account(String(user.id));
          if (!promo || !promo.active) return { error: 'PROMO_NOT_FOUND', message: 'Промокод не найден или отключён.' };
          if (wallet.redeemedPromos.includes(code)) return { error: 'PROMO_ALREADY_USED', message: 'Вы уже использовали этот промокод.' };
          if (promo.used >= promo.limit) return { error: 'PROMO_LIMIT_REACHED', message: 'Лимит активаций исчерпан.' };
          wallet.balance = (Number(wallet.balance) + Number(promo.amount)).toFixed(6);
          wallet.wagerRemaining = (Number(wallet.wagerRemaining) + Number(promo.wager || 0)).toFixed(6);
          wallet.redeemedPromos.push(code); promo.used += 1;
          recordTransaction({ userId: user.id, type: 'promo', amount: promo.amount, balanceAfter: wallet.balance, description: `Промокод ${code}`, reference: code });
          await persist();
          return { balance: wallet.balance, wagerRemaining: wallet.wagerRemaining, amount: promo.amount, code };
        });
        if (result.error) return json(res, 409, result);
        return json(res, 200, result);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!isAdmin(user)) return json(res, 403, { error: 'ADMIN_REQUIRED', message: 'Доступ только для администратора.' });
        if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
          const users = Object.entries(db.users).map(([id, value]) => ({ id, username: value.username, firstName: value.firstName, balance: value.balance, wagerRemaining: value.wagerRemaining || '0.000000', redeemedPromos: value.redeemedPromos?.length || 0 }));
          const promos = Object.values(db.promos).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return json(res, 200, { adminId: String(user.id), stats: { users: users.length, balance: users.reduce((sum, item) => sum + Number(item.balance), 0).toFixed(6), wager: users.reduce((sum, item) => sum + Number(item.wagerRemaining), 0).toFixed(6), paidInvoices: Object.values(db.invoices).filter(x => x.status === 'paid').length, payouts: Object.values(db.payouts).length }, users, promos, transactions: db.transactions.slice(0, 500), adminLog: db.adminLog.slice(0, 200) });
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/promos') {
          const input = JSON.parse(await getBody(req) || '{}');
          const code = String(input.code || '').trim().toUpperCase();
          const amount = Number(input.amount); const limit = Number(input.limit); const wager = Number(input.wager || 0);
          if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return json(res, 400, { error: 'INVALID_CODE', message: 'Код: 3–32 символа A–Z, 0–9, _ или -.' });
          if (!Number.isFinite(amount) || amount < 0.01 || amount > 10_000 || !Number.isFinite(wager) || wager < 0 || wager > 1_000_000 || !Number.isInteger(limit) || limit < 1 || limit > 100_000) return json(res, 400, { error: 'INVALID_PROMO' });
          if (db.promos[code]) return json(res, 409, { error: 'PROMO_EXISTS', message: 'Такой промокод уже существует.' });
          db.promos[code] = { code, amount: amount.toFixed(6), wager: wager.toFixed(6), limit, used: 0, active: true, createdAt: new Date().toISOString(), createdBy: String(user.id) };
          db.adminLog.unshift({ action: 'promo.create', code, adminId: String(user.id), at: new Date().toISOString() }); await persist();
          return json(res, 201, db.promos[code]);
        }
        const toggle = url.pathname.match(/^\/api\/admin\/promos\/([^/]+)\/toggle$/);
        if (req.method === 'POST' && toggle) {
          const code = decodeURIComponent(toggle[1]).toUpperCase(); const promo = db.promos[code];
          if (!promo) return json(res, 404, { error: 'PROMO_NOT_FOUND' });
          promo.active = !promo.active; db.adminLog.unshift({ action: 'promo.toggle', code, active: promo.active, adminId: String(user.id), at: new Date().toISOString() }); await persist();
          return json(res, 200, promo);
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/balance') {
          const input = JSON.parse(await getBody(req) || '{}');
          const userId = String(input.userId || '').trim(); const amount = Number(input.amount); const reason = String(input.reason || '').trim().slice(0, 160);
          if (!/^\d{4,20}$/.test(userId) || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000 || reason.length < 3) return json(res, 400, { error: 'INVALID_ADJUSTMENT', message: 'Проверьте ID, сумму и причину.' });
          const result = await serializeMoney(async () => {
            const wallet = account(userId); const next = Number(wallet.balance) + amount;
            if (next < 0) return null;
            wallet.balance = next.toFixed(6);
            recordTransaction({ userId, type: amount > 0 ? 'admin_credit' : 'admin_debit', amount, balanceAfter: wallet.balance, description: reason, adminId: String(user.id) });
            db.adminLog.unshift({ action: 'balance.adjust', userId, amount: amount.toFixed(6), reason, adminId: String(user.id), at: new Date().toISOString() }); await persist();
            return { userId, balance: wallet.balance };
          });
          if (!result) return json(res, 409, { error: 'INSUFFICIENT_BALANCE', message: 'Нельзя увести баланс ниже нуля.' });
          return json(res, 200, result);
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/deposits') {
        if (!paymentsEnabled) return json(res, 503, { error: 'PAYMENTS_NOT_CONFIGURED', message: 'Пополнения пока не настроены.' });
        const input = JSON.parse(await getBody(req) || '{}');
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount < 0.1 || amount > 10_000) return json(res, 400, { error: 'INVALID_AMOUNT' });
        const idempotencyKey = randomUUID();
        const result = await pay.createInvoice({ amount: amount.toFixed(6), asset: 'USDT', description: 'Пополнение BOR DROP', payload: `deposit:${user.id}:${idempotencyKey}`, expiresIn: 3600 }, idempotencyKey);
        const invoice = normalizeInvoice(result);
        if (!invoice?.id) throw new Error('FK Pay response has no invoice id');
        db.invoices[invoice.id] = { userId: String(user.id), amount: amount.toFixed(6), status: invoice.status || 'active', idempotencyKey, createdAt: new Date().toISOString() };
        await persist();
        return json(res, 201, { id: invoice.id, status: invoice.status, paymentUrl: invoice.telegramUrl || invoice.paymentUrl || invoice.payUrl });
      }
      if (req.method === 'POST' && url.pathname === '/api/withdrawals') {
        if (!paymentsEnabled) return json(res, 503, { error: 'PAYMENTS_NOT_CONFIGURED', message: 'Выводы пока не настроены.' });
        const input = JSON.parse(await getBody(req) || '{}');
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount < 0.1 || amount > 10_000) return json(res, 400, { error: 'INVALID_AMOUNT' });
        if (!user.username) return json(res, 400, { error: 'TELEGRAM_USERNAME_REQUIRED', message: 'Установите @username в Telegram для получения выплаты.' });
        const fixedAmount = amount.toFixed(6);
        const payout = await serializeMoney(async () => {
          const wallet = account(String(user.id));
          if (Number(wallet.balance) < amount) return { insufficient: true };
          if (Number(wallet.wagerRemaining) > 0) return { wager: wallet.wagerRemaining };
          const idempotencyKey = FKPay.idempotencyKey();
          const localId = randomUUID();
          wallet.balance = (Number(wallet.balance) - amount).toFixed(6);
          db.payouts[localId] = { userId: String(user.id), recipient: `@${user.username}`, amount: fixedAmount, status: 'processing', idempotencyKey, createdAt: new Date().toISOString() };
          await persist();
          try {
            const remote = await pay.createPayout({ recipient: `@${user.username}`, amount: fixedAmount, description: 'Вывод BOR DROP', payload: `withdrawal:${localId}` }, idempotencyKey);
            const value = remote?.payout || remote?.data?.payout || remote?.data || remote;
            db.payouts[localId].remoteId = value?.id;
            db.payouts[localId].status = value?.status || 'processing';
            recordTransaction({ userId: user.id, type: 'withdrawal', amount: -amount, balanceAfter: wallet.balance, description: 'Автовывод FK Pay', reference: value?.id || localId });
            await persist();
            return { id: value?.id || localId, status: db.payouts[localId].status, balance: wallet.balance };
          } catch (error) {
            wallet.balance = (Number(wallet.balance) + amount).toFixed(6);
            db.payouts[localId].status = 'failed';
            db.payouts[localId].error = error.message;
            await persist();
            throw error;
          }
        });
        if (payout.insufficient) return json(res, 409, { error: 'INSUFFICIENT_BALANCE', message: 'Недостаточно средств.' });
        if (payout.wager) return json(res, 409, { error: 'WAGER_REQUIRED', message: `Осталось отыграть ${Number(payout.wager).toFixed(2)} USDT.` });
        return json(res, 201, payout);
      }
      const match = url.pathname.match(/^\/api\/deposits\/([^/]+)$/);
      if (req.method === 'GET' && match) {
        if (!paymentsEnabled) return json(res, 503, { error: 'PAYMENTS_NOT_CONFIGURED' });
        const id = decodeURIComponent(match[1]); const local = db.invoices[id];
        if (!local || local.userId !== String(user.id)) return json(res, 404, { error: 'NOT_FOUND' });
        const remote = normalizeInvoice(await pay.getInvoice(id));
        await creditPaidInvoice(remote);
        return json(res, 200, { id, status: db.invoices[id].status, balance: account(String(user.id)).balance });
      }
      return json(res, 404, { error: 'NOT_FOUND' });
    }
    if (req.method === 'GET' && url.pathname === '/payments.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(paymentsScript);
    }
    if (req.method === 'GET' && url.pathname === '/games.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(gamesScript);
    }
    if (req.method === 'GET' && url.pathname === '/admin.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(adminScript);
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/admin') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(req.method === 'HEAD' ? undefined : adminPage);
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(req.method === 'HEAD' ? undefined : page);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
  } catch (error) {
    console.error(error);
    json(res, error.status && error.status < 500 ? error.status : 500, { error: 'REQUEST_FAILED', message: 'Не удалось выполнить операцию. Попробуйте ещё раз позже.' });
  }
});
server.requestTimeout = 15_000; server.headersTimeout = 10_000;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramApi = telegramToken ? `https://api.telegram.org/bot${telegramToken}` : null;
let telegramOffset = 0;
async function telegramCall(method, body) {
  const response = await fetch(`${telegramApi}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!value.ok) throw new Error(`Telegram ${method}: ${value.description || response.status}`);
  return value.result;
}
async function answerTelegramMessage(message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;
  const name = message.from?.first_name || 'игрок';
  await telegramCall('sendMessage', {
    chat_id: chatId,
    text: `🎃 Привет, ${name}!\n\nДобро пожаловать в BOR DROP. Выигрывай и выводи!`,
    reply_markup: { inline_keyboard: [[{ text: '🎃 Открыть BOR DROP', web_app: { url: 'https://bor-drop.bothost.tech/' } }]] }
  });
}
async function pollTelegram() {
  if (!telegramApi) return;
  for (;;) {
    try {
      const updates = await telegramCall('getUpdates', { offset: telegramOffset, timeout: 25, allowed_updates: ['message'] });
      for (const update of updates) {
        telegramOffset = Math.max(telegramOffset, Number(update.update_id) + 1);
        if (update.message?.text) await answerTelegramMessage(update.message);
      }
    } catch (error) {
      console.error(error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}
async function initializeTelegram() {
  if (!telegramApi) return;
  try {
    await telegramCall('deleteWebhook', { drop_pending_updates: false });
    await telegramCall('setChatMenuButton', { menu_button: { type: 'web_app', text: '🎃 Открыть BOR DROP', web_app: { url: 'https://bor-drop.bothost.tech/' } } });
    await telegramCall('setMyCommands', { commands: [{ command: 'start', description: 'Запустить BOR DROP' }] });
    console.log('Telegram bot ready: @BOR_DROP_BOT');
    pollTelegram();
  } catch (error) {
    console.error(`Telegram init: ${error.message}`);
  }
}

server.listen(port, host, () => {
  console.log(`BOR DROP: http://${host}:${port} (FK Pay ${paymentsEnabled ? 'enabled' : 'not configured'})`);
  initializeTelegram();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

