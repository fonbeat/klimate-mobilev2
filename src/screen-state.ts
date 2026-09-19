export type ScreenState = 'loading' | 'error' | 'empty' | 'content';

export function resolveScreenState({ loading, error, empty }: { loading?: boolean; error?: string | null; empty?: string }): ScreenState {
  if (loading) return 'loading';
  if (error) return 'error';
  if (empty) return 'empty';
  return 'content';
}
