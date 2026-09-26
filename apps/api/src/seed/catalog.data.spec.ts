import { describe, expect, it } from 'vitest';

import { SOURCES } from './catalog.data.js';

const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** Messaging apps must never reach the capture whitelist, whatever the data file says. */
const MESSAGING = [
  'com.whatsapp',
  'com.whatsapp.w4b',
  'org.telegram.messenger',
  'com.facebook.orca',
  'com.instagram.android',
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'org.thoughtcrime.securesms',
];

describe('catalog sources', () => {
  const packages = SOURCES.flatMap((s) => (s.packageName ? [s.packageName] : []));

  it('uses well-formed, unique Android package names', () => {
    for (const name of packages) expect(name).toMatch(ANDROID_PACKAGE);
    expect(new Set(packages).size).toBe(packages.length);
  });

  it('never whitelists a messaging app', () => {
    expect(packages.filter((p) => MESSAGING.includes(p))).toEqual([]);
  });

  it('keeps slugs unique', () => {
    const slugs = SOURCES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
