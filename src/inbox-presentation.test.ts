import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxSummary } from './inbox-presentation.ts';

test('failed or unknown Inbox counts never claim the user is caught up', () => {
  assert.match(inboxSummary(0, 'Offline'), /unavailable/);
  assert.match(inboxSummary(14, 'Offline'), /unavailable/);
  assert.match(inboxSummary(null, null), /Checking/);
  assert.match(inboxSummary(null, 'Forbidden'), /unavailable/);
});
test('only verified counts show the empty or unread summary', () => {
  assert.equal(inboxSummary(0, null), 'You’re all caught up.');
  assert.equal(inboxSummary(1, null), '1 unread operational alert.');
  assert.equal(inboxSummary(2, null), '2 unread operational alerts.');
});
