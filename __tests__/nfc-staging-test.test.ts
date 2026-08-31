import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const modulePath = join(process.cwd(), "scripts", "nfc-staging-test-helpers.cjs");

type ScenarioName = "unclaimed" | "owner" | "viewer" | "editor" | "disabled";

function loadHelpers() {
  if (!existsSync(modulePath)) return null;
  return require(modulePath) as {
    CONFIRMATION: string;
    STAGING_API_ORIGIN: string;
    STAGING_GIFT_ORIGIN: string;
    STAGING_R2_BUCKET: string;
    assertStagingConfiguration: (input: Record<string, string>) => void;
    deriveRoleEmails: (baseEmail: string) => { owner: string; viewer: string; editor: string };
    extractGiftToken: (giftUrl: string) => string;
    createInitialManifest: (baseEmail: string, batchId?: string) => Record<string, any>;
    writeManifestAtomic: (path: string, manifest: unknown) => void;
    buildLocalLabSource: (manifest: Record<string, any>) => string;
    formatInspectionSummary: (manifest: Record<string, any>) => string;
    assertGuardState: (input: { labExists: boolean; manifestExists: boolean; trackedText: string; environment?: Record<string, string | undefined> }) => void;
    seedScenarioMatrix: (input: Record<string, any>) => Promise<Record<string, any>>;
    cleanupScenarioMatrix: (input: Record<string, any>) => Promise<Record<string, any>>;
    rollbackFailedSeed: (input: Record<string, any>) => Promise<Record<string, any>>;
    createStagingApiClient: (input: Record<string, any>) => Record<string, (...args: any[]) => Promise<any>>;
    installLocalLab: (input: { manifest: Record<string, any>; labPath: string }) => void;
    removeLocalArtifacts: (input: { labPath: string; manifestPath: string }) => void;
  };
}

describe("NFC staging test lab helpers", () => {
  it("provides the staging helper module", () => {
    expect(existsSync(modulePath)).toBe(true);
  });

  it("accepts only the fixed staging environment and explicit confirmation", () => {
    const helpers = loadHelpers()!;
    const valid = {
      apiOrigin: "https://api-staging.onetapreality.com",
      giftOrigin: "https://staging.onetapreality.com",
      r2Bucket: "onetapreality-staging",
      confirmation: "CREATE-NFC-STAGING-LAB",
    };

    expect(() => helpers.assertStagingConfiguration(valid)).not.toThrow();
    for (const [key, value] of [
      ["apiOrigin", "https://api.onetapreality.com"],
      ["giftOrigin", "https://onetapreality.com"],
      ["r2Bucket", "onetapreality-production"],
      ["confirmation", "yes"],
    ]) {
      expect(() => helpers.assertStagingConfiguration({ ...valid, [key]: value })).toThrow(/staging/iu);
    }
  });

  it("derives three normalized plus-alias accounts without retaining an old tag", () => {
    const helpers = loadHelpers()!;
    expect(helpers.deriveRoleEmails("  Tester+old@Example.COM ")).toEqual({
      owner: "tester+nfc-owner@example.com",
      viewer: "tester+nfc-viewer@example.com",
      editor: "tester+nfc-editor@example.com",
    });
    expect(() => helpers.deriveRoleEmails("not-an-email")).toThrow(/email/iu);
  });

  it("extracts tokens only from the exact staging gift origin", () => {
    const helpers = loadHelpers()!;
    expect(helpers.extractGiftToken("https://staging.onetapreality.com/gift/token_123-abc")).toBe("token_123-abc");
    expect(() => helpers.extractGiftToken("https://onetapreality.com/gift/token_123-abc")).toThrow(/staging/iu);
    expect(() => helpers.extractGiftToken("https://staging.onetapreality.com/gift/token/extra")).toThrow(/gift URL/iu);
  });

  it("writes an incremental local manifest atomically", () => {
    const helpers = loadHelpers()!;
    const directory = mkdtempSync(join(tmpdir(), "nfc-manifest-"));
    const path = join(directory, "nested", "active.json");
    try {
      const manifest = helpers.createInitialManifest("tester@example.com", "20260821-120000");
      helpers.writeManifestAtomic(path, manifest);
      expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
        version: 1,
        batchId: "20260821-120000",
        phase: "seeding",
        scenarios: {},
      });
      expect(existsSync(`${path}.tmp`)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("generates a local route with six real gift routes and three idempotent demo albums", () => {
    const helpers = loadHelpers()!;
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    manifest.scenarios = Object.fromEntries([
      "unclaimed", "owner", "viewer", "editor", "disabled",
    ].map((name) => [name, { token: `secret-${name}`, giftId: `gift-${name}`, cardId: `card-${name}` }]));
    manifest.invalidToken = "secret-invalid";

    const source = helpers.buildLocalLabSource(manifest);
    for (const label of ["未认领", "Owner 已认领", "Viewer 待激活", "Editor 待激活", "已停用", "无效 Token"]) {
      expect(source).toContain(label);
    }
    for (const token of ["secret-unclaimed", "secret-owner", "secret-viewer", "secret-editor", "secret-disabled", "secret-invalid"]) {
      expect(source).toContain(`/gift/${token}`);
    }
    for (const title of ["[NFC Demo] 杭州西湖", "[NFC Demo] 上海夜行", "[NFC Demo] 香港海风"]) {
      expect(source).toContain(title);
    }
    expect(source).toContain("memories.some");
    expect(source).not.toContain("GIFT_TOKEN_PEPPER");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    expect(compiled.diagnostics ?? []).toEqual([]);
  });

  it("formats inspection output without tokens or full gift URLs", () => {
    const helpers = loadHelpers()!;
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    manifest.scenarios = {
      viewer: { token: "top-secret-token", giftId: "gift-viewer", cardId: "card-viewer", state: "active" },
    };
    const summary = helpers.formatInspectionSummary(manifest);
    expect(summary).toContain("viewer");
    expect(summary).toContain("gift-viewer");
    expect(summary).not.toContain("top-secret-token");
    expect(summary).not.toContain("/gift/");
  });

  it("blocks PR preparation while local lab, active manifest, or tracked token residue exists", () => {
    const helpers = loadHelpers()!;
    expect(() => helpers.assertGuardState({ labExists: false, manifestExists: false, trackedText: "clean" })).not.toThrow();
    expect(() => helpers.assertGuardState({ labExists: true, manifestExists: false, trackedText: "clean" })).toThrow(/Lab/iu);
    expect(() => helpers.assertGuardState({ labExists: false, manifestExists: true, trackedText: "clean" })).toThrow(/manifest/iu);
    expect(() => helpers.assertGuardState({ labExists: false, manifestExists: false, trackedText: "const leaked = '/gift/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AB';" })).toThrow(/token/iu);
    expect(() => helpers.assertGuardState({ labExists: false, manifestExists: false, trackedText: "clean", environment: { NFC_TEST_API_ORIGIN: "https://api.onetapreality.com" } })).toThrow(/production/iu);
    expect(() => helpers.assertGuardState({ labExists: false, manifestExists: false, trackedText: "const account = 'tester+nfc-owner@example.com';" })).toThrow(/email/iu);
  });

  it("seeds the five scenarios through existing admin and owner operations without pre-activating invitees", async () => {
    const helpers = loadHelpers()!;
    const calls: string[] = [];
    const client = {
      reserveCard: jest.fn(async (note: string) => {
        const scenario = note.split(":").at(-1)! as ScenarioName;
        calls.push(`reserve:${scenario}`);
        return { cardId: `card-${scenario}`, giftUrl: `https://staging.onetapreality.com/gift/token-${scenario}` };
      }),
      activateCard: jest.fn(async (cardId: string) => { calls.push(`activate:${cardId}`); }),
      claimGift: jest.fn(async (token: string) => {
        const scenario = token.replace("token-", "");
        calls.push(`claim:${scenario}`);
        return { id: `gift-${scenario}` };
      }),
      addMember: jest.fn(async (giftId: string, _email: string, role: string) => { calls.push(`member:${giftId}:${role}`); }),
      publishAlbum: jest.fn(async (giftId: string) => { calls.push(`publish:${giftId}`); return { albumId: `album-${giftId}` }; }),
      disableGift: jest.fn(async (giftId: string) => { calls.push(`disable:${giftId}`); }),
    };
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    const persisted: string[] = [];

    const result = await helpers.seedScenarioMatrix({
      client,
      manifest,
      persist: async (next: Record<string, any>) => { persisted.push(next.phase); },
      invalidToken: "invalid-local-token",
    });

    expect(Object.keys(result.scenarios)).toEqual(["unclaimed", "owner", "viewer", "editor", "disabled"]);
    expect(result.phase).toBe("ready");
    expect(result.invalidToken).toBe("invalid-local-token");
    expect(client.addMember).toHaveBeenCalledTimes(2);
    expect(client.publishAlbum).toHaveBeenCalledTimes(2);
    expect(client.disableGift).toHaveBeenCalledTimes(1);
    expect(calls.some((call) => call.includes("activateViewer"))).toBe(false);
    expect(persisted.length).toBeGreaterThanOrEqual(6);
  });

  it("revokes every seeded scenario and retains the manifest until maintenance succeeds", async () => {
    const helpers = loadHelpers()!;
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    manifest.phase = "ready";
    manifest.scenarios = {
      unclaimed: { cardId: "card-unclaimed", state: "active" },
      owner: { giftId: "gift-owner", state: "bound" },
      viewer: { giftId: "gift-viewer", state: "published" },
      editor: { giftId: "gift-editor", state: "member_added" },
      disabled: { giftId: "gift-disabled", state: "disabled" },
    };
    const client = {
      retireCard: jest.fn(async () => undefined),
      disableGift: jest.fn(async () => undefined),
      runMaintenance: jest.fn(async () => ({ pending: 0, failed: 0 })),
    };
    const persisted: string[] = [];

    await helpers.cleanupScenarioMatrix({ client, manifest, persist: async (next: Record<string, any>) => { persisted.push(next.phase); } });

    expect(client.retireCard).toHaveBeenCalledWith("card-unclaimed");
    expect(client.disableGift).toHaveBeenCalledTimes(3);
    expect(client.disableGift).not.toHaveBeenCalledWith("gift-disabled");
    expect(client.runMaintenance).toHaveBeenCalledTimes(1);
    expect(manifest.phase).toBe("remote_cleaned");
    expect(Object.values(manifest.scenarios).every((scenario: any) => scenario.state === "revoked")).toBe(true);
    expect(persisted).toContain("cleaning");
  });

  it("keeps cleanup retryable when media maintenance does not finish", async () => {
    const helpers = loadHelpers()!;
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    manifest.phase = "ready";
    manifest.scenarios = { owner: { giftId: "gift-owner", state: "bound" } };
    const client = {
      retireCard: jest.fn(),
      disableGift: jest.fn(async () => undefined),
      runMaintenance: jest.fn(async () => ({ pending: 1, failed: 0 })),
    };

    await expect(helpers.cleanupScenarioMatrix({ client, manifest, persist: async () => undefined })).rejects.toThrow(/maintenance/iu);
    expect(manifest.phase).toBe("cleanup_failed");
    expect(manifest.scenarios.owner.state).toBe("revoked");
  });

  it("best-effort rolls back every created resource after a partial seed failure", async () => {
    const helpers = loadHelpers()!;
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    manifest.phase = "seed_failed";
    manifest.scenarios = {
      unclaimed: { cardId: "card-unclaimed", giftId: "gift-unclaimed", state: "active" },
      owner: { cardId: "card-owner", giftId: "gift-owner", state: "bound" },
      viewer: { cardId: "card-viewer", giftId: "gift-viewer", state: "active" },
    };
    const client = {
      retireCard: jest.fn(async () => undefined),
      disableGift: jest.fn(async () => undefined),
      runMaintenance: jest.fn(async () => ({ pending: 0, failed: 0 })),
    };

    await helpers.rollbackFailedSeed({ client, manifest, persist: async () => undefined });

    expect(client.retireCard).toHaveBeenCalledTimes(2);
    expect(client.disableGift).toHaveBeenCalledWith("gift-owner");
    expect(manifest.phase).toBe("seed_rolled_back");
    expect(Object.values(manifest.scenarios).every((scenario: any) => scenario.state === "revoked")).toBe(true);
  });

  it("reconciles remote success before resuming an interrupted idempotent seed", async () => {
    const helpers = loadHelpers()!;
    const manifest = helpers.createInitialManifest("tester@example.com", "batch");
    manifest.phase = "seed_failed";
    manifest.scenarios = {
      unclaimed: { cardId: "card-unclaimed", giftId: "gift-unclaimed", token: "token-unclaimed", state: "active" },
      owner: { cardId: "card-owner", giftId: "gift-owner", token: "token-owner", state: "active" },
      viewer: { cardId: "card-viewer", giftId: "gift-viewer", token: "token-viewer", state: "bound" },
      editor: { cardId: "card-editor", giftId: "gift-editor", token: "token-editor", state: "published", albumId: "album-editor" },
      disabled: { cardId: "card-disabled", giftId: "gift-disabled", token: "token-disabled", state: "bound" },
    };
    const client = {
      getCard: jest.fn(async (cardId: string) => ({ card: {
        giftId: cardId.replace("card-", "gift-"),
        state: "active",
        giftStatus: cardId === "card-disabled" ? "disabled" : cardId === "card-owner" ? "bound" : "unclaimed",
      } })),
      getOwnedGift: jest.fn(async (giftId: string) => ({
        gift: { id: giftId },
        members: giftId === "gift-viewer" ? [{ email: "tester+nfc-viewer@example.com", role: "viewer" }] : [],
        album: giftId === "gift-viewer" ? { id: "album-viewer", sourceMemoryId: "nfc-lab:viewer" } : null,
      })),
      claimGift: jest.fn(), addMember: jest.fn(), publishAlbum: jest.fn(), disableGift: jest.fn(),
    };

    await helpers.seedScenarioMatrix({ client, manifest, persist: async () => undefined, invalidToken: "invalid" });

    expect(client.claimGift).not.toHaveBeenCalled();
    expect(client.addMember).not.toHaveBeenCalled();
    expect(client.publishAlbum).not.toHaveBeenCalled();
    expect(client.disableGift).not.toHaveBeenCalled();
    expect(manifest.scenarios.owner.state).toBe("bound");
    expect(manifest.scenarios.viewer.state).toBe("published");
    expect(manifest.scenarios.disabled.state).toBe("disabled");
    expect(manifest.phase).toBe("ready");
  });

  it("uses the existing staging APIs and keeps authorization tokens out of request bodies", async () => {
    const helpers = loadHelpers()!;
    const requests: { url: string; init: RequestInit }[] = [];
    const request = jest.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith("/api/admin/gift-cards")) return new Response(JSON.stringify({ cardId: "card", giftUrl: "https://staging.onetapreality.com/gift/token" }), { status: 201, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/admin/gift-cards/card")) return new Response(JSON.stringify({ card: { id: "card", giftId: "gift", state: "active" }, events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/claim")) return new Response(JSON.stringify({ id: "gift" }), { status: 201, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/members")) return new Response(JSON.stringify({ members: [] }), { status: 201, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/my-gifts/gift-1/manage")) return new Response(JSON.stringify({ gift: { id: "gift-1" }, members: [], album: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/gifts/invited")) return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/internal/gift-maintenance")) return new Response(JSON.stringify({ skipped: true, claimedCleanupJobs: 0, completedCleanupJobs: 0, failedCleanupJobs: 0, deadLetteredCleanupJobs: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(null, { status: 204 });
    });
    const client = helpers.createStagingApiClient({
      apiOrigin: "https://api-staging.onetapreality.com",
      adminAccessToken: "admin-secret",
      ownerAccessToken: "owner-secret",
      maintenanceSecret: "maintenance-secret",
      request,
    });

    await client.reserveCard("NFC-LAB:batch:owner");
    await client.claimGift("gift-token");
    await client.addMember("gift-1", "viewer@example.com", "viewer");
    await client.getCard("card");
    await client.getOwnedGift("gift-1");
    await client.listInvited("viewer-secret");
    const maintenance = await client.runMaintenance();

    expect(requests.map((item) => item.url)).toEqual([
      "https://api-staging.onetapreality.com/api/admin/gift-cards",
      "https://api-staging.onetapreality.com/api/gifts/gift-token/claim",
      "https://api-staging.onetapreality.com/api/my-gifts/gift-1/members",
      "https://api-staging.onetapreality.com/api/admin/gift-cards/card",
      "https://api-staging.onetapreality.com/api/my-gifts/gift-1/manage",
      "https://api-staging.onetapreality.com/api/gifts/invited",
      "https://api-staging.onetapreality.com/api/internal/gift-maintenance",
    ]);
    expect(new Headers(requests[0].init.headers).get("Authorization")).toBe("Bearer admin-secret");
    expect(new Headers(requests[1].init.headers).get("Authorization")).toBe("Bearer owner-secret");
    expect(new Headers(requests[5].init.headers).get("Authorization")).toBe("Bearer viewer-secret");
    expect(new Headers(requests[6].init.headers).get("x-gift-maintenance-secret")).toBe("maintenance-secret");
    expect(maintenance.pending).toBe(1);
    expect(requests.map((item) => String(item.init.body ?? "")).join("\n")).not.toContain("admin-secret");
    expect(requests.map((item) => String(item.init.body ?? "")).join("\n")).not.toContain("owner-secret");
  });

  it("installs and removes only the exact ignored local artifacts", () => {
    const helpers = loadHelpers()!;
    const directory = mkdtempSync(join(tmpdir(), "nfc-local-lab-"));
    const labPath = join(directory, "src", "app", "nfc-lab-local.tsx");
    const manifestPath = join(directory, ".data", "nfc-staging", "active.json");
    try {
      const manifest = helpers.createInitialManifest("tester@example.com", "batch");
      manifest.scenarios = Object.fromEntries(["unclaimed", "owner", "viewer", "editor", "disabled"].map((name) => [name, { token: `token-${name}` }]));
      manifest.invalidToken = "token-invalid";
      helpers.installLocalLab({ manifest, labPath });
      helpers.writeManifestAtomic(manifestPath, manifest);
      expect(readFileSync(labPath, "utf8")).toContain("LOCAL ONLY");

      helpers.removeLocalArtifacts({ labPath, manifestPath });
      expect(existsSync(labPath)).toBe(false);
      expect(existsSync(manifestPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not treat open staging accounts as temporary allowlist entries", () => {
    const helpers = loadHelpers()!;
    expect(helpers).not.toHaveProperty("verifyAllowlistRollback");
  });
});
