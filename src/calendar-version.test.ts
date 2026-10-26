import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { calendarVersion, nextBuildVersion } = require('../scripts/calendar-version.cjs');
const { buildMobileConfig } = require('../scripts/mobile-config.cjs');
const base = require('../app.json').expo;

test('calendar versions encode the same build for iOS and Android', () => {
  assert.deepEqual(calendarVersion('2026.10.1'), { version: '2026.10.1', buildNumber: '2026.10.1', versionCode: 20261001 });
  assert.equal(calendarVersion('2026.1.9').versionCode, 20260109);
  assert.equal(calendarVersion('2026.12.99').versionCode, 20261299);
  for (const version of ['2026.0.1', '2026.13.1', '2026.10.0', '2026.10.100', '2026.10.01', '0.1.0', 'invalid']) {
    assert.throws(() => calendarVersion(version));
  }
});

test('build counter advances within a month and resets across months and years without downgrades', () => {
  assert.equal(nextBuildVersion('2026.10.1', new Date('2026-10-22T00:00:00Z')).version, '2026.10.2');
  assert.equal(nextBuildVersion('2026.10.99', new Date('2026-11-01T00:00:00Z')).version, '2026.11.1');
  assert.equal(nextBuildVersion('2026.12.99', new Date('2027-01-01T00:00:00Z')).versionCode, 20270101);
  assert.ok(calendarVersion('2027.1.1').versionCode > calendarVersion('2026.12.99').versionCode);
  assert.throws(() => nextBuildVersion('2026.10.99', new Date('2026-10-22T00:00:00Z')));
  assert.throws(() => nextBuildVersion('2026.11.1', new Date('2026-10-22T00:00:00Z')), /earlier/);
  assert.throws(() => nextBuildVersion('2026.10.1', new Date('invalid')));
});

test('native config derives build numbers from app version rather than stale build fields', () => {
  const config = buildMobileConfig({ ...base, version: '2026.11.2', ios: { ...base.ios, buildNumber: '1' }, android: { ...base.android, versionCode: 1 } }, {});
  assert.equal(config.ios.buildNumber, '2026.11.2');
  assert.equal(config.android.versionCode, 20261102);
  const current = calendarVersion(base.version);
  assert.equal(base.ios.buildNumber, current.buildNumber);
  assert.equal(base.android.versionCode, current.versionCode);
  assert.equal(require('../package.json').version, current.version);
  const eas = require('../eas.json');
  assert.equal(eas.cli.appVersionSource, 'local');
  assert.equal(eas.build.production.autoIncrement, false);
});
