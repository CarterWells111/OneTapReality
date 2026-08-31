import { existsSync } from "node:fs";
import { join } from "node:path";

const cliPath = join(process.cwd(), "scripts", "nfc-staging-test.cjs");

function loadCli() {
  if (!existsSync(cliPath)) return null;
  return require(cliPath) as {
    parseArgs: (argv: string[]) => { command: string };
    loginWithEmail: (input: Record<string, any>) => Promise<{ accessToken: string; user: { email: string } }>;
    inspectScenarioMatrix: (input: Record<string, any>) => Promise<Record<string, any>>;
    purgeBatchRecords: (input: Record<string, any>) => Promise<void>;
    resolveSeedManifest: (input: Record<string, any>) => Record<string, any>;
  };
}

describe("NFC staging test CLI", () => {
  it("provides an import-safe CLI module", () => {
    expect(existsSync(cliPath)).toBe(true);
  });

  it("accepts only the four documented commands", () => {
    const cli = loadCli()!;
    for (const command of ["seed", "inspect", "prepare-pr", "guard"]) {
      expect(cli.parseArgs([command])).toEqual({ command });
    }
    expect(() => cli.parseArgs([])).toThrow(/seed.*inspect.*prepare-pr.*guard/iu);
    expect(() => cli.parseArgs(["deploy"])).toThrow(/unknown/iu);
  });

  it("resumes only the matching local staging manifest when no Lab route is installed", () => {
    const cli = loadCli()!;
    const existing = {
      version: 1, batchId: "batch", phase: "seed_failed",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftOrigin: "https://staging.onetapreality.com",
      r2Bucket: "onetapreality-staging",
      roleEmails: { owner: "tester+nfc-owner@example.com", viewer: "tester+nfc-viewer@example.com", editor: "tester+nfc-editor@example.com" },
      scenarios: {},
    };
    expect(cli.resolveSeedManifest({ baseEmail: "tester@example.com", labExists: false, existingManifest: existing })).toBe(existing);
    expect(() => cli.resolveSeedManifest({ baseEmail: "other@example.com", labExists: false, existingManifest: existing })).toThrow(/email/iu);
    expect(() => cli.resolveSeedManifest({ baseEmail: "tester@example.com", labExists: true, existingManifest: existing })).toThrow(/Lab/iu);
  });

  it("requests and verifies a real staging email code without logging credentials", async () => {
    const cli = loadCli()!;
    const calls: { url: string; body: string }[] = [];
    const request = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body ?? "") });
      if (url.endsWith("/request")) return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 202, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ accessToken: "access-secret", user: { email: "owner@example.com" } }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const prompt = jest.fn(async () => "123456");
    const log = jest.fn();

    const session = await cli.loginWithEmail({
      apiOrigin: "https://api-staging.onetapreality.com",
      email: "owner@example.com",
      request,
      prompt,
      log,
    });

    expect(session.accessToken).toBe("access-secret");
    expect(calls.map((call) => call.url)).toEqual([
      "https://api-staging.onetapreality.com/api/auth/request",
      "https://api-staging.onetapreality.com/api/auth/verify",
    ]);
    expect(calls[1].body).toContain("123456");
    expect(log.mock.calls.flat().join(" ")).not.toContain("123456");
    expect(log.mock.calls.flat().join(" ")).not.toContain("access-secret");
  });

  it("inspects card, owner album, and invite activation without exposing scenario tokens", async () => {
    const cli = loadCli()!;
    const manifest = {
      batchId: "batch",
      scenarios: {
        viewer: { cardId: "card-viewer", giftId: "gift-viewer", token: "secret-viewer" },
        editor: { cardId: "card-editor", giftId: "gift-editor", token: "secret-editor" },
      },
    };
    const client = {
      getCard: jest.fn(async (cardId: string) => ({ card: { id: cardId, state: "active", giftStatus: "bound" } })),
      getOwnedGift: jest.fn(async (giftId: string) => ({ album: { version: giftId === "gift-editor" ? 2 : 1 }, members: [] })),
      listInvited: jest.fn(async (accessToken: string) => accessToken === "viewer-session" ? [{ giftId: "gift-viewer" }] : []),
    };
    const result = await cli.inspectScenarioMatrix({ client, manifest, viewerAccessToken: "viewer-session", editorAccessToken: "editor-session" });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("gift-viewer");
    expect(serialized).toContain('"activated":true');
    expect(serialized).toContain('"activated":false');
    expect(serialized).not.toContain("secret-viewer");
    expect(serialized).not.toContain("secret-editor");
  });

  it("purges only records whose card and gift ids exactly match the active batch manifest", async () => {
    const cli = loadCli()!;
    const queries: { text: string; values?: unknown[] }[] = [];
    const client = {
      query: jest.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (/select gc\.id/iu.test(text)) return { rows: [
          { card_id: "card-owner", gift_id: "gift-owner", note: "NFC-LAB:batch:owner", status: "disabled" },
          { card_id: "card-unclaimed", gift_id: "gift-unclaimed", note: "NFC-LAB:batch:unclaimed", status: "disabled" },
        ] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn(async () => client), end: jest.fn(async () => undefined) };
    const manifest = { batchId: "batch", scenarios: {
      owner: { cardId: "card-owner", giftId: "gift-owner", state: "revoked" },
      unclaimed: { cardId: "card-unclaimed", giftId: "gift-unclaimed", state: "revoked" },
    } };

    await cli.purgeBatchRecords({ manifest, databaseUrl: "postgresql://staging", createPool: () => pool });

    expect(queries[0].text).toMatch(/NFC-LAB/iu);
    expect(queries.some((query) => /delete from gift_cards/iu.test(query.text))).toBe(true);
    expect(queries.some((query) => /delete from gifts/iu.test(query.text))).toBe(true);
    expect(queries.flatMap((query) => query.values ?? [])).toEqual(expect.arrayContaining(["batch", ["card-owner", "card-unclaimed"], ["gift-owner", "gift-unclaimed"]]));
    expect(client.release).toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalled();
  });

  it("rejects database cleanup when the exact batch inventory differs", async () => {
    const cli = loadCli()!;
    const client = {
      query: jest.fn(async (text: string) => /select gc\.id/iu.test(text)
        ? { rows: [{ card_id: "unexpected-card", gift_id: "gift-owner", note: "NFC-LAB:batch:owner", status: "disabled" }] }
        : { rows: [] }),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn(async () => client), end: jest.fn(async () => undefined) };
    const manifest = { batchId: "batch", scenarios: { owner: { cardId: "card-owner", giftId: "gift-owner", state: "revoked" } } };

    await expect(cli.purgeBatchRecords({ manifest, databaseUrl: "postgresql://staging", createPool: () => pool })).rejects.toThrow(/exact batch inventory/iu);
    expect(client.query.mock.calls.some(([text]) => /delete from/iu.test(text))).toBe(false);
  });

  it("registers commands and precisely ignores the generated route", () => {
    const packageJson = require("../package.json") as { scripts: Record<string, string> };
    expect(packageJson.scripts["nfc:test:seed"]).toContain("seed");
    expect(packageJson.scripts["nfc:test:inspect"]).toContain("inspect");
    expect(packageJson.scripts["nfc:test:prepare-pr"]).toContain("prepare-pr");
    expect(packageJson.scripts["nfc:test:guard"]).toContain("guard");
    const runner = require("node:fs").readFileSync(cliPath, "utf8");
    expect(runner).not.toContain("verifyAllowlistRollback");
    expect(runner).not.toContain("Remove the three +nfc aliases");
    const ignore = require("node:fs").readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(ignore).toContain("/src/app/nfc-lab-local.tsx");
    expect(ignore).toContain("/.data/nfc-staging/active.json");
  });

  it("documents the staging account flow, cleanup gate, and remaining physical NFC checks", () => {
    const runbook = require("node:fs").readFileSync(join(process.cwd(), "docs", "operations", "NFC-STAGING-LAB.md"), "utf8");
    const status = require("node:fs").readFileSync(join(process.cwd(), "docs", "operations", "NFC-STATUS-2026-08-21.md"), "utf8");
    for (const command of ["nfc:test:seed", "nfc:test:inspect", "nfc:test:prepare-pr", "nfc:test:guard"]) {
      expect(runbook).toContain(command);
    }
    expect(runbook).toContain("对所有格式有效邮箱开放验证码登录");
    expect(runbook).toContain("无需追加或移除 `ALPHA_ALLOWED_EMAILS`");
    expect(runbook).not.toContain("必须都返回 `403 beta_invite_required`");
    expect(runbook).toContain("管理员与 owner 的验证码登录仍是执行停用与清理的授权前提");
    expect(runbook).toContain("清理不得为了白名单回滚再向三个 `+nfc-*` 派生邮箱额外请求验证码");
    expect(runbook).toContain("NDEF");
    for (const boundary of ["自动测试", "staging 模拟", "实体卡", "锁屏唤起"]) {
      expect(status).toContain(boundary);
    }
  });
});
