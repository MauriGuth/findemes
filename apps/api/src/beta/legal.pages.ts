import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { markdownToHtml } from './markdown.js';

/** docs/privacy ships next to the API (Dockerfile) and is read once at boot. */
function readDoc(name: string): string | null {
  for (const base of [process.cwd(), resolve(process.cwd(), '..', '..')]) {
    try {
      return readFileSync(resolve(base, 'docs', 'privacy', name), 'utf8');
    } catch {
      // try the next base
    }
  }
  return null;
}

const STYLE = `body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px 64px;line-height:1.55;color:#0f172a;background:#fff}
h1{font-size:1.6rem}h2{font-size:1.2rem;margin-top:2rem}a{color:#15803d}
input,button{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;width:100%;box-sizing:border-box;margin:6px 0}
button{background:#22c55e;border:0;color:#0f172a;font-weight:600;cursor:pointer}button.danger{background:#ef4444;color:#fff}
.box{border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:16px 0}.muted{color:#64748b;font-size:.9rem}
@media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}.box{border-color:#334155}a{color:#4ade80}}`;

export function page(title: string, body: string, script?: string): string {
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body>${body}${script ? `<script src="${script}"></script>` : ''}</body></html>`;
}

export function privacyPage(contact: string | undefined): string {
  const markdown = readDoc('privacy-policy.md');
  const body = markdown
    ? markdownToHtml(markdown)
    : '<h1>Política de privacidad</h1><p>No disponible por el momento.</p>';
  const footer = contact
    ? `<p class="muted">Contacto: <a href="mailto:${contact}">${contact}</a> · <a href="/legal/delete-account">Borrar tu cuenta</a></p>`
    : '<p class="muted"><a href="/legal/delete-account">Borrar tu cuenta</a></p>';
  return page('Findemes · Privacidad', `${body}${footer}`);
}

export function deleteAccountPage(contact: string | undefined): string {
  return page(
    'Findemes · Borrar tu cuenta',
    `<h1>Borrar tu cuenta de Findemes</h1>
<p>Desde la app: <strong>Ajustes → Eliminar mi cuenta</strong>. Si ya no tenés la app, podés hacerlo acá.</p>
<p>Se borran en el momento tu cuenta y todos tus datos: movimientos, compromisos, facturas, presupuestos, tickets y sus fotos, textos de notificaciones y correos, y chats vinculados. No se puede deshacer y no guardamos copia.</p>
<div class="box" id="step1"><label for="email">Tu mail</label><input id="email" type="email" autocomplete="email" placeholder="vos@ejemplo.com"><button id="send">Mandarme un código</button></div>
<div class="box" id="step2" hidden><label for="code">El código de 6 números que te mandamos</label><input id="code" inputmode="numeric" maxlength="6"><button id="confirm" class="danger">Borrar mi cuenta para siempre</button></div>
<p id="status" role="status"></p>
${contact ? `<p class="muted">¿Problemas? Escribinos a <a href="mailto:${contact}">${contact}</a>.</p>` : ''}
<p class="muted"><a href="/legal/privacy">Política de privacidad</a></p>`,
    '/legal/delete-account.js',
  );
}

/** Served as a file: the CSP (helmet) does not allow inline scripts. */
export const DELETE_ACCOUNT_SCRIPT = `(function(){
var $=function(id){return document.getElementById(id)};
var status=function(t){$('status').textContent=t};
var post=function(path,body,token){return fetch(path,{method:body?'POST':'DELETE',headers:Object.assign({'Content-Type':'application/json'},token?{Authorization:'Bearer '+token}:{}),body:body?JSON.stringify(body):undefined})};
$('send').onclick=function(){var email=$('email').value.trim();if(!email){return}
status('Mandando…');post('/auth/request-code',{email:email}).then(function(r){if(!r.ok)throw r;$('step2').hidden=false;status('Si la cuenta existe, te llegó un código a '+email+'.')}).catch(function(){status('No pudimos mandar el código. Probá en un rato.')})};
$('confirm').onclick=function(){var email=$('email').value.trim();var code=$('code').value.trim();
if(!confirm('¿Borrar tu cuenta y todos tus datos? No se puede deshacer.'))return;
status('Borrando…');post('/auth/verify-code',{email:email,code:code,device:{platform:'ANDROID',name:'Web: borrado de cuenta'}}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(s){return post('/me',null,s.accessToken)}).then(function(r){if(!r.ok)throw r;$('step1').hidden=true;$('step2').hidden=true;status('Listo: borramos tu cuenta y todos tus datos.')}).catch(function(){status('El código no es válido o venció. Pedí uno nuevo.')})};
})();`;
