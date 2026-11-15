import assert from 'node:assert/strict';
import test from 'node:test';
import { attentionName, overviewIssueFilter, overviewPortrait, overviewSectionTitle } from './overview-presentation.ts';

test('health card shortcut prioritizes down, then attention, with no shortcut for healthy or unknown-only states', () => {
  const counts = { total: 4, healthy: 2, down: 1, attention: 1, unknown: 0 };
  assert.equal(overviewIssueFilter(counts), 'Down');
  assert.equal(overviewIssueFilter({ ...counts, down: 0 }), 'Attention');
  assert.equal(overviewIssueFilter({ ...counts, down: 0, attention: 0 }), undefined);
  assert.equal(overviewIssueFilter({ ...counts, down: 0, attention: 0, unknown: 2 }), undefined);
});

test('puts active failures ahead of secondary and unknown states', () => {
  assert.deepEqual(overviewPortrait('monitors', { total: 17, healthy: 14, down: 1, attention: 1, unknown: 1 }), {
    headline: '1 monitor down', detail: '14 of 17 monitors healthy', tone: 'down',
  });
});

test('uses the right language for each live status view', () => {
  assert.equal(overviewPortrait('monitors', { total: 3, healthy: 1, down: 0, attention: 2, unknown: 0 }).headline, '2 monitors need attention');
  assert.equal(overviewPortrait('targets', { total: 3, healthy: 1, down: 0, attention: 2, unknown: 0 }).headline, '2 targets affected');
  assert.equal(overviewPortrait('services', { total: 3, healthy: 1, down: 0, attention: 2, unknown: 0 }).headline, '2 services degraded');
  assert.equal(attentionName('services'), 'degraded');
});

test('distinguishes healthy, unknown, and unconfigured environments', () => {
  assert.equal(overviewPortrait('services', { total: 4, healthy: 4, down: 0, attention: 0, unknown: 0 }).headline, 'All clear');
  assert.equal(overviewPortrait('services', { total: 4, healthy: 3, down: 0, attention: 0, unknown: 1 }).headline, 'Status unknown');
  assert.equal(overviewPortrait('services', { total: 0, healthy: 0, down: 0, attention: 0, unknown: 0 }).headline, 'Awaiting first checks');
});

test('never labels unknown-only or empty environments All clear', () => {
  const counts = { total: 2, healthy: 1, down: 0, attention: 0, unknown: 1 };
  assert.equal(overviewSectionTitle(counts), 'Status unknown');
  assert.equal(overviewSectionTitle({ ...counts, down: 1 }), 'Needs attention');
  assert.equal(overviewSectionTitle({ ...counts, unknown: 0 }), 'All clear');
  assert.equal(overviewSectionTitle({ ...counts, total: 0, healthy: 0, unknown: 0 }), 'Awaiting first checks');
});
