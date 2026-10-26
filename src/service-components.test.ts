import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceComponentCounts } from './service-components.ts';

test('counts configured service indicators and direct plus grouped dependencies', () => {
  assert.deepEqual(serviceComponentCounts({
    indicators: [{}, {}],
    dependencies: [{}],
    redundancyGroups: [{ members: [{}, {}] }, { members: [{}] }],
  }), { indicators: 2, dependencies: 4 });
});

test('returns zero only when the service definition has no components', () => {
  assert.deepEqual(serviceComponentCounts({ indicators: [], dependencies: [], redundancyGroups: [] }), { indicators: 0, dependencies: 0 });
});
