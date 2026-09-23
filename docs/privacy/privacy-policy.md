# Política de privacidad de Findemes (borrador, Fase 2)

_Borrador para revisión. La versión publicada (requisito de Google Play y App Store) sale de este texto en la Fase 5, con la URL pública de solicitud de borrado que pide Google Play._

**Responsable:** Nova Solutions SAS, Neuquén, Argentina.

## Qué guardamos

- Tu mail, para entrar (te mandamos un código) y para avisarte cosas de tu cuenta. Sin contraseña.
- Los movimientos, compromisos y planes mensuales que cargás, para calcular cuánto te queda hasta el 1.
- Un identificador del dispositivo y la versión de la app, para mantener tu sesión.

- Si activás la **captura automática** (Android): el texto de las notificaciones de los bancos y billeteras de nuestra lista, para convertirlo en movimientos.

No guardamos contraseñas, contactos, ubicación ni mensajes. La captura automática nunca lee notificaciones de apps que no estén en la lista (WhatsApp, mensajes, mails, redes sociales): el teléfono las descarta antes de mirarlas.

## Para qué

Solamente para que la app funcione: calcular el número de la pantalla principal, mostrarte tus movimientos y recordarte cuánto te queda. No vendemos ni compartimos tus datos, y no los usamos para publicidad.

## Quién más los toca

- **Resend** (Resend, Inc., Estados Unidos) envía el mail con el código de acceso. Conserva el mensaje hasta 30 días en servidores fuera de Argentina. Solo recibe tu mail y el código.
- **Railway** (Railway Corp., Estados Unidos) aloja la API y la base de datos.
- **Anthropic** (Anthropic, PBC, Estados Unidos): cuando no reconocemos el formato de una notificación, le enviamos ese texto a Claude solo para extraer el monto, el comercio y el medio de pago. No le enviamos tu mail ni otros datos de tu cuenta.

## Cuánto tiempo

Mientras tengas cuenta. Los códigos de acceso vencen a los 10 minutos y se borran al día siguiente. Las sesiones vencen a los 180 días como máximo. El texto original de las notificaciones se guarda cifrado y se borra a los 30 días; el movimiento que generó queda hasta que lo borres.

## Tus derechos (Ley 25.326)

Podés acceder, corregir y suprimir tus datos. Desde **Ajustes → Eliminar mi cuenta** se borra todo en el momento y no se puede deshacer. Para cualquier otro pedido escribinos a la dirección de contacto de la ficha de la app.

La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende denuncias y reclamos por incumplimiento de las normas de protección de datos personales.

## El recordatorio diario

Se arma en tu teléfono con los datos que ya tenés cargados. No mandamos notificaciones desde nuestros servidores. En la pantalla de bloqueo no se muestran montos.

## Seguridad

Conexión cifrada (TLS), sesiones cortas con renovación automática, tokens guardados en el almacenamiento seguro del teléfono. Los registros del servidor no incluyen mails, códigos ni montos.
