// Normalize backend placeholder values without changing explanatory messages.
export function displayMetric<T extends string | number | null | undefined>(value: T): T | 'N/A' {
  return typeof value === 'string' && /^data\s+unavailable$/i.test(value.trim()) ? 'N/A' : value;
}
