// expo/metro-config handles pnpm workspaces on its own since SDK 52:
// no watchFolders or nodeModulesPaths by hand.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
