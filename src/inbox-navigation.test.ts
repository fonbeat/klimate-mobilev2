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

test('Overview bell opens the root Inbox and closing it returns to the previous screen', () => {
  const overview = readFileSync(new URL('(tabs)/index.tsx', app), 'utf8');
  assert.ok(overview.includes("router.push('/notifications')"));
  const route = readFileSync(new URL('notifications.tsx', app), 'utf8');
  assert.ok(route.includes("from '@/notification-inbox'"));
  const inbox = readFileSync(new URL('./notification-inbox.tsx', import.meta.url), 'utf8');
  assert.match(inbox, /accessibilityLabel="Close Inbox" onPress=\{\(\) => router\.back\(\)\}/);
});
