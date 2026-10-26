const base = require('../app.json').expo;
const { buildMobileConfig, releaseIssues } = require('./mobile-config.cjs');
try {
  const config = buildMobileConfig(base, { ...process.env, KLIMATE_STORE_BUILD: '1' });
  const issues = releaseIssues(config);
  if (issues.length) throw new Error(issues.join('\n- '));
  console.log('Local release configuration checks passed. Signed-build, credentials, privacy declarations, and reviewer-access checks are still required.');
} catch (error) {
  console.error(`Store setup still required:\n- ${error.message}`);
  process.exitCode = 1;
}
