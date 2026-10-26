import assert from 'node:assert/strict';
import test from 'node:test';
import { restorableSession, validSession, validResponse } from './response-validation.ts';

const session = { user: { ID: 'u', firstname: 'Test', lastname: 'User', email: 'user@example.invalid', role: 'owner', isAdmin: true, isOwner: true }, accessToken: 'access', refreshToken: 'refresh' };
test('stored sessions require typed credentials and reject malformed or expired refresh/session lifetimes', () => {
  assert.ok(validSession(session));
  for (const invalid of [null, {}, { ...session, accessToken: {} }, { ...session, refreshToken: ' ' }, { ...session, user: { ID: 'u' } }, { ...session, tenantId: {} }, { ...session, refreshTokenExpiresAt: 'invalid' }]) assert.equal(validSession(invalid), false);
  const now = Date.parse('2026-10-26T00:00:00Z');
  assert.equal(restorableSession({ ...session, sessionExpiresAt: '2026-10-25T00:00:00Z' }, now), false);
  assert.equal(restorableSession({ ...session, refreshTokenExpiresAt: '2026-10-25T00:00:00Z' }, now), false);
  assert.ok(restorableSession({ ...session, accessTokenExpiresAt: '2026-10-25T00:00:00Z', refreshTokenExpiresAt: '2026-10-27T00:00:00Z' }, now));
});
test('API guards reject missing lists and malformed rows, but allow additive fields and new statuses', () => {
  assert.ok(validResponse('/v2/status/monitors?offset=0', { records: [], total: 0, futureField: true }));
  assert.ok(validResponse('/v2/status/monitors', { records: [{ ID: 'm', label: 'Monitor', type: 'SNMP', status: 'new_state' }], total: 1 }));
  for (const invalid of [{ total: 0 }, { records: null, total: 0 }, { records: [{}], total: 1 }, { records: [], total: -1 }, { records: [], total: '0' }]) assert.equal(validResponse('/v2/status/monitors', invalid), false);
  assert.equal(validResponse('/v2/notifications', { records: [{ id: 'a' }], total: 1, unread: 1 }), false);
  assert.equal(validResponse('/v2/targets/t/report', { target: {}, summary: {}, monitors: null }), false);
  assert.equal(validResponse('/v2/services/s/report', { service: { name: 's', health: 'up' }, definition: {}, current: { state: 'up', indicators: [], dependencies: [], redundancyGroups: [] } }), false);
  assert.ok(validResponse('/v2/sessions/login', { mfaRequired: true, mfaChallengeToken: 'challenge' }));
  assert.equal(validResponse('/v2/sessions/refresh', { accessToken: 'only-one-field' }), false);
});
