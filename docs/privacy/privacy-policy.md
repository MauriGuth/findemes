# Política de privacidad de Findemes (borrador, Fase 4)

_Borrador para revisión. La versión publicada (requisito de Google Play y App Store) sale de este texto en la Fase 5, con la URL pública de solicitud de borrado que pide Google Play._

**Responsable:** Nova Solutions SAS, Neuquén, Argentina.

## Qué guardamos

- Tu mail, para entrar (te mandamos un código) y para avisarte cosas de tu cuenta. Sin contraseña.
- Los movimientos, compromisos y planes mensuales que cargás, para calcular cuánto te queda hasta el 1.
- Un identificador del dispositivo y la versión de la app, para mantener tu sesión.

- Si activás la **captura automática** (Android): el texto de las notificaciones de los bancos y billeteras de nuestra lista, para convertirlo en movimientos.
- Si reenviás **correos** a tu dirección de Findemes: el remitente, el asunto, el texto y los PDF adjuntos de esos correos, para convertirlos en movimientos y en facturas por pagar. Solo nos llega lo que vos elegís reenviar; nunca accedemos a tu casilla.
- Si sacás o elegís una **foto de un ticket**: la foto y lo que leemos de ella (comercio, CUIT, fecha, total y lo que compraste), para cargar el gasto y su categoría.
- Si **escribís o dictás** lo que gastaste, o nos escribís por **Telegram o WhatsApp** después de vincular ese chat: el texto o la foto que nos mandás y el identificador de ese chat (tu número de WhatsApp o el id de tu chat de Telegram), para saber que es tu cuenta. Solo leemos lo que vos le mandás a Findemes.

No guardamos contraseñas, contactos, ubicación ni mensajes. La captura automática nunca lee notificaciones de apps que no estén en la lista (WhatsApp, mensajes, mails, redes sociales): el teléfono las descarta antes de mirarlas.

## Para qué

Solamente para que la app funcione: calcular el número de la pantalla principal, mostrarte tus movimientos y recordarte cuánto te queda. No vendemos ni compartimos tus datos, y no los usamos para publicidad.

## Quién más los toca

- **Resend** (Resend, Inc., Estados Unidos) envía el mail con el código de acceso. Conserva el mensaje hasta 30 días en servidores fuera de Argentina. Solo recibe tu mail y el código.
- **Railway** (Railway Corp., Estados Unidos) aloja la API y la base de datos.
- **Anthropic** (Anthropic, PBC, Estados Unidos): cuando no reconocemos el formato de una notificación, le enviamos ese texto a Claude solo para extraer el monto, el comercio y el medio de pago. Los correos que reenviás (texto y PDF adjuntos) también los lee Claude, para sacar el monto, el vencimiento y quién te lo cobra. No le enviamos tu mail ni otros datos de tu cuenta.
- Las **fotos de tickets** y lo que escribís para cargar gastos también los lee Claude, para sacar montos, comercios y categorías.
- **Cloudflare** (Cloudflare, Inc., Estados Unidos) guarda las fotos de los tickets en un almacenamiento privado (R2). Solo se pueden ver con un enlace firmado que vence en minutos.
- **Telegram** (Telegram Messenger Inc.) y **Meta** (WhatsApp, Meta Platforms, Inc.) transportan los mensajes que le mandás a Findemes por esos chats, según sus propias políticas.
- **Postmark** (ActiveCampaign, LLC, Estados Unidos) recibe los correos que reenviás a tu dirección de Findemes y nos los pasa. Conserva una copia hasta 45 días en sus servidores.

## Cuánto tiempo

Mientras tengas cuenta. Los códigos de acceso vencen a los 10 minutos y se borran al día siguiente. Las sesiones vencen a los 180 días como máximo. El texto original de las notificaciones y de los correos reenviados se guarda cifrado y se borra a los 30 días; el movimiento que generó queda hasta que lo borres. Las fotos de tickets quedan hasta que borres el ticket o tu cuenta.

## Tus derechos (Ley 25.326)

Podés acceder, corregir y suprimir tus datos. Desde **Ajustes → Eliminar mi cuenta** se borra todo en el momento y no se puede deshacer. Para cualquier otro pedido escribinos a la dirección de contacto de la ficha de la app.

La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende denuncias y reclamos por incumplimiento de las normas de protección de datos personales.

## El recordatorio diario

Se arma en tu teléfono con los datos que ya tenés cargados. No mandamos notificaciones desde nuestros servidores. En la pantalla de bloqueo no se muestran montos.

## Seguridad

Conexión cifrada (TLS), sesiones cortas con renovación automática, tokens guardados en el almacenamiento seguro del teléfono. Los registros del servidor no incluyen mails, códigos ni montos.
