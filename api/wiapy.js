import { sql, json, clean } from './_lib/core.js';

// Recebe o webhook da Wiapy. Por enquanto só grava o payload bruto pra mapear o formato.
export async function POST(req) {
  const raw = await req.text();
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    p = { _raw: raw };
  }
  await sql`
    INSERT INTO wiapy_webhooks (event_type, order_id, email, payload)
    VALUES (${clean(p.event || p.type || p.status, 80)}, ${clean(p.id || p.order_id, 80)}, null, ${JSON.stringify(p)}::jsonb)`;
  return json({ ok: true });
}
