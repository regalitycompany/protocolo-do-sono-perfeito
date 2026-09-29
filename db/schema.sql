-- Protocolo do Sono Perfeito — rastreamento de funil, leads e recuperação de carrinho

-- Um lead por sessão de navegador (sid). Nasce parcial (só um campo digitado)
-- e evolui: lead -> checkout -> paid/refunded.
CREATE TABLE IF NOT EXISTS leads (
  sid             text PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  name            text,
  email           text,
  phone           text,
  status          text NOT NULL DEFAULT 'partial', -- partial | lead | checkout | pix_pending | paid | refunded | refused
  source          text NOT NULL DEFAULT 'lp_form', -- lp_form | exit_intent | kiwify_abandon
  checkout_at     timestamptz,
  paid_at         timestamptz,
  order_id        text,
  amount_cents    integer,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  fbc             text,
  fbp             text,
  ip              text,
  user_agent      text,
  landing_url     text,
  referrer        text,
  email1_at       timestamptz,
  email2_at       timestamptz,
  email3_at       timestamptz,
  unsubscribed_at timestamptz
);
CREATE INDEX IF NOT EXISTS leads_email_idx  ON leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status, checkout_at);

-- Todo evento de navegação (inclusive de visitante anônimo que sai sem virar lead).
CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  ts         timestamptz NOT NULL DEFAULT now(),
  sid        text NOT NULL,
  name       text NOT NULL,
  props      jsonb,
  url        text,
  utm_source text,
  utm_campaign text,
  utm_content  text
);
CREATE INDEX IF NOT EXISTS events_name_ts_idx ON events (name, ts);
CREATE INDEX IF NOT EXISTS events_sid_idx     ON events (sid);

-- Payload bruto de todo webhook da Kiwify (auditoria / reprocessamento).
CREATE TABLE IF NOT EXISTS kiwify_webhooks (
  id           bigserial PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now(),
  event_type   text,
  order_id     text,
  email        text,
  signature_ok boolean,
  payload      jsonb NOT NULL
);

-- Log de e-mails de recuperação.
CREATE TABLE IF NOT EXISTS email_log (
  id        bigserial PRIMARY KEY,
  ts        timestamptz NOT NULL DEFAULT now(),
  sid       text NOT NULL,
  step      smallint NOT NULL,
  email     text NOT NULL,
  ok        boolean NOT NULL,
  error     text
);
