import { eq, sql } from "drizzle-orm";

import {
  acceptAccountDeletion,
  createAccountDeletionChallenge,
  createAccountDeletionChallengeIfAllowed,
  isAccountDeletionChallengeRateLimited,
  processAccountDeletionJobs,
} from "../src/server/auth/account-deletion";
import { createAuthSession, createOrGetUserByEmail, getAuthenticatedUserByTokenHash } from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import {
  accountDeletionJobs,
  accountDeletionChallenges,
  accountDeletionMediaObjects,
  authSessions,
  giftMediaCleanupJobs,
  giftPublishSessions,
  gifts,
  users,
} from "../src/server/db/schema";
import {
  claimGiftByTokenHash,
  createGift,
  createGiftPublishSession,
  GiftPublicationUnavailableError,
} from "../src/server/gifts/repository";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";
import { promoteSharedPublicationDurably } from "../src/server/gifts/shared-publication";
import { runGiftMaintenance } from "../src/server/maintenance/run-gift-maintenance";

const now = "2026-08-24T10:00:00.000Z";
const expiresAt = "2026-08-24T10:05:00.000Z";
const completeBy = "2026-08-25T10:00:00.000Z";

function createStore(deleteObjects = jest.fn(async () => undefined)): PrivateMediaStore {
  return {
    createUploadUrl: jest.fn(),
    createReadUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
    objectExists: jest.fn(),
    deleteObjects,
    copyObject: jest.fn(async () => undefined),
  };
}

async function seedAccount(db: ReturnType<typeof createBackendTestDatabase>["db"]) {
  const user = await createOrGetUserByEmail(db, "Owner@Example.com", "2026-08-24T09:00:00.000Z");
  await createAuthSession(db, { id: "session-current", userId: user.id, tokenHash: "token-current", createdAt: now, expiresAt: completeBy });
  await createAuthSession(db, { id: "session-other", userId: user.id, tokenHash: "token-other", createdAt: now, expiresAt: completeBy });
  return user;
}

describe("account deletion repository", () => {
  it("accepts one unexpired session-bound challenge and immediately revokes every session", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "owned-gift", tokenHash: "owned-hash", createdAt: now });
      await claimGiftByTokenHash(db, "owned-hash", user.email, now);
      await createAccountDeletionChallenge(db, {
        id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "correct-hash", createdAt: now, expiresAt,
      });

      await expect(acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "wrong-hash",
        confirmation: "DELETE", receiptId: "receipt-unused", now, completeBy,
      })).resolves.toEqual({ status: "invalid_code" });

      await expect(acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "correct-hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      })).resolves.toEqual({ status: "accepted", receiptId: "receipt-1", completeBy });

      await expect(getAuthenticatedUserByTokenHash(db, "token-current", "2026-08-24T10:00:01.000Z")).resolves.toBeNull();
      await expect(getAuthenticatedUserByTokenHash(db, "token-other", "2026-08-24T10:00:01.000Z")).resolves.toBeNull();
      const sessions = await db.select().from(authSessions);
      expect(sessions.every((session) => session.revokedAt === now)).toBe(true);
      await db.update(authSessions).set({ revokedAt: null }).where(eq(authSessions.id, "session-other"));
      await expect(getAuthenticatedUserByTokenHash(db, "token-other", "2026-08-24T10:00:01.000Z")).resolves.toBeNull();
      await expect(db.select({ status: gifts.status }).from(gifts).where(eq(gifts.id, "owned-gift")))
        .resolves.toEqual([{ status: "disabled" }]);
      await expect(db.select({ deletionState: users.deletionState }).from(users).where(eq(users.id, user.id)))
        .resolves.toEqual([{ deletionState: "pending" }]);

      await expect(acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "correct-hash",
        confirmation: "DELETE", receiptId: "receipt-2", now, completeBy,
      })).resolves.toEqual({ status: "challenge_used" });
    } finally { await close(); }
  });

  it("rate limits the fourth deletion challenge in a fifteen minute window", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      for (let index = 0; index < 3; index += 1) {
        await createAccountDeletionChallenge(db, {
          id: `challenge-${index}`,
          userId: user.id,
          sessionId: "session-current",
          codeHash: `hash-${index}`,
          createdAt: `2026-08-24T10:0${index}:00.000Z`,
          expiresAt: `2026-08-24T10:1${index}:00.000Z`,
        });
      }

      await expect(isAccountDeletionChallengeRateLimited(db, user.id, "2026-08-24T09:45:00.000Z")).resolves.toBe(true);
      await expect(isAccountDeletionChallengeRateLimited(db, user.id, "2026-08-24T10:01:30.000Z")).resolves.toBe(false);
    } finally { await close(); }
  });

  it("serializes concurrent deletion challenges at the three-challenge window boundary", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      for (let index = 0; index < 2; index += 1) {
        await createAccountDeletionChallenge(db, {
          id: `existing-${index}`, userId: user.id, sessionId: "session-current",
          codeHash: `hash-${index}`, createdAt: `2026-08-24T10:0${index}:00.000Z`,
          expiresAt: "2026-08-24T10:30:00.000Z",
        });
      }
      queries.length = 0;

      const results = await Promise.all([
        createAccountDeletionChallengeIfAllowed(db, {
          id: "concurrent-a", userId: user.id, sessionId: "session-current", codeHash: "hash-a",
          createdAt: "2026-08-24T10:02:00.000Z", expiresAt: "2026-08-24T10:07:00.000Z",
          rateLimitSince: "2026-08-24T09:47:00.000Z",
        }),
        createAccountDeletionChallengeIfAllowed(db, {
          id: "concurrent-b", userId: user.id, sessionId: "session-current", codeHash: "hash-b",
          createdAt: "2026-08-24T10:02:00.000Z", expiresAt: "2026-08-24T10:07:00.000Z",
          rateLimitSince: "2026-08-24T09:47:00.000Z",
        }),
      ]);

      expect(results.sort()).toEqual(["created", "rate_limited"]);
      expect(await db.select().from(accountDeletionChallenges)).toHaveLength(3);
      const statements = queries.join("\n");
      expect(statements).toMatch(/pg_advisory_xact_lock/iu);
      expect(statements.indexOf("pg_advisory_xact_lock")).toBeLessThan(statements.indexOf('from "account_deletion_challenges"'));
    } finally { await close(); }
  });

  it("rejects expired, wrong-session and non-exact confirmation challenges", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createAccountDeletionChallenge(db, {
        id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "correct-hash", createdAt: now, expiresAt,
      });
      const base = { challengeId: "challenge-1", userId: user.id, codeHash: "correct-hash", receiptId: "receipt-1", completeBy };

      await expect(acceptAccountDeletion(db, { ...base, sessionId: "session-other", confirmation: "DELETE", now }))
        .resolves.toEqual({ status: "invalid_challenge" });
      await expect(acceptAccountDeletion(db, { ...base, sessionId: "session-current", confirmation: "delete", now }))
        .resolves.toEqual({ status: "confirmation_required" });
      await expect(acceptAccountDeletion(db, { ...base, sessionId: "session-current", confirmation: "DELETE", now: expiresAt }))
        .resolves.toEqual({ status: "challenge_expired" });
    } finally { await close(); }
  });

  it("deletes private media and identifiable account data idempotently while retaining an anonymous receipt", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "owned-gift", tokenHash: "owned-hash", createdAt: now });
      await claimGiftByTokenHash(db, "owned-hash", user.email, now);
      await db.execute(sql`
        insert into shared_albums (id, gift_id, source_memory_id, title, published_at, version, cover_object_key)
        values ('album-1', 'owned-gift', 'memory-1', 'Private', ${now}, 1, 'private/cover.jpg')
      `);
      await db.execute(sql`
        insert into shared_album_media (id, shared_album_id, position, object_key, content_type, byte_size, created_at)
        values ('media-1', 'album-1', 0, 'private/photo.jpg', 'image/jpeg', 10, ${now})
      `);
      await createAccountDeletionChallenge(db, { id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash", createdAt: now, expiresAt });
      await acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      });
      const deleteObjects = jest.fn(async () => undefined);

      await expect(processAccountDeletionJobs({
        db, store: createStore(deleteObjects), now: new Date("2026-08-24T10:01:00.000Z"), notifyFailure: jest.fn(),
      })).resolves.toEqual(expect.objectContaining({ completed: 1, failed: 0 }));
      await expect(processAccountDeletionJobs({
        db, store: createStore(deleteObjects), now: new Date("2026-08-24T10:02:00.000Z"), notifyFailure: jest.fn(),
      })).resolves.toEqual(expect.objectContaining({ completed: 0, failed: 0 }));

      expect(deleteObjects).toHaveBeenCalledWith(["private/cover.jpg", "private/photo.jpg"], expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
      await expect(db.select().from(users)).resolves.toEqual([]);
      await expect(db.select().from(gifts).where(eq(gifts.id, "owned-gift"))).resolves.toEqual([]);
      await expect(db.select().from(accountDeletionMediaObjects)).resolves.toEqual([]);
      await expect(db.select().from(accountDeletionJobs)).resolves.toEqual([
        expect.objectContaining({ id: "receipt-1", userId: null, accountEmail: null, state: "completed", completedAt: "2026-08-24T10:01:00.000Z" }),
      ]);
    } finally { await close(); }
  });

  it("keeps access revoked, retries failed R2 cleanup and sends only a sanitized support notice", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "owned-gift", tokenHash: "owned-hash", createdAt: now });
      await claimGiftByTokenHash(db, "owned-hash", user.email, now);
      await db.execute(sql`
        insert into shared_albums (id, gift_id, source_memory_id, title, published_at, version, cover_object_key)
        values ('album-1', 'owned-gift', 'memory-1', 'Private', ${now}, 1, 'private/cover.jpg')
      `);
      await createAccountDeletionChallenge(db, { id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash", createdAt: now, expiresAt });
      await acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      });
      const notifyFailure = jest.fn(async () => undefined);

      const first = await processAccountDeletionJobs({
        db, store: createStore(jest.fn(async () => { throw new Error("R2 private/cover.jpg owner@example.com"); })),
        now: new Date("2026-08-24T10:01:00.000Z"), notifyFailure,
      });

      expect(first).toEqual(expect.objectContaining({ completed: 0, failed: 1 }));
      await expect(getAuthenticatedUserByTokenHash(db, "token-current", "2026-08-24T10:01:01.000Z")).resolves.toBeNull();
      expect(notifyFailure).toHaveBeenCalledWith({ receiptId: "receipt-1", errorCode: "account_media_delete_failed", attempt: 1 });
      expect(JSON.stringify(notifyFailure.mock.calls)).not.toContain("owner@example.com");
      expect(JSON.stringify(notifyFailure.mock.calls)).not.toContain("private/cover.jpg");
      const [job] = await db.select().from(accountDeletionJobs).where(eq(accountDeletionJobs.id, "receipt-1"));
      expect(job).toEqual(expect.objectContaining({ state: "pending", lastErrorCode: "account_media_delete_failed", nextAttemptAt: "2026-08-24T10:06:00.000Z" }));
    } finally { await close(); }
  });

  it("captures a winning publication and waits for every upload URL to expire before R2 cleanup", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "owned-gift", tokenHash: "owned-hash", createdAt: now });
      await claimGiftByTokenHash(db, "owned-hash", user.email, now);
      await createGiftPublishSession(db, {
        id: "publish-before-delete",
        giftId: "owned-gift",
        ownerEmail: user.email,
        baseVersion: 0,
        payload: { sourceMemoryId: "memory", title: "Pending", pages: [], media: [{ position: 0, objectKey: "private/temp/photo.jpg", contentType: "image/jpeg", byteSize: 10, source: "upload" }] },
        createdAt: now,
        expiresAt: "2026-08-24T10:15:00.000Z",
      });
      await createGiftPublishSession(db, {
        id: "editor-publish-on-owned-gift",
        giftId: "owned-gift",
        ownerEmail: "other-editor@example.com",
        baseVersion: 0,
        payload: { sourceMemoryId: "memory", title: "Editor pending", pages: [], media: [{ position: 0, objectKey: "private/temp/editor-photo.jpg", contentType: "image/jpeg", byteSize: 10, source: "upload" }] },
        createdAt: now,
        expiresAt: "2026-08-24T10:14:00.000Z",
      });
      await createAccountDeletionChallenge(db, { id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash", createdAt: now, expiresAt });
      queries.length = 0;
      await acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      });

      const [job] = await db.select().from(accountDeletionJobs).where(eq(accountDeletionJobs.id, "receipt-1"));
      expect(job.nextAttemptAt).toBe("2026-08-24T10:16:00.000Z");
      expect(await db.select().from(accountDeletionMediaObjects)).toEqual([
        expect.objectContaining({ objectKey: "private/temp/editor-photo.jpg" }),
        expect.objectContaining({ objectKey: "private/temp/photo.jpg" }),
      ]);
      const deletionQueries = queries.join("\n");
      expect(deletionQueries).toMatch(/from "gifts"[\s\S]*for update/iu);
      expect(deletionQueries.indexOf('from "gifts"')).toBeLessThan(deletionQueries.indexOf('from "shared_album_media"'));

      const deleteObjects = jest.fn(async () => undefined);
      await expect(processAccountDeletionJobs({ db, store: createStore(deleteObjects), now: new Date("2026-08-24T10:15:59.999Z") }))
        .resolves.toEqual({ claimed: 0, completed: 0, failed: 0 });
      await expect(processAccountDeletionJobs({ db, store: createStore(deleteObjects), now: new Date("2026-08-24T10:16:00.000Z") }))
        .resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });
      expect(deleteObjects).toHaveBeenCalledWith(["private/temp/editor-photo.jpg", "private/temp/photo.jpg"], expect.anything());
    } finally { await close(); }
  });

  it("captures an editor's unfinished temp key and absorbs a late reserved final before finalizing", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "other-gift", tokenHash: "other-hash", createdAt: now });
      await claimGiftByTokenHash(db, "other-hash", "other-owner@example.com", now);
      const tempKey = "gifts/other-gift/editor-publish/temp/photo";
      const finalKey = "gifts/other-gift/editor-publish/final/late-attempt/photo";
      await createGiftPublishSession(db, {
        id: "editor-publish", giftId: "other-gift", ownerEmail: user.email,
        baseVersion: 0,
        payload: {
          sourceMemoryId: "memory", title: "Editor draft", pages: [],
          media: [
            { position: 0, objectKey: tempKey, contentType: "image/jpeg", byteSize: 10, source: "upload" },
            { position: 1, objectKey: "gifts/other-gift/live/existing-photo", contentType: "image/jpeg", byteSize: 10, source: "existing" },
          ],
        },
        createdAt: now, expiresAt: "2026-08-24T10:15:00.000Z",
      });
      await createAccountDeletionChallenge(db, {
        id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash", createdAt: now, expiresAt,
      });
      await acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      });

      expect(await db.select().from(accountDeletionMediaObjects)).toEqual([
        expect.objectContaining({ objectKey: tempKey }),
      ]);
      await db.insert(giftMediaCleanupJobs).values({
        id: "late-final-cleanup", giftId: "other-gift", objectKey: finalKey, state: "pending", attempts: 0,
        nextAttemptAt: now, leaseUntil: null, lastError: null, completedAt: null, createdAt: now,
      });
      const deleteObjects = jest.fn(async () => undefined);

      await expect(processAccountDeletionJobs({
        db, store: createStore(deleteObjects), now: new Date("2026-08-24T10:16:00.000Z"), notifyFailure: jest.fn(),
      })).resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });

      expect(deleteObjects).toHaveBeenCalledWith([finalKey, tempKey].sort(), expect.anything());
      await expect(db.select({ status: gifts.status }).from(gifts).where(eq(gifts.id, "other-gift")))
        .resolves.toEqual([{ status: "bound" }]);
      await expect(db.select().from(giftMediaCleanupJobs).where(eq(giftMediaCleanupJobs.id, "late-final-cleanup")))
        .resolves.toEqual([expect.objectContaining({ state: "pending", objectKey: finalKey })]);

      // A promotion copy can land after the account worker's first idempotent delete.
      // Keeping the durable row lets ordinary maintenance delete that late object again.
      const lateDelete = jest.fn(async () => undefined);
      await runGiftMaintenance({
        db, store: createStore(lateDelete), mode: "scheduled", now: new Date("2026-08-24T10:17:00.000Z"),
      });
      expect(lateDelete).toHaveBeenCalledWith([finalKey], expect.anything());
      await expect(db.select().from(giftMediaCleanupJobs).where(eq(giftMediaCleanupJobs.id, "late-final-cleanup")))
        .resolves.toEqual([expect.objectContaining({ state: "completed", objectKey: finalKey })]);
    } finally { await close(); }
  });

  it("blocks a late editor promotion once that account is pending deletion", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "other-gift", tokenHash: "other-hash", createdAt: now });
      await claimGiftByTokenHash(db, "other-hash", "other-owner@example.com", now);
      const payload = {
        sourceMemoryId: "memory", title: "Editor draft", pages: [],
        media: [{ position: 0, objectKey: "gifts/other-gift/editor-publish/temp/photo", contentType: "image/jpeg", byteSize: 10, source: "upload" as const }],
      };
      await createGiftPublishSession(db, {
        id: "editor-publish", giftId: "other-gift", ownerEmail: user.email,
        baseVersion: 0, payload, createdAt: now, expiresAt: "2026-08-24T10:15:00.000Z",
      });
      await createAccountDeletionChallenge(db, {
        id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash", createdAt: now, expiresAt,
      });
      await acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      });
      const store = createStore();

      await expect(promoteSharedPublicationDurably({
        db, store, giftId: "other-gift", sessionId: "editor-publish", ownerEmail: user.email,
        payload, now: "2026-08-24T10:00:01.000Z",
      })).rejects.toBeInstanceOf(GiftPublicationUnavailableError);
      expect(store.copyObject).not.toHaveBeenCalled();
    } finally { await close(); }
  });

  it("rejects a publication that loses the gift row lock to deletion", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      const user = await seedAccount(db);
      await createGift(db, { id: "owned-gift", tokenHash: "owned-hash", createdAt: now });
      await claimGiftByTokenHash(db, "owned-hash", user.email, now);
      await createAccountDeletionChallenge(db, { id: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash", createdAt: now, expiresAt });
      await acceptAccountDeletion(db, {
        challengeId: "challenge-1", userId: user.id, sessionId: "session-current", codeHash: "hash",
        confirmation: "DELETE", receiptId: "receipt-1", now, completeBy,
      });
      queries.length = 0;

      await expect(createGiftPublishSession(db, {
        id: "publish-after-delete",
        giftId: "owned-gift",
        ownerEmail: user.email,
        baseVersion: 0,
        payload: { sourceMemoryId: "memory", title: "Too late", pages: [], media: [{ position: 0, objectKey: "private/orphan.jpg", contentType: "image/jpeg", byteSize: 10 }] },
        createdAt: "2026-08-24T10:00:01.000Z",
        expiresAt: "2026-08-24T10:15:01.000Z",
      })).rejects.toBeInstanceOf(GiftPublicationUnavailableError);
      expect(await db.select().from(giftPublishSessions)).toEqual([]);
      expect(queries.join("\n")).toMatch(/from "users"[\s\S]*for update/iu);
      expect(queries.join("\n")).not.toMatch(/select id from gifts where id = .*for update/iu);
    } finally { await close(); }
  });
});
