export const GUEST_LIBRARY_OWNER = "guest" as const;

export type AccountLocalLibraryOwner = `account:${string}`;
export type LocalLibraryOwner = typeof GUEST_LIBRARY_OWNER | AccountLocalLibraryOwner;

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function accountLocalLibraryOwner(email: string): AccountLocalLibraryOwner {
  const normalized = normalizeAccountEmail(email);
  if (!SIMPLE_EMAIL.test(normalized) || normalized.includes(":")) {
    throw new Error("Invalid local library account email");
  }
  return `account:${normalized}`;
}

export function isLocalLibraryOwner(value: unknown): value is LocalLibraryOwner {
  if (value === GUEST_LIBRARY_OWNER) return true;
  if (typeof value !== "string" || !value.startsWith("account:")) return false;
  try {
    return accountLocalLibraryOwner(value.slice("account:".length)) === value;
  } catch {
    return false;
  }
}

/** Maps every pre-1.1.2 owner into an explicit, deterministic namespace. */
export function normalizeLegacyLocalLibraryOwner(value: unknown): LocalLibraryOwner {
  if (typeof value !== "string" || !value.trim()) return GUEST_LIBRARY_OWNER;
  const normalized = value.trim().toLowerCase();
  if (normalized === GUEST_LIBRARY_OWNER) return GUEST_LIBRARY_OWNER;
  try {
    return accountLocalLibraryOwner(normalized.startsWith("account:")
      ? normalized.slice("account:".length)
      : normalized);
  } catch {
    return GUEST_LIBRARY_OWNER;
  }
}

/** Keeps 1.1.1 account photo directories stable: account:<email> still uses <email>. */
export function localLibraryDirectoryIdentity(owner: LocalLibraryOwner | string): string {
  const normalized = String(owner).trim().toLowerCase();
  if (normalized === GUEST_LIBRARY_OWNER) return GUEST_LIBRARY_OWNER;
  return normalized.startsWith("account:") ? normalized.slice("account:".length) : normalized;
}
