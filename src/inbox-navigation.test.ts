import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const app = new URL('../app/', import.meta.url);
function routes(directory: URL, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routes(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`);
    return /\.[jt]sx?$/.test(entry.name) && !entry.name.startsWith('_') ? [`${prefix}${entry.name.replace(/\.[jt]sx?$/, '')}`] : [];
  });
}

test('Inbox has one unambiguous root route, not a duplicate hidden tab', () => {
  const matches = routes(app).filter((route) => route.split('/').filter((segment) => !/^\(.*\)$/.test(segment)).join('/') === 'notifications');
  assert.deepEqual(matches, ['notifications']);
  const root = readFileSync(new URL('_layout.tsx', app), 'utf8');
  assert.ok(root.includes('<Stack.Screen name="notifications" />'));
  const tabs = readFileSync(new URL('(tabs)/_layout.tsx', app), 'utf8');
  assert.equal(tabs.includes('name="notifications"'), false);
});

test('Overview bell opens the root Inbox on Active issues and closing it returns to the previous screen', () => {
  const overview = readFileSync(new URL('(tabs)/index.tsx', app), 'utf8');
  assert.match(overview, /router\.push\(\{ pathname: '\/notifications', params: \{ filter: 'active' \} \}\)/);
  const route = readFileSync(new URL('notifications.tsx', app), 'utf8');
  assert.ok(route.includes("from '@/notification-inbox'"));
  const inbox = readFileSync(new URL('./notification-inbox.tsx', import.meta.url), 'utf8');
  assert.match(inbox, /initialFilter = filter === 'active' \? 'Active issues' : filter === 'unread' \? 'Unread' : 'All'/);
  assert.match(inbox, /useState\(initialFilter\)/);
  assert.match(inbox, /options=\{\['Active issues', 'Unread', 'All'\]\}/);
  assert.match(inbox, /filter === 'Active issues' \? <InboxActiveIssues header=\{header\} \/> : <InboxMessages header=\{header\} filter=\{filter\} \/>/);
  assert.match(inbox, /accessibilityLabel="Close Inbox" onPress=\{\(\) => router\.back\(\)\}/);
});

test('opening an Inbox alert navigates before its read-state write and never awaits badge reconciliation', () => {
  const inbox = readFileSync(new URL('./notification-inbox.tsx', import.meta.url), 'utf8');
  const action = inbox.slice(inbox.indexOf('const markRead ='), inbox.indexOf('const markAllRead ='));
  assert.ok(action.indexOf('router.push(') < action.indexOf('await request<void>'));
  assert.equal(action.includes('await refreshBadge()'), false);
  assert.equal(action.includes('await result.refreshVisible()'), false);
});
