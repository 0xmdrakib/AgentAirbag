/**
 * Canonical JSON: stable key order, no whitespace. Used for report hashes.
 * This is deliberately small: the report contract only uses JSON-safe values.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const next = record[key];
    if (next !== undefined) out[key] = sortValue(next);
  }
  return out;
}
