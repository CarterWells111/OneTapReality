import { eq, sql } from "drizzle-orm";

import {
  acceptAccountDeletion,
  createAccountDeletionChallenge,
  isAccountDeletionChallengeRateLimited,
  processAccountDeletionJobs,
} from "../src/server/auth/account-deletion";
import { createAuthSession, createOrGetUserByEmail, getAuthenticatedUserByTokenHash } from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import {
  accountDeletionJobs,
  accountDeletionMediaObjects,
  authSessions,
  gifts,
  users,
} from "../src/server/db/schema";
import { claimGiftByTokenHash, createGift } from "../src/server/gifts/repository";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";

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
});
