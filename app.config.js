const { buildMobileConfig, releaseIssues } = require('./scripts/mobile-config.cjs');

module.exports = ({ config }) => {
  const resolved = buildMobileConfig(config);
  if (process.env.KLIMATE_STORE_BUILD === '1' || process.env.EAS_BUILD_PROFILE === 'production') {
    const issues = releaseIssues(resolved, process.env, undefined, { deferFirebase: true });
    if (issues.length) throw new Error(`Klimate store build is not ready:\n- ${issues.join('\n- ')}`);
  }
  return resolved;
};
