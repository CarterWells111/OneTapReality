import {
  consumeAuthEmailCode,
  createAuthEmailCode,
  createAuthEmailCodeIfAllowed,
  createAuthSession,
  createOrGetUserByEmail,
  deleteAuthEmailCodeById,
  getAuthenticatedUserByTokenHash,
  purgeAuthTechnicalData,
  revokeAuthSessionByTokenHash,
  verifyAccountEmailCode,
} from "../src/server/auth/repository";
import { authEmailCodes, authRateLimits } from "../src/server/db/schema";
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

  it("invalidates an older code when a replacement is issued", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      await createAuthEmailCode(db, { id: "code-1", email: "owner@example.com", codeHash: "old", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T00:05:00.000Z" });
      await createAuthEmailCode(db, { id: "code-2", email: "owner@example.com", codeHash: "new", createdAt: "2026-07-25T00:01:00.000Z", expiresAt: "2026-07-25T00:06:00.000Z" });

      const codes = await db.select().from(authEmailCodes);
      expect(codes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "code-1", consumedAt: "2026-07-25T00:01:00.000Z" }),
        expect.objectContaining({ id: "code-2", consumedAt: null, failedAttempts: 0 }),
      ]));
      expect(queries.join("\n")).toMatch(/pg_advisory_xact_lock/iu);
    } finally { await close(); }
  });

  it("serializes concurrent login-code requests at the five-code window boundary", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      for (let index = 0; index < 4; index += 1) {
        await createAuthEmailCode(db, {
          id: `existing-${index}`,
          email: "owner@example.com",
          codeHash: `existing-hash-${index}`,
          createdAt: `2026-08-24T10:0${index}:00.000Z`,
          expiresAt: "2026-08-24T10:30:00.000Z",
        });
      }
      queries.length = 0;

      const results = await Promise.all([
        createAuthEmailCodeIfAllowed(db, {
          id: "concurrent-a", email: " Owner@Example.com ", codeHash: "hash-a",
          createdAt: "2026-08-24T10:04:00.000Z", expiresAt: "2026-08-24T10:09:00.000Z",
          rateLimitSince: "2026-08-24T09:49:00.000Z",
        }),
        createAuthEmailCodeIfAllowed(db, {
          id: "concurrent-b", email: "owner@example.com", codeHash: "hash-b",
          createdAt: "2026-08-24T10:04:00.000Z", expiresAt: "2026-08-24T10:09:00.000Z",
          rateLimitSince: "2026-08-24T09:49:00.000Z",
        }),
      ]);

      expect(results.sort()).toEqual(["created", "rate_limited"]);
      expect(await db.select().from(authEmailCodes)).toHaveLength(5);
      const statements = queries.join("\n");
      expect(statements).toMatch(/pg_advisory_xact_lock/iu);
      expect(statements.indexOf("pg_advisory_xact_lock")).toBeLessThan(statements.indexOf('from "auth_email_codes"'));
    } finally { await close(); }
  });

  it("rate limits the twenty-first email issue across different addresses in one IP window", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      queries.length = 0;
      const issueScope = {
        issueScopeHash: "opaque-issue-ip-window",
        issueWindowStartedAt: "2026-08-31T10:00:00.000Z",
        issueExpiresAt: "2026-08-31T10:15:00.000Z",
      };

      for (let index = 0; index < 20; index += 1) {
        await expect(createAuthEmailCodeIfAllowed(db, {
          id: `issue-${index}`,
          email: `user-${index}@example.com`,
          codeHash: `hash-${index}`,
          createdAt: "2026-08-31T10:01:00.000Z",
          expiresAt: "2026-08-31T10:06:00.000Z",
          rateLimitSince: "2026-08-31T09:46:00.000Z",
          ...issueScope,
        })).resolves.toBe("created");
      }

      await expect(createAuthEmailCodeIfAllowed(db, {
        id: "issue-20",
        email: "user-20@example.com",
        codeHash: "hash-20",
        createdAt: "2026-08-31T10:01:00.000Z",
        expiresAt: "2026-08-31T10:06:00.000Z",
        rateLimitSince: "2026-08-31T09:46:00.000Z",
        ...issueScope,
      })).resolves.toBe("rate_limited");
      await expect(db.select().from(authEmailCodes)).resolves.toHaveLength(20);
      await expect(db.select().from(authRateLimits)).resolves.toEqual([
        expect.objectContaining({ scopeHash: issueScope.issueScopeHash, attempts: 20 }),
      ]);
      const firstIssueLock = queries.findIndex((query) => query.includes("auth-email-issue-ip"));
      const firstEmailLock = queries.findIndex((query) => query.includes("auth-email-code"));
      const firstEmailLimitCheck = queries.findIndex((query) => query.includes('from "auth_email_codes"'));
      const firstIpLimitCheck = queries.findIndex((query) => query.includes('from "auth_rate_limits"'));
      expect(firstIssueLock).toBeGreaterThanOrEqual(0);
      expect(firstIssueLock).toBeLessThan(firstEmailLock);
      expect(firstEmailLock).toBeLessThan(firstEmailLimitCheck);
      expect(firstEmailLimitCheck).toBeLessThan(firstIpLimitCheck);
    } finally { await close(); }
  });

  it("releases an IP issue count only when its issued code is deleted", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const issueScopeHash = "opaque-delivery-failure-window";
      await createAuthEmailCodeIfAllowed(db, {
        id: "delivery-failed-code",
        email: "delivery@example.com",
        codeHash: "delivery-hash",
        createdAt: "2026-08-31T10:01:00.000Z",
        expiresAt: "2026-08-31T10:06:00.000Z",
        rateLimitSince: "2026-08-31T09:46:00.000Z",
        issueScopeHash,
        issueWindowStartedAt: "2026-08-31T10:00:00.000Z",
        issueExpiresAt: "2026-08-31T10:15:00.000Z",
      });

      await expect(deleteAuthEmailCodeById(db, "delivery-failed-code", issueScopeHash)).resolves.toBe(true);
      await expect(db.select().from(authRateLimits)).resolves.toEqual([
        expect.objectContaining({ scopeHash: issueScopeHash, attempts: 0 }),
      ]);
      await expect(deleteAuthEmailCodeById(db, "delivery-failed-code", issueScopeHash)).resolves.toBe(false);
      await expect(db.select().from(authRateLimits)).resolves.toEqual([
        expect.objectContaining({ scopeHash: issueScopeHash, attempts: 0 }),
      ]);
    } finally { await close(); }
  });

  it("atomically consumes a code and creates its account session", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createAuthEmailCode(db, { id: "code-1", email: "owner@example.com", codeHash: "correct", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T00:05:00.000Z" });

      const result = await verifyAccountEmailCode(db, {
        email: "owner@example.com",
        codeHash: "correct",
        now: "2026-07-25T00:01:00.000Z",
        ipScopeHash: "ip-window-1",
        ipWindowStartedAt: "2026-07-25T00:00:00.000Z",
        ipExpiresAt: "2026-07-25T00:15:00.000Z",
        session: { id: "session-1", tokenHash: "token-hash", createdAt: "2026-07-25T00:01:00.000Z", expiresAt: "2026-08-24T00:01:00.000Z" },
      });

      expect(result).toEqual({ status: "success", user: expect.objectContaining({ email: "owner@example.com" }) });
      await expect(getAuthenticatedUserByTokenHash(db, "token-hash", "2026-07-26T00:00:00.000Z")).resolves.toEqual(expect.objectContaining({ email: "owner@example.com" }));
      await expect(consumeAuthEmailCode(db, "owner@example.com", "correct", "2026-07-25T00:02:00.000Z")).resolves.toBe(false);
    } finally { await close(); }
  });

  it("locks a verification code after five failures and rate limits an IP window", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createAuthEmailCode(db, { id: "code-1", email: "owner@example.com", codeHash: "correct", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T00:05:00.000Z" });
      const input = {
        email: "owner@example.com",
        codeHash: "wrong",
        now: "2026-07-25T00:01:00.000Z",
        ipScopeHash: "ip-window-1",
        ipWindowStartedAt: "2026-07-25T00:00:00.000Z",
        ipExpiresAt: "2026-07-25T00:15:00.000Z",
        session: { id: "unused", tokenHash: "unused", createdAt: "2026-07-25T00:01:00.000Z", expiresAt: "2026-08-24T00:01:00.000Z" },
      };

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(verifyAccountEmailCode(db, input)).resolves.toEqual({ status: "invalid" });
      }
      await expect(verifyAccountEmailCode(db, input)).resolves.toEqual({ status: "rate_limited" });
      const [code] = await db.select().from(authEmailCodes);
      expect(code.failedAttempts).toBe(5);
    } finally { await close(); }
  });

  it("takes row locks before enforcing concurrent code and IP attempt limits", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      queries.length = 0;
      await createAuthEmailCode(db, { id: "code-1", email: "owner@example.com", codeHash: "correct", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T00:05:00.000Z" });
      queries.length = 0;
      await verifyAccountEmailCode(db, {
        email: "owner@example.com",
        codeHash: "wrong",
        now: "2026-07-25T00:01:00.000Z",
        ipScopeHash: "ip-window-1",
        ipWindowStartedAt: "2026-07-25T00:00:00.000Z",
        ipExpiresAt: "2026-07-25T00:15:00.000Z",
        session: { id: "unused", tokenHash: "unused", createdAt: "2026-07-25T00:01:00.000Z", expiresAt: "2026-08-24T00:01:00.000Z" },
      });

      const verificationQueries = queries.join("\n");
      expect(verificationQueries).toMatch(/pg_advisory_xact_lock/iu);
      expect(verificationQueries).toMatch(/from "auth_rate_limits"[\s\S]*for update/iu);
      expect(verificationQueries).toMatch(/from "auth_email_codes"[\s\S]*for update/iu);
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

  it("purges only authentication data older than its retention cutoffs", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createAuthEmailCode(db, { id: "old-code", email: "old@example.com", codeHash: "old", createdAt: "2026-07-24T00:00:00.000Z", expiresAt: "2026-07-24T00:05:00.000Z" });
      await createAuthEmailCode(db, { id: "new-code", email: "new@example.com", codeHash: "new", createdAt: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T00:05:00.000Z" });

      await expect(purgeAuthTechnicalData(db, {
        codeCutoff: "2026-07-24T18:00:00.000Z",
        sessionCutoff: "2026-07-18T00:00:00.000Z",
        rateLimitCutoff: "2026-07-24T18:00:00.000Z",
        limit: 100,
      })).resolves.toEqual({ codes: 1, sessions: 0, rateLimits: 0 });
      await expect(db.select().from(authEmailCodes)).resolves.toEqual([expect.objectContaining({ id: "new-code" })]);
    } finally { await close(); }
  });
});
