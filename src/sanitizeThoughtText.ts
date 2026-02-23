// Enforce: A-Z and whitespace only, collapse consecutive whitespace to a single space,
// and make everything uppercase.
export function sanitizeThoughtText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ");
}

