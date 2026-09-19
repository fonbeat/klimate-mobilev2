import assert from 'node:assert/strict';
import test from 'node:test';
import { parseApiBody, unwrapApiPayload } from './api.ts';

test('parses and unwraps the V2 data envelope', () => {
  const payload = parseApiBody('{"data":{"total":4}}');
  assert.deepEqual(unwrapApiPayload(payload), { total: 4 });
});

test('preserves unwrapped payloads and readable non-JSON errors', () => {
  assert.deepEqual(unwrapApiPayload(parseApiBody('{"total":2}')), { total: 2 });
  assert.deepEqual(parseApiBody('  upstream unavailable  '), { message: 'upstream unavailable' });
  assert.deepEqual(parseApiBody(''), {});
});
