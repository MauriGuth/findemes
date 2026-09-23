import { Text, View } from 'react-native';

/** Mirrors docs/privacy/privacy-policy.md; keep both in sync. */
const PARAGRAPHS = [
  'Findemes guarda los movimientos, compromisos y planes que cargás para calcular cuánto te queda hasta el 1. Nada más.',
  'Tu mail se usa solamente para entrar (te mandamos un código) y para avisarte cosas de tu cuenta. No lo compartimos ni lo usamos para publicidad.',
  'Los mails de acceso salen por Resend, un proveedor de envío de correo que guarda el mensaje hasta 30 días en servidores fuera de Argentina.',
  'El recordatorio diario se arma en tu teléfono con los datos que ya tenés cargados. No mandamos notificaciones desde nuestros servidores.',
  'Si activás la captura automática, leemos solo las notificaciones de los bancos y billeteras de nuestra lista; ninguna otra app. El texto viaja cifrado a nuestro servidor, se borra a los 30 días, y si no reconocemos el formato se lo pasamos a Claude (Anthropic) solo para leer el monto y el comercio.',
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
