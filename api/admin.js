import crypto from 'node:crypto';
import { sql, json } from './_lib/core.js';

function authorized(req, q) {
  const given = req.headers.get('x-admin-key') || q.get('key') || '';
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || given.length !== real.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(real));
}

const FUNNEL = [
  ['page_view', 'Visitou a página'],
  ['scroll_50', 'Rolou 50%'],
  ['section_valor', 'Viu o preço'],
  ['cta_click', 'Clicou em comprar'],
  ['form_open', 'Abriu o formulário'],
  ['lead', 'Virou lead'],
  ['initiate_checkout', 'Foi pro checkout'],
];

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (!authorized(req, q)) return json({ error: 'unauthorized' }, 401);

  const days = Math.min(Math.max(Number(q.get('days')) || 7, 1), 365);
  const since = new Date(Date.now() - days * 864e5);
  const view = q.get('view') || 'summary';

  if (view === 'csv') {
    const rows = await sql`SELECT created_at, name, email, phone, status, source, checkout_at, paid_at,
        amount_cents, utm_source, utm_campaign, utm_content, email1_at, email2_at, email3_at, unsubscribed_at
      FROM leads WHERE created_at >= ${since} AND (email IS NOT NULL OR phone IS NOT NULL)
      ORDER BY created_at DESC`;
    const cols = Object.keys(rows[0] || { created_at: 1 });
    const esc = (v) => (v == null ? '' : `"${String(v instanceof Date ? v.toISOString() : v).replace(/"/g, '""')}"`);
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    return new Response('﻿' + csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="leads-psp-${days}d.csv"`,
      },
    });
  }

  if (view === 'leads') {
    const rows = await sql`SELECT sid, created_at, name, email, phone, status, source, checkout_at, paid_at,
        utm_campaign, utm_content, email1_at, email2_at, email3_at, unsubscribed_at,
        (SELECT max((props->>'percent')::int) FROM events e WHERE e.sid = leads.sid AND e.name LIKE 'scroll_%') AS max_scroll
      FROM leads WHERE created_at >= ${since} AND (email IS NOT NULL OR phone IS NOT NULL)
      ORDER BY created_at DESC LIMIT 1000`;
    return json({ rows });
  }

  const names = FUNNEL.map(([n]) => n);
  const [funnelRows, statusRows, emailRows, recovered, leaves, byAd, sections] = await Promise.all([
    sql`SELECT name, count(DISTINCT sid)::int AS n FROM events
        WHERE ts >= ${since} AND name = ANY(${names}) GROUP BY name`,
    sql`SELECT status, count(*)::int AS n, coalesce(sum(amount_cents), 0)::int AS cents FROM leads
        WHERE created_at >= ${since} AND (email IS NOT NULL OR phone IS NOT NULL OR status = 'paid') GROUP BY status`,
    sql`SELECT step,
          (SELECT count(*) FROM email_log g WHERE g.step = s.step AND g.ok AND g.ts >= ${since})::int AS sent,
          (SELECT count(DISTINCT sid) FROM events e WHERE e.name = 'email_open' AND (e.props->>'step')::int = s.step AND e.ts >= ${since})::int AS opened,
          (SELECT count(DISTINCT sid) FROM events e WHERE e.name = 'email_click' AND (e.props->>'step')::int = s.step AND e.ts >= ${since})::int AS clicked
        FROM (VALUES (1), (2), (3)) s(step)`,
    sql`SELECT count(*)::int AS n, coalesce(sum(amount_cents), 0)::int AS cents FROM leads
        WHERE status = 'paid' AND email1_at IS NOT NULL AND paid_at > email1_at AND paid_at >= ${since}`,
    // Onde as pessoas saem da página (última seção vista no page_leave)
    sql`SELECT coalesce(props->>'last_section', '(topo)') AS section, count(*)::int AS n,
               round(avg((props->>'max_scroll')::int))::int AS avg_scroll,
               round(avg((props->>'seconds')::int))::int AS avg_seconds
        FROM events WHERE name = 'page_leave' AND ts >= ${since}
        GROUP BY 1 ORDER BY n DESC LIMIT 20`,
    sql`SELECT coalesce(v.utm_content, '(sem utm)') AS ad,
               count(DISTINCT v.sid)::int AS visits,
               count(DISTINCT l.sid) FILTER (WHERE l.email IS NOT NULL OR l.phone IS NOT NULL)::int AS leads,
               count(DISTINCT l.sid) FILTER (WHERE l.checkout_at IS NOT NULL)::int AS checkouts,
               count(DISTINCT l.sid) FILTER (WHERE l.status = 'paid')::int AS sales
        FROM events v LEFT JOIN leads l ON l.sid = v.sid
        WHERE v.name = 'page_view' AND v.ts >= ${since}
        GROUP BY 1 ORDER BY visits DESC LIMIT 30`,
    sql`SELECT substring(name from 9) AS section, count(DISTINCT sid)::int AS n FROM events
        WHERE name LIKE 'section_%' AND ts >= ${since} GROUP BY 1 ORDER BY n DESC`,
  ]);

  const counts = Object.fromEntries(funnelRows.map((r) => [r.name, r.n]));
  return json({
    days,
    funnel: FUNNEL.map(([key, label]) => ({ key, label, n: counts[key] || 0 })),
    status: statusRows,
    emails: emailRows,
    recovered: recovered[0],
    leaves,
    byAd,
    sections,
  });
}
