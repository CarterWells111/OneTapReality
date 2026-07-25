import {
  consumeAuthEmailCode,
  createAuthEmailCode,
  createAuthSession,
  createOrGetUserByEmail,
  getAuthenticatedUserByTokenHash,
  revokeAuthSessionByTokenHash,
} from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";

describe("account authentication repository", () => {
  it("creates one canonical user for a normalized email", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const first = await createOrGetUserByEmail(db, " Owner@Example.com ", "2026-07-25T00:00:00.000Z");
      const second = await createOrGetUserByEmail(db, "owner@example.com", "2026-07-25T00:01:00.000Z");

      expect(first).toEqual(expect.objectContaining({ email: "owner@example.com" }));
      expect(second.id).toBe(first.id);
    } finally { await close(); }
  });

  it("consumes an unexpired login code once", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createAuthEmailCode(db, { id: "code-1", email: "owner@example.com", codeHash: "hash", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T00:05:00.000Z" });

      await expect(consumeAuthEmailCode(db, "owner@example.com", "hash", "2026-07-25T00:01:00.000Z")).resolves.toBe(true);
      await expect(consumeAuthEmailCode(db, "owner@example.com", "hash", "2026-07-25T00:01:00.000Z")).resolves.toBe(false);
    } finally { await close(); }
  });

  it("does not authenticate revoked or expired sessions", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const user = await createOrGetUserByEmail(db, "owner@example.com", "2026-07-25T00:00:00.000Z");
      await createAuthSession(db, { id: "session-1", userId: user.id, tokenHash: "token-hash", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-08-24T00:00:00.000Z" });

      await expect(getAuthenticatedUserByTokenHash(db, "token-hash", "2026-07-26T00:00:00.000Z")).resolves.toEqual(expect.objectContaining({ id: user.id, email: "owner@example.com" }));
      await revokeAuthSessionByTokenHash(db, "token-hash", "2026-07-26T00:00:00.000Z");
      await expect(getAuthenticatedUserByTokenHash(db, "token-hash", "2026-07-26T00:00:01.000Z")).resolves.toBeNull();
    } finally { await close(); }
  });
});
