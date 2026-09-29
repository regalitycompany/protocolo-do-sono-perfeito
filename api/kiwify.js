import crypto from 'node:crypto';
import { sql, json, clean, normEmail, normPhone, capi } from './_lib/core.js';

// A mesma conta Kiwify vende outros produtos; só processa o PSP (o payload bruto fica salvo de qualquer jeito).
const isPsp = (p) => {
  const id = process.env.KIWIFY_PRODUCT_ID;
  if (id && p.id) return p.id === id;
  return /sono/i.test(p.name || '');
};

export async function POST(req) {
  const raw = await req.text();
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  // A Kiwify assina com HMAC-SHA1(token, corpo) no ?signature=. Registramos o resultado
  // em vez de rejeitar, pra não perder venda se a assinatura mudar de formato.
  const token = process.env.KIWIFY_WEBHOOK_TOKEN;
  const sig = new URL(req.url).searchParams.get('signature');
  const signatureOk = token && sig
    ? crypto.createHmac('sha1', token).update(raw).digest('hex') === sig
    : null;

  const abandoned = p.status === 'abandoned' || (!p.order_id && p.checkout_link);
  const type = abandoned ? 'abandoned_cart' : p.webhook_event_type || p.order_status || 'unknown';
  const cust = p.Customer || {};
  const email = normEmail(abandoned ? p.email : cust.email);
  const phone = normPhone(abandoned ? p.phone : cust.mobile);
  const name = clean(abandoned ? p.name : cust.full_name, 120);
  const product = abandoned
    ? { id: p.product_id, name: p.product_name }
    : { id: p.Product?.product_id, name: p.Product?.product_name };

  await sql`
    INSERT INTO kiwify_webhooks (event_type, order_id, email, signature_ok, payload)
    VALUES (${type}, ${clean(p.order_id || p.id, 80)}, ${email}, ${signatureOk}, ${raw}::jsonb)`;

  if (!isPsp(product)) return json({ ok: true, ignored: 'other product' });

  // Acha o lead: primeiro pelo sck (sid que a LP manda pro checkout), depois pelo e-mail.
  const sck = clean(p.TrackingParameters?.sck, 64);
  let [lead] = sck ? await sql`SELECT sid, status FROM leads WHERE sid = ${sck}` : [];
  if (!lead && email) {
    [lead] = await sql`SELECT sid, status FROM leads WHERE lower(email) = ${email}
                       ORDER BY (status = 'paid') DESC, updated_at DESC LIMIT 1`;
  }
  const sid = lead?.sid || `kw_${clean(p.order_id || p.id, 60) || crypto.randomUUID()}`;
  const tp = p.TrackingParameters || {};

  if (!lead) {
    await sql`
      INSERT INTO leads (sid, name, email, phone, status, source, checkout_at,
                         utm_source, utm_medium, utm_campaign, utm_content, utm_term)
      VALUES (${sid}, ${name}, ${email}, ${phone}, 'checkout', 'kiwify_checkout',
              ${p.created_at ? new Date(p.created_at) : new Date()},
              ${clean(tp.utm_source)}, ${clean(tp.utm_medium)}, ${clean(tp.utm_campaign)},
              ${clean(tp.utm_content)}, ${clean(tp.utm_term)})
      ON CONFLICT (sid) DO NOTHING`;
  } else {
    await sql`UPDATE leads SET updated_at = now(),
                name  = COALESCE(leads.name, ${name}),
                email = COALESCE(leads.email, ${email}),
                phone = COALESCE(leads.phone, ${phone}),
                checkout_at = COALESCE(leads.checkout_at, now())
              WHERE sid = ${sid}`;
  }

  const status = abandoned ? 'abandoned' : p.order_status;
  const amount = Number(p.Commissions?.charge_amount) || null;

  if (status === 'paid') {
    await sql`UPDATE leads SET status = 'paid', paid_at = COALESCE(paid_at, now()),
                order_id = ${clean(p.order_id, 80)}, amount_cents = ${amount}
              WHERE sid = ${sid}`;
    // Desligado por padrão: a própria Kiwify manda o Purchase (navegador + API) pelo pixel do produto.
    if (process.env.SEND_PURCHASE_CAPI === '1') {
      await capi('Purchase', {
        eventId: `order_${p.order_id}`,
        lead: { sid, email, phone, name },
        custom: { currency: 'BRL', value: amount ? amount / 100 : 37 },
      });
    }
  } else if (status === 'refunded' || status === 'chargedback') {
    await sql`UPDATE leads SET status = 'refunded' WHERE sid = ${sid}`;
  } else if (status === 'waiting_payment') {
    await sql`UPDATE leads SET status = 'pix_pending' WHERE sid = ${sid} AND status NOT IN ('paid', 'refunded')`;
  } else if (status === 'refused') {
    await sql`UPDATE leads SET status = 'refused' WHERE sid = ${sid} AND status NOT IN ('paid', 'refunded')`;
  } else if (status === 'abandoned') {
    await sql`UPDATE leads SET status = 'checkout', source = CASE WHEN source = 'kiwify_checkout' THEN 'kiwify_abandon' ELSE source END
              WHERE sid = ${sid} AND status IN ('partial', 'lead', 'checkout')`;
  }

  return json({ ok: true, sid, status });
}
