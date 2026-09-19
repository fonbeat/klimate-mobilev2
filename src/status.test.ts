import assert from 'node:assert/strict';
import test from 'node:test';
import { statusTone } from './status.ts';

test('maps the same status according to its domain', () => {
  assert.equal(statusTone('active', 'incident'), 'critical');
  assert.equal(statusTone('active', 'maintenance'), 'info');
  assert.equal(statusTone('critical', 'attention'), 'critical');
  assert.equal(statusTone('info', 'attention'), 'info');
});

test('normalizes status spelling and preserves unknown states', () => {
  assert.equal(statusTone('In Progress', 'maintenance'), 'info');
  assert.equal(statusTone('degraded', 'probe'), 'warning');
  assert.equal(statusTone('not-reported', 'monitor'), 'neutral');
});
