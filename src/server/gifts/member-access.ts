import type { BackendDatabase } from "../db/client";
import type { GiftMemberRole } from "../db/schema";
import { getActivatedGiftAccessByGiftId } from "./repository";

export async function getActivatedGiftMemberAccess(
  db: BackendDatabase,
  input: { giftId: string; userId: string; email: string; allowedRoles?: readonly GiftMemberRole[] },
) {
  const access = await getActivatedGiftAccessByGiftId(db, input.giftId, input.userId, input.email);
  if (!access || access.status !== "bound") return null;
  const allowedRoles = input.allowedRoles ?? (["viewer", "editor"] as const);
  return allowedRoles.includes(access.role as GiftMemberRole) ? access : null;
}
