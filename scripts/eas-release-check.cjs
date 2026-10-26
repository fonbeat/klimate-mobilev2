// Run after EAS has materialized secret file variables, before native compilation.
if (process.env.KLIMATE_STORE_BUILD === '1' || process.env.EAS_BUILD_PROFILE === 'production') {
  require('./check-store-readiness.cjs');
}
