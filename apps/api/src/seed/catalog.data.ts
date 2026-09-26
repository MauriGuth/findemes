import { type SourceKind } from '@findemes/shared';

export interface SourceSeed {
  slug: string;
  name: string;
  kind: SourceKind;
  /**
   * Android package name, only once Mauricio verifies it (Play Store link of the app)
   * together with real notification samples. Never invented: without it the source is
   * not in the capture whitelist.
   */
  packageName?: string;
}

/**
 * Banks and wallets we plan to read. Package names verified 2026-09-26 against the
 * Play Store listing Mauricio sent (title and developer match the bank). Only the
 * personal-banking app of each bank: business apps (BBVA Empresas, Galicia Office)
 * would mix company money into the personal month.
 */
export const SOURCES: readonly SourceSeed[] = [
  {
    slug: 'mercado-pago',
    name: 'Mercado Pago',
    kind: 'WALLET',
    packageName: 'com.mercadopago.wallet',
  },
  { slug: 'uala', name: 'Ualá', kind: 'WALLET', packageName: 'ar.com.bancar.uala' },
  { slug: 'brubank', name: 'Brubank', kind: 'BANK', packageName: 'com.brubank' },
  { slug: 'naranja-x', name: 'Naranja X', kind: 'CARD' },
  { slug: 'modo', name: 'MODO', kind: 'WALLET' },
  { slug: 'personal-pay', name: 'Personal Pay', kind: 'WALLET' },
  { slug: 'lemon', name: 'Lemon', kind: 'WALLET' },
  { slug: 'galicia', name: 'Galicia', kind: 'BANK' },
  {
    slug: 'santander',
    name: 'Santander',
    kind: 'BANK',
    packageName: 'ar.com.santander.rio.mbanking',
  },
  { slug: 'bbva', name: 'BBVA', kind: 'BANK', packageName: 'com.bbva.nxt_argentina' },
  { slug: 'macro', name: 'Macro', kind: 'BANK' },
  { slug: 'bna', name: 'BNA+', kind: 'BANK' },
  { slug: 'cuenta-dni', name: 'Cuenta DNI', kind: 'WALLET' },
  { slug: 'bpn', name: 'BPN', kind: 'BANK' },
  { slug: 'icbc', name: 'ICBC', kind: 'BANK' },
  { slug: 'prex', name: 'Prex', kind: 'WALLET', packageName: 'air.PrexArgentina' },
];

export interface CategorySeed {
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
}

/** System categories (userId = null). Names are what the user sees; keep them short. */
export const CATEGORIES: readonly CategorySeed[] = [
  { slug: 'supermercado', name: 'Supermercado', icon: '🛒', sortOrder: 10 },
  { slug: 'comida', name: 'Comida y delivery', icon: '🍔', sortOrder: 20 },
  { slug: 'transporte', name: 'Transporte y nafta', icon: '🚗', sortOrder: 30 },
  { slug: 'vivienda', name: 'Alquiler y expensas', icon: '🏠', sortOrder: 40 },
  { slug: 'servicios', name: 'Luz, gas, agua, internet, celu', icon: '💡', sortOrder: 50 },
  { slug: 'salud', name: 'Salud y farmacia', icon: '💊', sortOrder: 60 },
  { slug: 'educacion', name: 'Educación', icon: '📚', sortOrder: 70 },
  { slug: 'entretenimiento', name: 'Salidas y entretenimiento', icon: '🎉', sortOrder: 80 },
  { slug: 'suscripciones', name: 'Suscripciones', icon: '📺', sortOrder: 90 },
  { slug: 'ropa', name: 'Ropa y calzado', icon: '👕', sortOrder: 100 },
  { slug: 'hogar', name: 'Hogar', icon: '🛋️', sortOrder: 110 },
  { slug: 'cuotas', name: 'Cuotas y deudas', icon: '💳', sortOrder: 120 },
  { slug: 'tarjeta', name: 'Pago de resumen de tarjeta', icon: '🧾', sortOrder: 130 },
  { slug: 'ingresos', name: 'Sueldo e ingresos', icon: '💰', sortOrder: 140 },
  { slug: 'transferencias', name: 'Transferencias', icon: '🔁', sortOrder: 150 },
  { slug: 'otros', name: 'Otros', icon: '➕', sortOrder: 999 },
];
