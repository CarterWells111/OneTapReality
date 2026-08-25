const mockRequireAuthenticatedAccount = jest.fn(async () => ({ id: "viewer-user", email: "viewer@example.com" }));
type MockReportResult = {
  status: string;
  report?: { id: string; giftId: string; reason: string; snapshotVersion: number; supportNotifiedAt: string | null; createdAt: string };
};
type MockBlockResult = { status: string; block?: { id: string; createdAt: string } };
const mockReportGiftContent = jest.fn(async (..._args: unknown[]): Promise<MockReportResult> => ({
  status: "created",
  report: {
    id: "report-1",
    giftId: "gift-1",
    reason: "other",
    snapshotVersion: 4,
    supportNotifiedAt: null,
    createdAt: "2026-08-24T12:00:00.000Z",
  },
}));
const mockMarkNotified = jest.fn(async (..._args: unknown[]) => undefined);
const mockSendSupportNotice = jest.fn(async (..._args: unknown[]) => undefined);
const mockScheduleMaintenance = jest.fn();
const mockBlockGiftUser = jest.fn(async (..._args: unknown[]): Promise<MockBlockResult> => ({
  status: "created",
  block: { id: "block-1", createdAt: "2026-08-24T12:00:00.000Z" },
}));
const mockLeaveGiftMembership = jest.fn(async (..._args: unknown[]) => ({ status: "left" }));

jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({ database: true })) }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccount: () => mockRequireAuthenticatedAccount() }));
jest.mock("../src/server/gifts/alpha-safety", () => ({
  requireGiftSharingEnabled: jest.fn(),
  requireAlphaEmailAllowed: jest.fn(),
}));
jest.mock("../src/server/gifts/content-safety", () => ({
  GIFT_CONTENT_REPORT_REASONS: ["sexual", "harassment", "hate", "violence", "spam", "other"],
  reportGiftContent: (...args: unknown[]) => mockReportGiftContent(...args),
  markGiftContentReportSupportNotified: (...args: unknown[]) => mockMarkNotified(...args),
  blockGiftUser: (...args: unknown[]) => mockBlockGiftUser(...args),
  leaveGiftMembership: (...args: unknown[]) => mockLeaveGiftMembership(...args),
}));
jest.mock("../src/server/gifts/resend-email-sender", () => ({
  sendGiftContentReportSupportEmailFromEnvironment: (...args: unknown[]) => mockSendSupportNotice(...args),
}));
jest.mock("../src/server/maintenance/opportunistic-gift-maintenance", () => ({
  scheduleOpportunisticGiftMaintenance: () => mockScheduleMaintenance(),
}));

import { POST as reportGift } from "../src/app/api/gifts/[token]/reports+api";
import { POST as blockGiftUser } from "../src/app/api/gifts/[token]/blocks+api";
import { DELETE as leaveGift } from "../src/app/api/gifts/[token]/membership+api";

describe("gift content safety APIs", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it.each(["sexual", "harassment", "hate", "violence", "spam", "other"])(
    "accepts the documented %s report reason and sends a sanitized support notice",
    async (reason) => {
      mockReportGiftContent.mockResolvedValueOnce({
        status: "created",
        report: {
          id: `report-${reason}`,
          giftId: "gift-1",
          reason,
          snapshotVersion: 4,
          supportNotifiedAt: null,
          createdAt: "2026-08-24T12:00:00.000Z",
        },
      });
      const response = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
        method: "POST",
        body: JSON.stringify({ reason, details: "sensitive reporter text" }),
      }), { token: "gift-1" });

      expect(response.status).toBe(201);
      expect(mockReportGiftContent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        giftId: "gift-1",
        reporterUserId: "viewer-user",
        reporterEmail: "viewer@example.com",
        reason,
        details: "sensitive reporter text",
      }));
      expect(mockSendSupportNotice).toHaveBeenCalledWith({
        reportId: `report-${reason}`,
        giftId: "gift-1",
        snapshotVersion: 4,
        reason,
      });
      expect(JSON.stringify(mockSendSupportNotice.mock.calls)).not.toContain("sensitive reporter text");
      expect(JSON.stringify(mockSendSupportNotice.mock.calls)).not.toContain("viewer@example.com");
      expect(mockMarkNotified).toHaveBeenCalledWith(expect.anything(), `report-${reason}`, expect.any(String));
    },
  );

  it("rejects an unknown reason and oversized details before persistence", async () => {
    const invalidReason = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST",
      body: JSON.stringify({ reason: "database_error" }),
    }), { token: "gift-1" });
    const oversized = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST",
      body: JSON.stringify({ reason: "other", details: "x".repeat(501) }),
    }), { token: "gift-1" });

    expect(invalidReason.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mockReportGiftContent).not.toHaveBeenCalled();
  });

  it("rejects null report and block JSON as validation errors", async () => {
    const report = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST", body: "null",
    }), { token: "gift-1" });
    const block = await blockGiftUser(new Request("http://localhost/api/gifts/gift-1/blocks", {
      method: "POST", body: "null",
    }), { token: "gift-1" });

    expect(report.status).toBe(400);
    expect(block.status).toBe(400);
    await expect(report.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "validation_failed" }) }));
    await expect(block.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "validation_failed" }) }));
  });

  it("returns an existing report idempotently without resending an already delivered notice", async () => {
    mockReportGiftContent.mockResolvedValueOnce({
      status: "existing",
      report: {
        id: "report-existing",
        giftId: "gift-1",
        reason: "spam",
        snapshotVersion: 4,
        supportNotifiedAt: "2026-08-24T12:01:00.000Z",
        createdAt: "2026-08-24T12:00:00.000Z",
      },
    });
    const response = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST",
      body: JSON.stringify({ reason: "spam" }),
    }), { token: "gift-1" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "existing",
      report: { id: "report-existing", snapshotVersion: 4 },
    });
    expect(mockSendSupportNotice).not.toHaveBeenCalled();
  });

  it("accepts and hides a persisted report when support delivery fails, then schedules durable retry", async () => {
    mockSendSupportNotice.mockRejectedValueOnce(new Error("provider failure with viewer@example.com"));
    const response = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST",
      body: JSON.stringify({ reason: "other", details: "private report body" }),
    }), { token: "gift-1" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      status: "created",
      report: { id: "report-1", snapshotVersion: 4 },
    });
    expect(mockMarkNotified).not.toHaveBeenCalled();
    expect(mockScheduleMaintenance).toHaveBeenCalledTimes(1);
  });

  it("maps missing report relationships without exposing repository details", async () => {
    mockReportGiftContent.mockResolvedValueOnce({ status: "forbidden" });
    const response = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST",
      body: JSON.stringify({ reason: "other" }),
    }), { token: "gift-1" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_report_forbidden" }) }));
  });

  it("returns a stable error when an owner attempts to report their own gift", async () => {
    mockReportGiftContent.mockResolvedValueOnce({ status: "owner_forbidden" });
    const response = await reportGift(new Request("http://localhost/api/gifts/gift-1/reports", {
      method: "POST", body: JSON.stringify({ reason: "other" }),
    }), { token: "gift-1" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "gift_owner_cannot_report" }),
    }));
  });

  it("blocks the gift owner by default and keeps the response free of target identity", async () => {
    const response = await blockGiftUser(new Request("http://localhost/api/gifts/gift-1/blocks", {
      method: "POST",
      body: JSON.stringify({}),
    }), { token: "gift-1" });

    expect(response.status).toBe(201);
    expect(mockBlockGiftUser).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      giftId: "gift-1",
      actorUserId: "viewer-user",
      actorEmail: "viewer@example.com",
      targetUserId: undefined,
      targetEmail: undefined,
    }));
    expect(await response.json()).toEqual({ status: "created", block: { id: "block-1" } });
  });

  it("maps invalid block relationships to a stable client error", async () => {
    mockBlockGiftUser.mockResolvedValueOnce({ status: "invalid_target" });
    const response = await blockGiftUser(new Request("http://localhost/api/gifts/gift-1/blocks", {
      method: "POST",
      body: JSON.stringify({ targetEmail: "stranger@example.com" }),
    }), { token: "gift-1" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_block_invalid_target" }) }));
  });

  it("lets invited members leave and rejects owner departure explicitly", async () => {
    const left = await leaveGift(new Request("http://localhost/api/gifts/gift-1/membership", { method: "DELETE" }), { token: "gift-1" });
    expect(left.status).toBe(204);

    mockLeaveGiftMembership.mockResolvedValueOnce({ status: "owner_forbidden" });
    const owner = await leaveGift(new Request("http://localhost/api/gifts/gift-1/membership", { method: "DELETE" }), { token: "gift-1" });
    expect(owner.status).toBe(409);
    expect(await owner.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_owner_cannot_leave" }) }));
  });
});
