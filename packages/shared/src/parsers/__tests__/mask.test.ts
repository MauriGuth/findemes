import { describe, expect, it } from 'vitest';

import { maskNotificationText } from '../mask.js';

// SYNTHETIC strings; they test the masking rules, not any real notification format.
describe('maskNotificationText', () => {
  it.each([
    ['CBU 0000003100012345678901', 'CBU [CUENTA]'],
    ['Tarjeta terminada en 4321', 'Tarjeta terminada en ****'],
    ['Cuenta ****9876', 'Cuenta ****'],
    ['DNI 30.123.456', 'DNI [DNI]'],
    ['CUIT 20-30123456-7', 'CUIT [CUIT]'],
    ['Enviaste a pepe.gomez.mp', 'Enviaste a [ALIAS]'],
    ['Transferencia de Juan Pérez', 'Transferencia de [NOMBRE]'],
    ['Pago a María José López', 'Pago a [NOMBRE]'],
  ])('%j → %j', (input, expected) => {
    expect(maskNotificationText(input)).toBe(expected);
  });

  it('keeps amounts and merchants', () => {
    expect(maskNotificationText('Pagaste $1.234.567,89 en Supermercado Norte')).toBe(
      'Pagaste $1.234.567,89 en Supermercado Norte',
    );
    expect(maskNotificationText('Compra US$ 25,00 en Tienda')).toBe('Compra US$ 25,00 en Tienda');
  });
});
