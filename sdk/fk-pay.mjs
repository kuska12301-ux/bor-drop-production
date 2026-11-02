import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export class FKPay {
  constructor({ baseUrl, apiKey }) {
    if (!baseUrl || !apiKey) throw new Error('FK Pay is not configured');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }
  async request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(data.message || `FK Pay returned ${response.status}`);
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data;
  }
  createInvoice(input, idempotencyKey) {
    return this.request('/v1/invoices', { method: 'POST', body: input, idempotencyKey });
  }
  getInvoice(id) {
    return this.request(`/v1/invoices/${encodeURIComponent(id)}`);
  }
  createPayout(input, idempotencyKey = FKPay.idempotencyKey()) {
    return this.request('/v1/payouts', { method: 'POST', body: input, idempotencyKey });
  }
  getPayout(id) {
    return this.request(`/v1/payouts/${encodeURIComponent(id)}`);
  }
  static idempotencyKey() {
    return randomUUID();
  }
}

export function verifyFKWebhook({ secret, timestamp, signature, rawBody, maxAgeSeconds = 300 }) {
  if (!secret || !timestamp || !signature || !rawBody) return false;
  const eventTime = Number(timestamp) > 1e12 ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isFinite(eventTime) || Math.abs(Date.now() - eventTime) > maxAgeSeconds * 1000) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
