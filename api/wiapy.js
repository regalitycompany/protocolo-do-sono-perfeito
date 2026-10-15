import crypto from 'node:crypto';
import { sql, json, clean, normEmail, normPhone, capi } from './_lib/core.js';

// Checkout do PSP na Wiapy. A mesma conta pode vender outros produtos; só processa este
// (o payload bruto fica salvo de qualquer jeito).
const PSP_CHECKOUT_ID = process.env.WIAPY_CHECKOUT_ID || '6a9b196770d6d30424523373';

// payment.status da Wiapy -> status do lead
const STATUS = {
  paid: 'paid',
  unpaid: 'pix_pending',
  refunded: 'refunded',
  chargedback: 'refunded',
  credit_card_declined: 'refused',
};

export async function POST(req) {
  const raw = await req.text();
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const pay = p.payment || null;
  const abandoned = !pay; // carrinho abandonado chega sem payment
  const type = abandoned ? 'abandoned_cart' : clean(pay.status, 40) || 'unknown';
  const cust = p.customer || {};
  const email = normEmail(cust.email);
  const phone = normPhone(cust.mobile_phone);
  const name = clean(cust.name, 120);
  const orderId = clean(pay?.id, 80);

  await sql`
    INSERT INTO wiapy_webhooks (event_type, order_id, email, payload)
    VALUES (${type}, ${orderId}, ${email}, ${raw}::jsonb)`;

  if (p.checkout?.id !== PSP_CHECKOUT_ID) return json({ ok: true, ignored: 'other checkout' });
  // O botão "Testar" da Wiapy manda dados fictícios com o checkout real: não vira lead nem recebe e-mail.
  if (/Evento de Teste/i.test(p.tracking?.useragent || '') || email === 'teste+wiapy@wiapy.com') {
    return json({ ok: true, ignored: 'test event' });
  }

  // Acha o lead: pelo sid se a Wiapy repassar sck/src, senão pelo e-mail.
  const tr = p.tracking || {};
  const sck = clean(tr.sck || tr.src, 64);
  let [lead] = sck ? await sql`SELECT sid FROM leads WHERE sid = ${sck}` : [];
  if (!lead && email) {
    [lead] = await sql`SELECT sid FROM leads WHERE lower(email) = ${email}
                       ORDER BY (status = 'paid') DESC, updated_at DESC LIMIT 1`;
  }
  const sid = lead?.sid || `wp_${orderId || crypto.randomUUID()}`;

  if (!lead) {
    await sql`
      INSERT INTO leads (sid, name, email, phone, status, source, checkout_at,
                         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                         fbc, fbp, ip, user_agent)
      VALUES (${sid}, ${name}, ${email}, ${phone}, 'checkout', 'wiapy_checkout',
              ${pay?.dt_create ? new Date(pay.dt_create) : new Date()},
              ${clean(tr.utm_source)}, ${clean(tr.utm_medium)}, ${clean(tr.utm_campaign)},
              ${clean(tr.utm_content)}, ${clean(tr.utm_term)},
              ${clean(tr.fbc)}, ${clean(tr.fbp)}, ${clean(tr.ip, 60)}, ${clean(tr.useragent)})
      ON CONFLICT (sid) DO NOTHING`;
  } else {
    await sql`UPDATE leads SET updated_at = now(),
                name  = COALESCE(leads.name, ${name}),
                email = COALESCE(leads.email, ${email}),
                phone = COALESCE(leads.phone, ${phone}),
                fbc   = COALESCE(leads.fbc, ${clean(tr.fbc)}),
                fbp   = COALESCE(leads.fbp, ${clean(tr.fbp)}),
                checkout_at = COALESCE(leads.checkout_at, now())
              WHERE sid = ${sid}`;
  }

  if (abandoned) {
    // entra na régua de recuperação (cron-recovery pega status 'checkout')
    await sql`UPDATE leads SET status = 'checkout',
                source = CASE WHEN source = 'wiapy_checkout' THEN 'wiapy_abandon' ELSE source END
              WHERE sid = ${sid} AND status IN ('partial', 'lead', 'checkout')`;
    return json({ ok: true, sid, status: 'abandoned' });
  }

  const status = STATUS[pay.status];
  const amount = Number(pay.amount) || null; // centavos, já com order bump

  if (status === 'paid') {
    await sql`UPDATE leads SET status = 'paid', paid_at = COALESCE(paid_at, now()),
                order_id = ${orderId}, amount_cents = ${amount}
              WHERE sid = ${sid}`;
    // Desligado por padrão: a integração Facebook da Wiapy manda o Purchase pelo pixel.
    if (process.env.SEND_PURCHASE_CAPI === '1') {
      await capi('Purchase', {
        eventId: `order_${orderId}`,
        lead: { sid, email, phone, name },
        custom: { currency: 'BRL', value: amount ? amount / 100 : 37 },
      });
    }
  } else if (status === 'refunded') {
    await sql`UPDATE leads SET status = 'refunded' WHERE sid = ${sid}`;
  } else if (status) {
    await sql`UPDATE leads SET status = ${status} WHERE sid = ${sid} AND status NOT IN ('paid', 'refunded')`;
  }

  return json({ ok: true, sid, status: status || pay.status });
}
