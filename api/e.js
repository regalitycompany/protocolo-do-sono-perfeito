import { sql, clean, signSid, CHECKOUT_URL, SITE_URL } from './_lib/core.js';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const DISCOUNT_HOURS = 48;

// Rastreia os e-mails de recuperação: ?a=click | open | unsub
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const a = q.get('a');
  const sid = clean(q.get('s'), 64);
  const step = Number(q.get('e')) || null;

  if (!sid) return Response.redirect(SITE_URL, 302);

  if (a === 'open') {
    await sql`INSERT INTO events (sid, name, props) VALUES (${sid}, 'email_open', ${JSON.stringify({ step })}::jsonb)`;
    return new Response(GIF, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' } });
  }

  if (a === 'unsub') {
    if (q.get('t') === signSid(sid)) {
      await sql`UPDATE leads SET unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE sid = ${sid}`;
      await sql`INSERT INTO events (sid, name, props) VALUES (${sid}, 'email_unsub', ${JSON.stringify({ step })}::jsonb)`;
    }
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Arial;padding:40px;text-align:center;background:#faf8f3">Pronto, você não vai mais receber estes e-mails.</body>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  // click: devolve pro checkout mantendo as UTMs originais do anúncio (pra UTMify
  // continuar creditando a venda à campanha) e marcando a origem no src.
  const [lead] = await sql`SELECT * FROM leads WHERE sid = ${sid}`;
  await sql`INSERT INTO events (sid, name, props) VALUES (${sid}, 'email_click', ${JSON.stringify({ step })}::jsonb)`;

  const url = new URL(CHECKOUT_URL);
  url.searchParams.set('sck', sid);
  url.searchParams.set('src', `email${step || ''}`);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    if (lead?.[k]) url.searchParams.set(k, lead[k]);
  }
  const coupon = process.env.RECOVERY_COUPON;
  const inWindow = lead?.email3_at && Date.now() - new Date(lead.email3_at).getTime() < DISCOUNT_HOURS * 3600e3;
  if (step === 3 && coupon && inWindow) url.searchParams.set('coupon', coupon);

  return Response.redirect(url.toString(), 302);
}
