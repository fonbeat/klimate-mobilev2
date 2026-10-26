export function inboxSummary(unread: number | null, error: string | null) {
  if (error) return 'Alert count unavailable. Pull down to try again.';
  if (unread == null) return 'Checking outstanding alerts…';
  return unread ? `${unread} unread operational alert${unread === 1 ? '' : 's'}.` : 'You’re all caught up.';
}
