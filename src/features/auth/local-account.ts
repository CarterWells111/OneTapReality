import { localLibraryDirectoryIdentity } from "./local-library-owner";

export {
  accountLocalLibraryOwner,
  isLocalLibraryOwner,
  normalizeLegacyLocalLibraryOwner,
  type LocalLibraryOwner,
} from "./local-library-owner";

export function normalizeLocalAccountKey(email: string): string {
  return email.trim().toLowerCase();
}

export function localAccountDirectorySegment(accountKey: string): string {
  return encodeURIComponent(localLibraryDirectoryIdentity(accountKey));
}
