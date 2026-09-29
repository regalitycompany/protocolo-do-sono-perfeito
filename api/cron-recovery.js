import { sql, json } from './_lib/core.js';
import { sendRecovery } from './_lib/emails.js';

// Régua de recuperação de carrinho (roda a cada 10 min pelo Vercel Cron):
//   e-mail 1: 1h depois de ir pro checkout sem comprar
//   e-mail 2: 24h depois
//   e-mail 3: 48h depois, com o cupom de R$19,90
// Só envia enquanto a compra não foi aprovada. Pix gerado e não pago e cartão recusado contam como abandono.
const MAX_PER_RUN = 40; // folga dentro do limite diário do Gmail
const MAX_FAILS = 3;

const UNPAID = ['checkout', 'pix_pending', 'refused'];

async function due(step) {
  if (step === 1) {
    return sql`
      SELECT l.* FROM leads l
      WHERE l.status = ANY(${UNPAID}) AND l.email IS NOT NULL AND l.unsubscribed_at IS NULL
        AND l.email1_at IS NULL
        AND l.checkout_at <= now() - interval '1 hour'
        AND l.checkout_at >  now() - interval '3 days'
        -- uma régua só por e-mail: se já comprou ou já está recebendo por outra sessão, pula
        AND NOT EXISTS (SELECT 1 FROM leads o WHERE lower(o.email) = lower(l.email) AND o.sid <> l.sid
                        AND (o.status IN ('paid', 'refunded') OR o.email1_at IS NOT NULL))
        AND (SELECT count(*) FROM email_log g WHERE g.sid = l.sid AND g.step = 1 AND NOT g.ok) < ${MAX_FAILS}
      ORDER BY l.checkout_at LIMIT ${MAX_PER_RUN}`;
  }
  const prev = step === 2 ? 'email1_at' : 'email2_at';
  const cur = step === 2 ? 'email2_at' : 'email3_at';
  const wait = step === 2 ? '24 hours' : '48 hours';
  return sql.query(`
    SELECT l.* FROM leads l
    WHERE l.status = ANY($1) AND l.unsubscribed_at IS NULL
      AND l.${prev} IS NOT NULL AND l.${cur} IS NULL
      AND l.checkout_at <= now() - interval '${wait}'
      AND l.${prev} <= now() - interval '12 hours'
      AND NOT EXISTS (SELECT 1 FROM leads o WHERE lower(o.email) = lower(l.email) AND o.status IN ('paid', 'refunded'))
      AND (SELECT count(*) FROM email_log g WHERE g.sid = l.sid AND g.step = $2 AND NOT g.ok) < $3
    ORDER BY l.checkout_at LIMIT $4`, [UNPAID, step, MAX_FAILS, MAX_PER_RUN]);
}

export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return json({ error: 'GMAIL_USER/GMAIL_APP_PASSWORD não configurados' }, 500);
  }

  const report = { 1: 0, 2: 0, 3: 0, failed: 0 };
  let budget = MAX_PER_RUN;

  for (const step of [1, 2, 3]) {
    if (budget <= 0) break;
    const col = `email${step}_at`;
    for (const lead of (await due(step)).slice(0, budget)) {
      // Marca antes de enviar pra uma execução sobreposta não mandar em dobro.
      const claimed = await sql.query(
        `UPDATE leads SET ${col} = now() WHERE sid = $1 AND ${col} IS NULL RETURNING sid`, [lead.sid]);
      if (!claimed.length) continue;
      budget--;
      try {
        await sendRecovery(step, lead);
        await sql`INSERT INTO email_log (sid, step, email, ok) VALUES (${lead.sid}, ${step}, ${lead.email}, true)`;
        report[step]++;
      } catch (e) {
        await sql.query(`UPDATE leads SET ${col} = NULL WHERE sid = $1`, [lead.sid]);
        await sql`INSERT INTO email_log (sid, step, email, ok, error)
                  VALUES (${lead.sid}, ${step}, ${lead.email}, false, ${String(e.message).slice(0, 500)})`;
        report.failed++;
      }
    }
  }
  return json({ ok: true, sent: report });
}
