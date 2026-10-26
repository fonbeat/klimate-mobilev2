const { withInfoPlist } = require('expo/config-plugins');

module.exports = (config, { release = false } = {}) => withInfoPlist(config, (mod) => {
  delete mod.modResults.NSFaceIDUsageDescription;
  delete mod.modResults.NSMicrophoneUsageDescription;
  if (release) {
    // Override template/plugin defaults, not just the top-level Expo settings.
    mod.modResults.NSAppTransportSecurity = { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false };
  }
  return mod;
});
