import assert from 'node:assert/strict';
import test from 'node:test';
import { displayMetric } from './metric-display.ts';

test('unavailable metric placeholders display as N/A, preserving real values and explanations', () => {
  for (const value of ['Data unavailable', 'data unavailable', ' DATA UNAVAILABLE ']) {
    assert.equal(displayMetric(value), 'N/A');
  }
  for (const value of [0, 42, '0 ms', '8d 6h 40m', '—', null, undefined, 'Data unavailable while the gateway is offline.']) {
    assert.equal(displayMetric(value), value);
  }
});
