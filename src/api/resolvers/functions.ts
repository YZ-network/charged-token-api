export function recordToEntryList(record: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
  }));
}

export function toGraphQL(record: Record<string, any> | Record<string, any>[]): Record<string, any> {
  if (record instanceof Array) {
    return record.map((obj) => toGraphQL(obj));
  }

  const copy = { ...record };
  for (const key in record) {
    if (typeof record[key] === "object" && !(record[key] instanceof Array)) {
      copy[key] = recordToEntryList(record[key]);
    }
  }

  return copy;
}
