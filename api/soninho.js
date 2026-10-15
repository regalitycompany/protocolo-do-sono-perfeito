import { json } from './_lib/core.js';

// Acesso ao Meu Soninho. A chave vai no link que a Wiapy manda por e-mail depois da compra:
// SONINHO_KEY_FULL = R$47 (recalcula), SONINHO_KEY_ONE = R$27 (plano único).
export async function GET(req) {
  const k = new URL(req.url).searchParams.get('k') || '';
  const { SONINHO_KEY_FULL: full, SONINHO_KEY_ONE: one } = process.env;
  if (full && k === full) return json({ ok: true, plano: 'completo' });
  if (one && k === one) return json({ ok: true, plano: 'unico' });
  return json({ ok: false }, 403);
}
