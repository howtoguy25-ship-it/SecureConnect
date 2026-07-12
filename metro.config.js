const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The vehicle classifier's weight shards are loaded via require() (see modelAssetIO.ts) --
// Metro needs to treat .bin files as binary assets, not source, for that to resolve correctly.
config.resolver.assetExts.push("bin");

module.exports = config;
