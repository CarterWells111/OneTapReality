import { inArray, sql } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import {
  giftMemberActivations,
  giftMembers,
  gifts,
  sharedAlbumPages,
  sharedAlbums,
} from "../db/schema";
import { hashAccessToken } from "./device-auth";
import type { AppleReviewAccess } from "./apple-review-access";
import type { AuthenticatedUser } from "./repository";

const fixtureGiftIds = [
  "apple-review-owner",
  "apple-review-viewer",
  "apple-review-editor",
  "apple-review-claimable",
] as const;

const fixtureOwnerEmail = "app-review-fixture-owner@invalid.onetapreality";

function reviewPage(id: string, title: string) {
  return {
    id,
    kind: "cover",
    headline: title,
    body: "用于 App Review 的可重置示例旅行册",
    layout: { aspectRatio: 0.75, elements: [] },
  };
}

/** Replaces only the dedicated review namespace, so interrupted or mutated fixtures reset deterministically. */
export async function resetAppleReviewFixtures(
  db: BackendDatabase,
  user: AuthenticatedUser,
  access: AppleReviewAccess,
  now: string,
): Promise<void> {
  if (user.email !== access.email) throw new Error("Apple review fixture identity mismatch");
  const [ownerHash, viewerHash, editorHash, claimHash] = await Promise.all([
    hashAccessToken(`${access.fixtureSecret}:owner`, access.giftTokenPepper),
    hashAccessToken(`${access.fixtureSecret}:viewer`, access.giftTokenPepper),
    hashAccessToken(`${access.fixtureSecret}:editor`, access.giftTokenPepper),
    hashAccessToken(access.claimToken, access.giftTokenPepper),
  ]);

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('apple-review-fixtures'), hashtext(${user.id}))`);
    await tx.delete(gifts).where(inArray(gifts.id, [...fixtureGiftIds]));
    await tx.insert(gifts).values([
      { id: fixtureGiftIds[0], tokenHash: ownerHash, status: "bound", createdAt: now, claimedAt: now, disabledAt: null },
      { id: fixtureGiftIds[1], tokenHash: viewerHash, status: "bound", createdAt: now, claimedAt: now, disabledAt: null },
      { id: fixtureGiftIds[2], tokenHash: editorHash, status: "bound", createdAt: now, claimedAt: now, disabledAt: null },
      { id: fixtureGiftIds[3], tokenHash: claimHash, status: "unclaimed", createdAt: now, claimedAt: null, disabledAt: null },
    ]);
    await tx.insert(giftMembers).values([
      { id: "apple-review-owner-member", giftId: fixtureGiftIds[0], email: access.email, role: "owner", createdAt: now },
      { id: "apple-review-viewer-owner", giftId: fixtureGiftIds[1], email: fixtureOwnerEmail, role: "owner", createdAt: now },
      { id: "apple-review-viewer-member", giftId: fixtureGiftIds[1], email: access.email, role: "viewer", createdAt: now },
      { id: "apple-review-editor-owner", giftId: fixtureGiftIds[2], email: fixtureOwnerEmail, role: "owner", createdAt: now },
      { id: "apple-review-editor-member", giftId: fixtureGiftIds[2], email: access.email, role: "editor", createdAt: now },
    ]);
    await tx.insert(giftMemberActivations).values([
      { memberId: "apple-review-viewer-member", userId: user.id, activatedAt: now },
      { memberId: "apple-review-editor-member", userId: user.id, activatedAt: now },
    ]);
    await tx.insert(sharedAlbums).values([
      { id: "apple-review-owner-album", giftId: fixtureGiftIds[0], sourceMemoryId: "apple-review-owner-memory", title: "审核示例：我的旅行册", travelDate: "2026-08-01", publishedAt: now, version: 1, coverObjectKey: null, coverContentType: null, coverByteSize: null },
      { id: "apple-review-viewer-album", giftId: fixtureGiftIds[1], sourceMemoryId: "apple-review-viewer-memory", title: "审核示例：只读旅行册", travelDate: "2026-08-02", publishedAt: now, version: 1, coverObjectKey: null, coverContentType: null, coverByteSize: null },
      { id: "apple-review-editor-album", giftId: fixtureGiftIds[2], sourceMemoryId: "apple-review-editor-memory", title: "审核示例：可编辑旅行册", travelDate: "2026-08-03", publishedAt: now, version: 1, coverObjectKey: null, coverContentType: null, coverByteSize: null },
    ]);
    await tx.insert(sharedAlbumPages).values([
      { id: "apple-review-owner-page", sharedAlbumId: "apple-review-owner-album", position: 0, pageJson: reviewPage("apple-review-owner-page", "我的旅行册") },
      { id: "apple-review-viewer-page", sharedAlbumId: "apple-review-viewer-album", position: 0, pageJson: reviewPage("apple-review-viewer-page", "只读旅行册") },
      { id: "apple-review-editor-page", sharedAlbumId: "apple-review-editor-album", position: 0, pageJson: reviewPage("apple-review-editor-page", "可编辑旅行册") },
    ]);
  });
}
