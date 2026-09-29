import { sql, json, clientIp, clean, capi, PRICE } from './_lib/core.js';

// Eventos do navegador que também vão pro Meta pela API de Conversões
// (mesmo event_id do fbq, então o Meta deduplica).
const SERVER_SIDE = {
  page_view: 'PageView',
  view_content: 'ViewContent',
  initiate_checkout: 'InitiateCheckout',
};

export async function POST(req) {
  let body;
  try {
    body = JSON.parse(await req.text()); // sendBeacon manda text/plain
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const sid = clean(body.sid, 64);
  const events = Array.isArray(body.events) ? body.events.slice(0, 30) : [];
  if (!sid || !events.length) return json({ error: 'missing sid/events' }, 400);

  const ctx = body.ctx || {};
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  const rows = events.map((e) => ({
    sid,
    name: clean(e.name, 60),
    props: e.props ? JSON.stringify(e.props).slice(0, 2000) : null,
    url: clean(e.url, 500),
  })).filter((r) => r.name);

  await sql`
    INSERT INTO events (sid, name, props, url, utm_source, utm_campaign, utm_content)
    SELECT ${sid}, r->>'name', (r->>'props')::jsonb, r->>'url',
           ${clean(ctx.utm_source)}, ${clean(ctx.utm_campaign)}, ${clean(ctx.utm_content)}
    FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r`;

  const serverEvents = events.filter((e) => SERVER_SIDE[e.name] && e.eventId);
  if (serverEvents.length) {
    const [lead] = await sql`SELECT sid, name, email, phone, fbc, fbp FROM leads WHERE sid = ${sid}`;
    const who = lead || { sid, fbc: clean(ctx.fbc), fbp: clean(ctx.fbp) };
    await Promise.all(serverEvents.map((e) =>
      capi(SERVER_SIDE[e.name], {
        eventId: e.eventId,
        url: e.url,
        lead: who,
        ip,
        ua,
        custom: e.name === 'page_view' ? undefined
          : { currency: 'BRL', value: PRICE, content_name: 'Protocolo do Sono Perfeito', content_type: 'product' },
      })));
  }

  return json({ ok: true });
}
