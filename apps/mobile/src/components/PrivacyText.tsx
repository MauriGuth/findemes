import { Text, View } from 'react-native';

/** Mirrors docs/privacy/privacy-policy.md; keep both in sync. */
const PARAGRAPHS = [
  'Findemes guarda los movimientos, compromisos y planes que cargás para calcular cuánto te queda hasta el 1. Nada más.',
  'Tu mail se usa solamente para entrar (te mandamos un código) y para avisarte cosas de tu cuenta. No lo compartimos ni lo usamos para publicidad.',
  'Los mails de acceso salen por Resend, un proveedor de envío de correo que guarda el mensaje hasta 30 días en servidores fuera de Argentina.',
  'El recordatorio diario se arma en tu teléfono con los datos que ya tenés cargados. No mandamos notificaciones desde nuestros servidores.',
  'Si activás la captura automática, leemos solo las notificaciones de los bancos y billeteras de nuestra lista; ninguna otra app. El texto viaja cifrado a nuestro servidor, se borra a los 30 días, y si no reconocemos el formato se lo pasamos a Claude (Anthropic) solo para leer el monto y el comercio.',
  'Si reenviás correos a tu dirección de Findemes, nos llegan a través de Postmark (que guarda una copia hasta 45 días) y los lee Claude (Anthropic), PDF incluidos, para sacar el monto y el vencimiento. Guardamos el texto cifrado y lo borramos a los 30 días. Nunca entramos a tu casilla.',
  'Si le sacás foto a un ticket, la foto se guarda en un almacenamiento privado (Cloudflare R2) y la lee Claude (Anthropic) para sacar el total y lo que compraste. Lo mismo con lo que escribís o dictás para cargar gastos. Se borra cuando borrás el ticket o tu cuenta.',
  'Si vinculás Telegram o WhatsApp, leemos solo lo que le mandás a Findemes por ese chat, y guardamos el identificador del chat para saber que sos vos. Esos mensajes pasan por Telegram o Meta.',
  'Podés borrar tu cuenta desde Ajustes. Se eliminan todos tus datos en el momento y no se puede deshacer.',
  'Tenés derecho a acceder, corregir y suprimir tus datos personales (Ley 25.326). Escribinos y lo resolvemos.',
];

export function PrivacyText() {
  return (
    <View className="gap-3">
      {PARAGRAPHS.map((text) => (
        <Text key={text} className="text-base leading-6 text-slate-300">
          {text}
        </Text>
      ))}
    </View>
  );
}
