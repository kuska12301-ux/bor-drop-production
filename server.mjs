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
const paymentUi = `<style>.payment-dialog{border:0;border-radius:22px;padding:24px;max-width:360px;width:calc(100% - 32px);box-shadow:0 24px 80px #10142633}.payment-dialog::backdrop{background:#11182788;backdrop-filter:blur(5px)}.dialog-close{float:right;background:#f1f3f7;border-radius:50%;width:32px;height:32px;font-size:20px}</style><dialog class="payment-dialog" id="deposit-dialog"><form method="dialog"><button class="dialog-close" aria-label="Закрыть">×</button></form><h2>Пополнение USDT</h2><p class="sub">Счёт создаётся через FK Pay. Оплата подтверждается в FK Wallet.</p><label class="smalltitle" for="deposit-amount">Сумма</label><div class="amount"><input id="deposit-amount" type="number" min="0.10" max="10000" step="0.01" value="10.00"><span class="unit">USDT</span></div><button class="primary" id="deposit-create">Создать счёт</button><p class="sub" id="deposit-status" role="status"></p></dialog><dialog class="payment-dialog" id="withdraw-dialog"><form method="dialog"><button class="dialog-close" aria-label="Закрыть">×</button></form><h2>Вывод USDT</h2><p class="sub">Автовыплата придёт на ваш @username в FK Wallet.</p><label class="smalltitle" for="withdraw-amount">Сумма</label><div class="amount"><input id="withdraw-amount" type="number" min="0.10" max="10000" step="0.01" value="5.00"><span class="unit">USDT</span></div><button class="primary" id="withdraw-create">Вывести</button><p class="sub" id="withdraw-status" role="status"></p></dialog><script src="/payments.js"></script>`;
const page = rawPage.includes('</body>')
  ? rawPage.replace('</body>', `${telegramSdk}${paymentUi}<script src="/games.js"></script></body>`)
  : rawPage.replace('</html>', `${telegramSdk}${paymentUi}<script src="/games.js"></script></html>`);
const dataDir = new URL('./data/', import.meta.url);
const dbFile = new URL('./data/ledger.json', import.meta.url);
await mkdir(dataDir, { recursive: true });
let db = { users: {}, invoices: {}, payouts: {}, promos: {}, transactions: [], webhookEvents: {}, adminLog: [] };
try { db = JSON.parse(await readFile(dbFile, 'utf8')); } catch {}
db.users ||= {}; db.invoices ||= {}; db.payouts ||= {}; db.promos ||= {}; db.transactions ||= []; db.webhookEvents ||= {}; db.adminLog ||= [];
let saveQueue = Promise.resolve();
function persist() {
  saveQueue = saveQueue.then(async () => {
    const temp = new URL('./data/ledger.tmp', import.meta.url);
    await writeFile(temp, JSON.stringify(db, null, 2));
    await rename(temp, dbFile);
  });
  return saveQueue;
}

const paymentsEnabled = Boolean(process.env.FK_PAY_BASE_URL && process.env.FK_PAY_API_KEY && process.env.FK_WEBHOOK_SECRET && process.env.TELEGRAM_BOT_TOKEN);
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
  return value;
};
const recordTransaction = ({ userId, type, amount, balanceAfter, description, reference, adminId }) => {
  const item = { id: randomUUID(), userId: String(userId), type, amount: Number(amount).toFixed(6), balanceAfter: Number(balanceAfter).toFixed(6), description, reference, adminId, createdAt: new Date().toISOString() };
  db.transactions.unshift(item); db.transactions = db.transactions.slice(0, 20_000); return item;
};
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
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', paymentsEnabled });
    if (req.method === 'POST' && url.pathname === '/api/fk/webhook') {
      if (!paymentsEnabled) return json(res, 503, { error: 'PAYMENTS_NOT_CONFIGURED' });
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
      if (!paymentsEnabled) return json(res, 503, { error: 'PAYMENTS_NOT_CONFIGURED', message: 'Set FK Pay and Telegram secrets on the server.' });
      const user = userFrom(req);
      if (!user?.id) return json(res, 401, { error: 'TELEGRAM_AUTH_REQUIRED' });
      const currentAccount = account(String(user.id));
      currentAccount.username = user.username || currentAccount.username;
      currentAccount.firstName = user.first_name || currentAccount.firstName;
      if (req.method === 'GET' && url.pathname === '/api/balance') return json(res, 200, { balance: currentAccount.balance, wagerRemaining: currentAccount.wagerRemaining, asset: 'USDT', isAdmin: isAdmin(user) });
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
    json(res, error.status || 500, { error: 'REQUEST_FAILED', message: error.message });
  }
});
server.requestTimeout = 15_000; server.headersTimeout = 10_000;
server.listen(port, host, () => console.log(`BOR DROP: http://${host}:${port} (FK Pay ${paymentsEnabled ? 'enabled' : 'not configured'})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
