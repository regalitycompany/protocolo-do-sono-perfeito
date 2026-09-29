import { sql, json, clientIp, clean, normEmail, normPhone, capi, PRICE } from './_lib/core.js';

// Etapas que o navegador reporta:
//   partial  -> digitou algum campo e ainda não enviou (salvo no blur, pra não perder quem desiste)
//   lead     -> enviou o formulário
//   checkout -> foi redirecionado pro checkout da Kiwify (entra na régua de recuperação)
const STAGES = ['partial', 'lead', 'checkout'];

export async function POST(req) {
  let b;
  try {
    b = JSON.parse(await req.text());
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const sid = clean(b.sid, 64);
  const stage = STAGES.includes(b.stage) ? b.stage : 'partial';
  if (!sid) return json({ error: 'missing sid' }, 400);

  const name = clean(b.name, 120);
  const email = normEmail(b.email);
  const phone = normPhone(b.phone);
  if (stage !== 'partial' && !email && !phone) return json({ error: 'email ou whatsapp obrigatório' }, 422);

  const c = b.ctx || {};
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  // Nunca rebaixa status: um lead pago continua pago mesmo que volte à LP.
  const [lead] = await sql`
    INSERT INTO leads (sid, name, email, phone, status, source, checkout_at,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, fbc, fbp, ip, user_agent, landing_url, referrer)
    VALUES (${sid}, ${name}, ${email}, ${phone}, ${stage}, ${clean(b.source, 30) || 'lp_form'},
      ${stage === 'checkout' ? new Date() : null},
      ${clean(c.utm_source)}, ${clean(c.utm_medium)}, ${clean(c.utm_campaign)}, ${clean(c.utm_content)}, ${clean(c.utm_term)},
      ${clean(c.fbclid)}, ${clean(c.fbc)}, ${clean(c.fbp)}, ${ip}, ${clean(ua, 400)}, ${clean(c.landing, 500)}, ${clean(c.referrer, 500)})
    ON CONFLICT (sid) DO UPDATE SET
      updated_at  = now(),
      name        = COALESCE(EXCLUDED.name, leads.name),
      email       = COALESCE(EXCLUDED.email, leads.email),
      phone       = COALESCE(EXCLUDED.phone, leads.phone),
      fbc         = COALESCE(EXCLUDED.fbc, leads.fbc),
      fbp         = COALESCE(EXCLUDED.fbp, leads.fbp),
      utm_source   = COALESCE(leads.utm_source, EXCLUDED.utm_source),
      utm_medium   = COALESCE(leads.utm_medium, EXCLUDED.utm_medium),
      utm_campaign = COALESCE(leads.utm_campaign, EXCLUDED.utm_campaign),
      utm_content  = COALESCE(leads.utm_content, EXCLUDED.utm_content),
      utm_term     = COALESCE(leads.utm_term, EXCLUDED.utm_term),
      fbclid       = COALESCE(leads.fbclid, EXCLUDED.fbclid),
      landing_url  = COALESCE(leads.landing_url, EXCLUDED.landing_url),
      referrer     = COALESCE(leads.referrer, EXCLUDED.referrer),
      status = CASE
        WHEN leads.status IN ('paid', 'refunded', 'pix_pending') THEN leads.status
        WHEN EXCLUDED.status = 'checkout' THEN 'checkout'
        WHEN EXCLUDED.status = 'lead' AND leads.status <> 'checkout' THEN 'lead'
        ELSE leads.status END,
      checkout_at = COALESCE(leads.checkout_at, EXCLUDED.checkout_at)
    RETURNING sid, name, email, phone, fbc, fbp, status`;

  const custom = { currency: 'BRL', value: PRICE, content_name: 'Protocolo do Sono Perfeito' };
  if (stage === 'lead' && b.eventId) {
    await capi('Lead', { eventId: b.eventId, url: c.url, lead, ip, ua, custom });
  }
  if (stage === 'checkout' && b.eventId) {
    await capi('InitiateCheckout', { eventId: b.eventId, url: c.url, lead, ip, ua, custom });
  }

  return json({ ok: true, status: lead.status });
}
