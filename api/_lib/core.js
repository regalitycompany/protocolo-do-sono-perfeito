import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

export const sql = neon(process.env.DATABASE_URL);

export const PIXEL_ID = process.env.META_PIXEL_ID || '1078460701310585';
export const CHECKOUT_URL = 'https://pay.kiwify.com.br/P7ziSS2';
export const SITE_URL = process.env.SITE_URL || 'https://protocolodosonoperfeito.vercel.app';
export const PRICE = 37;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

export function normEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// Guarda só dígitos, sempre com DDI 55 (formato que o Meta e o wa.me esperam).
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 ? d : null;
}

export const clean = (v, max = 300) => (v == null || v === '' ? null : String(v).slice(0, max));

// Token assinado pro link de descadastro, pra ninguém descadastrar sid alheio.
export function signSid(sid) {
  return crypto.createHmac('sha256', process.env.CRON_SECRET || 'psp').update(sid).digest('hex').slice(0, 16);
}

// API de Conversões do Meta. Deduplica com o pixel do navegador pelo event_id.
export async function capi(eventName, { eventId, url, lead = {}, ip, ua, custom } = {}) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return { skipped: true };

  const user_data = { client_ip_address: ip || undefined, client_user_agent: ua || undefined };
  if (lead.email) user_data.em = [sha256(lead.email)];
  if (lead.phone) user_data.ph = [sha256(lead.phone)];
  if (lead.name) {
    const [fn, ...rest] = lead.name.trim().toLowerCase().split(/\s+/);
    user_data.fn = [sha256(fn)];
    if (rest.length) user_data.ln = [sha256(rest[rest.length - 1])];
  }
  if (lead.sid) user_data.external_id = [sha256(lead.sid)];
  if (lead.fbc) user_data.fbc = lead.fbc;
  if (lead.fbp) user_data.fbp = lead.fbp;
  user_data.country = [sha256('br')];

  const body = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: url || SITE_URL,
      action_source: 'website',
      user_data,
      custom_data: custom,
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error('capi', eventName, r.status, await r.text());
    return { ok: r.ok };
  } catch (e) {
    console.error('capi', eventName, e.message);
    return { ok: false };
  }
}
