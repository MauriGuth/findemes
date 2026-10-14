import { describe, expect, it } from 'vitest';

import { looksLikeSecurityCode } from '../security.js';

// SYNTHETIC texts: generic wording, not the format of any real bank.
describe('looksLikeSecurityCode', () => {
  it.each([
    'Tu código de verificación es 482913. No lo compartas.',
    'Clave de seguridad: 7741',
    'Ingresá el token 12345678 para confirmar',
    'Tu PIN temporal es 0921',
    'OTP 556677',
  ])('drops %s', (text) => {
    expect(looksLikeSecurityCode(text)).toBe(true);
  });

  it.each([
    'Pagaste $ 4.500 con tu clave en KIOSCO',
    'Transferiste $12.000,50. Código de operación 88213',
    'Recibiste US$ 100',
    'Ingresaste desde un nuevo dispositivo',
    'Tu código de descuento te espera',
    'Compraste por 2500 pesos en MERCADO',
  ])('keeps %s', (text) => {
    expect(looksLikeSecurityCode(text)).toBe(false);
  });
});
