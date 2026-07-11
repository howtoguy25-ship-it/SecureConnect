const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @tensorflow/tfjs-react-native's bundleResourceIO loads the vehicle classifier's weight
// shards via require() -- Metro needs to treat .bin files as binary assets, not source, for
// that to resolve correctly. See src/services/vehicleClassifier.ts.
config.resolver.assetExts.push("bin");

module.exports = config;
