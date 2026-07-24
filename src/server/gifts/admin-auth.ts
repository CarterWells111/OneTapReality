import { ApiError } from "../http/errors";

export function isGiftAdminEmail(email: string, allowlist = process.env.GIFT_ADMIN_EMAILS): boolean {
  if (!allowlist) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.split(",").some((entry) => entry.trim().toLowerCase() === normalized);
}

export function requireGiftAdminEmail(email: string): string {
  if (!isGiftAdminEmail(email)) throw new ApiError(403, "gift_admin_required", "This verified email is not permitted to manage NFC cards");
  return email.trim().toLowerCase();
}
