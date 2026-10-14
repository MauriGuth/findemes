/**
 * Tools for building parsers (capture mode, samples). On in development and in the
 * `preview` build Mauricio uses day to day (EXPO_PUBLIC_DEV_TOOLS=1 in eas.json); off in
 * production.
 */
export const devToolsEnabled = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';
