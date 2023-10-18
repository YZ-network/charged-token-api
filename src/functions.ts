export function recordToEntryList (
  record: Record<string, string>
): Array<{ key: string, value: string }> {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value
  }))
}
