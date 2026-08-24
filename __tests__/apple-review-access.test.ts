import { eq } from "drizzle-orm";

import { getAppleReviewAccess } from "../src/server/auth/apple-review-access";
import { resetAppleReviewFixtures } from "../src/server/auth/apple-review-fixtures";
import { createOrGetUserByEmail } from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { giftMemberActivations, giftMembers, gifts, sharedAlbums } from "../src/server/db/schema";
import { hashAccessToken } from "../src/server/auth/device-auth";

const reviewEmail = "reviewer@example.test";
const claimToken = "A".repeat(43);
const environment = {
  APPLE_REVIEW_ACCESS_ENABLED: "true",
  APPLE_REVIEW_EMAIL: reviewEmail,
  APPLE_REVIEW_CODE: "654321",
  APPLE_REVIEW_FIXTURE_SECRET: "fixture-secret-at-least-thirty-two-bytes-long",
  APPLE_REVIEW_CLAIM_TOKEN: claimToken,
  GIFT_TOKEN_PEPPER: "gift-token-pepper",
  GIFT_URL_ORIGIN: "https://staging.onetapreality.com",
  RELEASE_AUDIENCE: "external-beta",
};

describe("Apple review access", () => {
  it("requires an exact normalized email and every external staging gate", () => {
    expect(getAppleReviewAccess(" Reviewer@Example.Test ", environment)).toEqual(expect.objectContaining({
      email: reviewEmail,
      fixedCode: "654321",
      claimToken,
    }));

    for (const override of [
      { APPLE_REVIEW_ACCESS_ENABLED: "false" },
      { APPLE_REVIEW_EMAIL: "other@example.test" },
      { APPLE_REVIEW_CODE: "not-six-digits" },
      { APPLE_REVIEW_FIXTURE_SECRET: "short" },
      { APPLE_REVIEW_CLAIM_TOKEN: "short" },
      { GIFT_URL_ORIGIN: "https://onetapreality.com" },
      { RELEASE_AUDIENCE: "public" },
      { RELEASE_AUDIENCE: "internal" },
    ]) {
      expect(getAppleReviewAccess(reviewEmail, { ...environment, ...override })).toBeNull();
    }
    expect(getAppleReviewAccess("someone-else@example.test", environment)).toBeNull();
  });

  it("does not log the review email, fixed code or claim token", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getAppleReviewAccess(reviewEmail, environment)).not.toBeNull();

    const output = JSON.stringify([...log.mock.calls, ...info.mock.calls, ...warn.mock.calls]);
    expect(output).not.toContain(reviewEmail);
    expect(output).not.toContain("654321");
    expect(output).not.toContain(claimToken);
  });

  it("idempotently resets owner, viewer, editor and claimable review fixtures", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await createOrGetUserByEmail(db, reviewEmail, "2026-08-24T12:00:00.000Z");
      const access = getAppleReviewAccess(reviewEmail, environment);
      expect(access).not.toBeNull();

      await resetAppleReviewFixtures(db, user, access!, "2026-08-24T12:01:00.000Z");
      await db.update(gifts).set({ status: "disabled", disabledAt: "2026-08-24T12:02:00.000Z" })
        .where(eq(gifts.id, "apple-review-owner"));
      await resetAppleReviewFixtures(db, user, access!, "2026-08-24T12:03:00.000Z");

      const fixtureGifts = await db.select().from(gifts);
      expect(fixtureGifts).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "apple-review-owner", status: "bound", disabledAt: null }),
        expect.objectContaining({ id: "apple-review-viewer", status: "bound" }),
        expect.objectContaining({ id: "apple-review-editor", status: "bound" }),
        expect.objectContaining({ id: "apple-review-claimable", status: "unclaimed", tokenHash: await hashAccessToken(claimToken, environment.GIFT_TOKEN_PEPPER) }),
      ]));
      expect(fixtureGifts).toHaveLength(4);

      const memberships = await db.select().from(giftMembers);
      expect(memberships).toEqual(expect.arrayContaining([
        expect.objectContaining({ giftId: "apple-review-owner", email: reviewEmail, role: "owner" }),
        expect.objectContaining({ giftId: "apple-review-viewer", email: reviewEmail, role: "viewer" }),
        expect.objectContaining({ giftId: "apple-review-editor", email: reviewEmail, role: "editor" }),
      ]));
      const activations = await db.select().from(giftMemberActivations);
      expect(activations).toEqual([
        expect.objectContaining({ userId: user.id }),
        expect.objectContaining({ userId: user.id }),
      ]);
      const albums = await db.select().from(sharedAlbums);
      expect(albums.map((album) => album.giftId).sort()).toEqual([
        "apple-review-editor",
        "apple-review-owner",
        "apple-review-viewer",
      ]);
    } finally { await close(); }
  });
});
