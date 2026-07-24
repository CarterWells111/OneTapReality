export const maxGiftMembers = 3;

export type GiftMember = { email: string; role: "owner" | "viewer" };
export type GiftStatus = "unclaimed" | "bound" | "disabled";
export type Gift = { id: string; status: GiftStatus; members: GiftMember[] };

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("邮箱地址无效");
  return normalized;
}

export function createGift(id: string): Gift {
  return { id, status: "unclaimed", members: [] };
}

export function claimGift(gift: Gift, email: string): Gift {
  if (gift.status === "disabled") throw new Error("礼品已停用");
  if (gift.status !== "unclaimed") throw new Error("礼品已被认领");
  return { ...gift, status: "bound", members: [{ email: normalizeEmail(email), role: "owner" }] };
}

export function addGiftMember(gift: Gift, email: string): Gift {
  if (gift.status !== "bound") throw new Error("礼品尚未绑定");
  const normalized = normalizeEmail(email);
  if (gift.members.some((member) => member.email === normalized)) throw new Error("已在访问名单中");
  if (gift.members.length >= maxGiftMembers) throw new Error("最多绑定 3 个邮箱");
  return { ...gift, members: [...gift.members, { email: normalized, role: "viewer" }] };
}

export function disableGift(gift: Gift): Gift {
  return { ...gift, status: "disabled", members: [] };
}
