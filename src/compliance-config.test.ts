import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolveApiUrl } from './api-url.ts';
import { PRIVACY_POLICY_URL, PRODUCT_OWNER, SUPPORT_EMAIL, SUPPORT_URL } from './legal-links.ts';

const require = createRequire(import.meta.url);
const { buildMobileConfig, releaseIssues } = require('../scripts/mobile-config.cjs');
const base = require('../app.json').expo;

test('release version uses a calendar month and positive monthly release counter consistently', () => {
  assert.match(base.version, /^\d{4}\.(?:[1-9]|1[0-2])\.[1-9]\d*$/);
  assert.equal(base.version, require('../package.json').version);
  assert.equal(buildMobileConfig(base, {}).version, base.version);
});

test('release config blocks unnecessary permissions and insecure transport while development preserves Metro access', () => {
  const release = buildMobileConfig(base, { EAS_BUILD_PROFILE: 'preview' });
  assert.equal(release.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  assert.equal(release.ios.infoPlist.NSAppTransportSecurity.NSExceptionDomains, undefined);
  for (const permission of ['RECORD_AUDIO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW']) {
    assert.ok(release.android.blockedPermissions.includes(`android.permission.${permission}`));
  }
  const properties = release.plugins.find((item: unknown[]) => Array.isArray(item) && item[0] === 'expo-build-properties')[1];
  assert.equal(properties.android.targetSdkVersion, 36);
  assert.equal(properties.android.compileSdkVersion, 37);
  assert.equal(properties.android.usesCleartextTraffic, false);
  const dev = buildMobileConfig(base, {});
  assert.equal(dev.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads, true);
  assert.ok(!dev.android.blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'));
  assert.throws(() => buildMobileConfig(base, { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: 'http://example.com' }), /HTTPS/);
});

test('release readiness fails explicitly on missing project, branded assets and Android Firebase setup', () => {
  const config = buildMobileConfig({ ...base, android: { ...base.android, googleServicesFile: undefined }, extra: { ...base.extra, eas: {} } }, {});
  const android = releaseIssues(config, { EAS_BUILD_PLATFORM: 'android' });
  for (const field of ['EAS_PROJECT_ID', 'KLIMATE_APP_ICON', 'KLIMATE_ADAPTIVE_ICON', 'GOOGLE_SERVICES_JSON']) assert.ok(android.some((message: string) => message.includes(field)));
  const ios = releaseIssues(config, { EAS_BUILD_PLATFORM: 'ios' });
  assert.ok(!ios.some((message: string) => message.includes('GOOGLE_SERVICES_JSON')));
  assert.ok(!ios.some((message: string) => message.includes('KLIMATE_ADAPTIVE_ICON')));
  const localEas = releaseIssues(config, { EAS_BUILD_PLATFORM: 'android' }, undefined, { deferFirebase: true });
  assert.ok(!localEas.some((message: string) => message.includes('GOOGLE_SERVICES_JSON')));
  assert.ok(localEas.some((message: string) => message.includes('EAS_PROJECT_ID')));
});

test('linked EAS organization and project survive dynamic config resolution', () => {
  const config = buildMobileConfig(base, {});
  assert.equal(config.owner, 'fonbeat');
  assert.equal(config.slug, 'klimate');
  assert.equal(config.extra.eas.projectId, base.extra.eas.projectId);
  assert.ok(!releaseIssues(config, { EAS_BUILD_PLATFORM: 'ios' }).some((message: string) => message.includes('EAS_PROJECT_ID')));
});

test('release API rejects HTTP, credentials and non-network schemes without affecting local development', () => {
  assert.equal(resolveApiUrl(undefined, false), 'https://web-api.klimate.app');
  assert.equal(resolveApiUrl('http://192.168.1.10:8080/', true), 'http://192.168.1.10:8080');
  for (const value of ['http://example.com', 'https://user:secret@example.com', 'file:///tmp/api', 'invalid']) assert.throws(() => resolveApiUrl(value, false));
});

test('approved privacy and support contacts are available independently of authentication', () => {
  assert.equal(PRIVACY_POLICY_URL, 'https://www.klimate.app/privacy');
  assert.equal(SUPPORT_EMAIL, 'help@klimate.app');
  assert.ok(SUPPORT_URL.startsWith('mailto:help@klimate.app?'));
  assert.equal(PRODUCT_OWNER, 'Fonbeat Ltd');
});
