export function normalizeLocalAccountKey(email: string): string {
  return email.trim().toLowerCase();
}

export function localAccountDirectorySegment(accountKey: string): string {
  return encodeURIComponent(normalizeLocalAccountKey(accountKey));
}
