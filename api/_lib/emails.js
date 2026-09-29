import nodemailer from 'nodemailer';
import { SITE_URL, signSid } from './core.js';

let transport;
function mailer() {
  transport ||= nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return transport;
}

const firstName = (name) => {
  const f = String(name || '').trim().split(/\s+/)[0];
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : '';
};

function layout({ preheader, body, cta, ctaUrl, footerNote, unsubUrl, openUrl }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #f2ede0">
<tr><td style="background:#0b1630;padding:22px 28px;color:#e8d080;font-family:Georgia,serif;font-size:18px;font-weight:bold;letter-spacing:.3px">🌙 Protocolo do Sono Perfeito</td></tr>
<tr><td style="padding:28px 28px 8px;font-size:16px;line-height:1.6">${body}</td></tr>
<tr><td align="center" style="padding:12px 28px 28px">
  <a href="${ctaUrl}" style="display:inline-block;background:#e8491f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:16px 30px;border-radius:10px">${cta}</a>
  <div style="font-size:13px;color:#6b7280;margin-top:12px">🔒 Pagamento seguro pela Kiwify · Garantia de 7 dias</div>
</td></tr>
${footerNote ? `<tr><td style="padding:0 28px 24px;font-size:14px;line-height:1.5;color:#6b7280">${footerNote}</td></tr>` : ''}
</table>
<div style="font-size:12px;color:#9ca3af;padding:16px;max-width:560px">
Você recebeu este e-mail porque começou sua inscrição no Protocolo do Sono Perfeito.
<a href="${unsubUrl}" style="color:#9ca3af">Não quero mais receber estes e-mails</a>.
</div>
<img src="${openUrl}" width="1" height="1" alt="" style="display:block;border:0">
</td></tr></table></body></html>`;
}

const STEPS = {
  1: (n) => ({
    subject: n ? `${n}, sua inscrição ficou pela metade` : 'Sua inscrição ficou pela metade',
    preheader: 'Seu acesso ao Protocolo do Sono Perfeito ainda está reservado.',
    cta: 'Concluir minha inscrição',
    body: `<p style="margin:0 0 14px">Oi${n ? ` ${n}` : ''},</p>
<p style="margin:0 0 14px">Vi que você começou sua inscrição no <strong>Protocolo do Sono Perfeito</strong>, mas o pagamento não chegou a ser concluído.</p>
<p style="margin:0 0 14px">Acontece muito: o Pix expira, o cartão recusa, ou o bebê acorda bem na hora 😅.</p>
<p style="margin:0 0 14px">Seu acesso continua disponível pelo mesmo valor, <strong>R$37</strong>, com o protocolo completo em 6 etapas e os bônus no app. É só clicar abaixo e terminar de onde parou:</p>`,
    footerNote: 'Se tiver dado algum problema no pagamento, é só responder este e-mail que a gente te ajuda.',
  }),
  2: (n) => ({
    subject: n ? `${n}, quantas noites iguais a essa você ainda quer enfrentar?` : 'Quantas noites iguais a essa você ainda quer enfrentar?',
    preheader: 'O que está por trás dos despertares, e o passo a passo pra mudar isso.',
    cta: 'Quero começar hoje à noite',
    body: `<p style="margin:0 0 14px">Oi${n ? ` ${n}` : ''},</p>
<p style="margin:0 0 14px">Ontem você chegou pertinho de começar o Protocolo do Sono Perfeito. Se ainda está em dúvida, entendo. Quando a gente está exausta, qualquer promessa parece mais uma coisa pra testar.</p>
<p style="margin:0 0 14px">Por isso o protocolo não é teoria. É um passo a passo prático:</p>
<ul style="margin:0 0 14px;padding-left:20px">
<li style="margin-bottom:6px"><strong>Descubra o que está sabotando as noites</strong> antes de mudar a rotina</li>
<li style="margin-bottom:6px"><strong>Use os ciclos de sono a seu favor</strong>, pra ele parar de acordar sempre no mesmo horário</li>
<li style="margin-bottom:6px"><strong>Monte a sequência noturna</strong> que sinaliza a hora de desacelerar</li>
<li style="margin-bottom:6px"><strong>Atravesse regressões</strong> (dentes, picos, viagens) sem perder o que conquistou</li>
<li><strong>Siga o cronograma dia a dia</strong> até seu bebê emendar horas seguidas de sono</li>
</ul>
<p style="margin:0 0 14px">E você tem <strong>7 dias de garantia</strong>: se não fizer sentido pra você, devolvemos 100% do valor. O risco é todo nosso.</p>`,
  }),
  3: (n) => ({
    subject: n ? `${n}, liberei o Protocolo por R$19,90 pra você` : 'Liberei o Protocolo por R$19,90 pra você',
    preheader: 'Condição especial, válida por 48 horas.',
    cta: 'Garantir por R$19,90',
    body: `<p style="margin:0 0 14px">Oi${n ? ` ${n}` : ''},</p>
<p style="margin:0 0 14px">Este é meu último e-mail sobre o assunto.</p>
<p style="margin:0 0 14px">Sei que às vezes o momento não é o ideal, e não quero que o valor seja o motivo de você continuar passando as noites em claro. Então liberei uma condição que não aparece na página:</p>
<p style="margin:0 0 14px;font-size:18px;text-align:center;background:#f2ede0;border-radius:10px;padding:16px">
<span style="text-decoration:line-through;color:#6b7280">R$37</span> &nbsp;→&nbsp; <strong style="color:#e8491f;font-size:24px">R$19,90</strong></p>
<p style="margin:0 0 14px">É o protocolo completo, com as 6 etapas e os bônus no app, e a mesma garantia de 7 dias.</p>
<p style="margin:0 0 14px"><strong>Esse valor vale por 48 horas</strong> a partir deste e-mail. Depois disso o link volta pro preço normal.</p>`,
  }),
};

export async function sendRecovery(step, lead) {
  const n = firstName(lead.name);
  const t = STEPS[step](n);
  const q = `s=${encodeURIComponent(lead.sid)}&e=${step}`;
  const unsubUrl = `${SITE_URL}/api/e?a=unsub&${q}&t=${signSid(lead.sid)}`;
  const html = layout({
    ...t,
    ctaUrl: `${SITE_URL}/api/e?a=click&${q}`,
    unsubUrl,
    openUrl: `${SITE_URL}/api/e?a=open&${q}`,
  });
  return mailer().sendMail({
    from: { name: 'Protocolo do Sono Perfeito', address: process.env.GMAIL_USER },
    to: lead.email,
    subject: t.subject,
    html,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
  });
}
