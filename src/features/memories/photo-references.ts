import * as FileSystem from "expo-file-system/legacy";

import { localAccountDirectorySegment } from "../auth/local-account";

export const MISSING_LOCAL_PHOTO_PREFIX = "missing-local-photo://";

const CANONICAL_REFERENCE = /^documents:\/\/photos\/accounts\/([^/]+)\/([^/]+)\/([^/]+)$/;
const LEGACY_ACCOUNT_URI = /^file:\/\/.+\/Documents\/photos\/accounts\/([^/]+)\/([^/]+)\/([^/]+)$/;
const APP_GENERATED_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.[A-Za-z0-9]{1,8}$/;
let missingPhotoCounter = 0;

function expectedSegments(accountKey: string, memoryId: string): { account: string; memory: string } | null {
  const account = localAccountDirectorySegment(accountKey);
  const memory = encodeURIComponent(memoryId);
  if (!isSafeDirectorySegment(account) || !isSafeDirectorySegment(memory)) return null;
  return { account, memory };
}

function isSafeDirectorySegment(segment: string): boolean {
  if (segment.length === 0 || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\") || segment.includes("\0")) {
    return false;
  }
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0
      && decoded !== "."
      && decoded !== ".."
      && !decoded.includes("/")
      && !decoded.includes("\\")
      && !decoded.includes("\0")
      && !/%[0-9a-f]{2}/i.test(decoded)
      && encodeURIComponent(decoded) === segment;
  } catch {
    return false;
  }
}

function isSafeFileName(fileName: string): boolean {
  if (!APP_GENERATED_FILE_NAME.test(fileName) || fileName === "." || fileName === "..") return false;
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) return false;
  try {
    const decoded = decodeURIComponent(fileName);
    return !decoded.includes("/") && !decoded.includes("\\") && !decoded.includes("\0") && decoded !== "." && decoded !== "..";
  } catch {
    return false;
  }
}

function validatedPhotoPath(
  accountSegment: string,
  memorySegment: string,
  fileName: string,
  accountKey: string,
  memoryId: string,
): string | null {
  const expected = expectedSegments(accountKey, memoryId);
  if (!expected || accountSegment !== expected.account || memorySegment !== expected.memory || !isSafeFileName(fileName)) {
    return null;
  }
  return `photos/accounts/${accountSegment}/${memorySegment}/${fileName}`;
}

function documentsRoot(): string | null {
  const root = FileSystem.documentDirectory;
  return root && root.endsWith("/") ? root : null;
}

export function toCanonicalPhotoReference(uri: string, accountKey: string, memoryId: string): string | null {
  const root = documentsRoot();
  const expected = expectedSegments(accountKey, memoryId);
  if (!root || !expected) return null;

  const prefix = `${root}photos/accounts/${expected.account}/${expected.memory}/`;
  if (!uri.startsWith(prefix)) return null;
  const fileName = uri.slice(prefix.length);
  const relativePath = validatedPhotoPath(expected.account, expected.memory, fileName, accountKey, memoryId);
  return relativePath ? `documents://${relativePath}` : null;
}

export function resolveCanonicalPhotoReference(reference: string, accountKey: string, memoryId: string): string | null {
  const root = documentsRoot();
  const match = CANONICAL_REFERENCE.exec(reference);
  if (!root || !match) return null;
  const relativePath = validatedPhotoPath(match[1], match[2], match[3], accountKey, memoryId);
  return relativePath ? `${root}${relativePath}` : null;
}

export function rebaseLegacyAccountPhotoUri(uri: string, accountKey: string, memoryId: string): string | null {
  const root = documentsRoot();
  const match = LEGACY_ACCOUNT_URI.exec(uri);
  if (!root || !match) return null;
  const relativePath = validatedPhotoPath(match[1], match[2], match[3], accountKey, memoryId);
  return relativePath ? `${root}${relativePath}` : null;
}

export function createMissingPhotoToken(): `missing-local-photo://${string}` {
  missingPhotoCounter += 1;
  return `${MISSING_LOCAL_PHOTO_PREFIX}${Date.now().toString(36)}-${missingPhotoCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function isMissingPhotoToken(uri: string): boolean {
  return uri.startsWith(MISSING_LOCAL_PHOTO_PREFIX) && uri.length > MISSING_LOCAL_PHOTO_PREFIX.length;
}
