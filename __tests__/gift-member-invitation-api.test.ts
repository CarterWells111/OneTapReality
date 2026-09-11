const mockAddGiftMember = jest.fn(async (..._args: [unknown, string, string, string, "viewer" | "editor"]) => true);
const mockRollbackGiftMemberInvitation = jest.fn(async (..._args: [unknown, string, string]) => true);
const mockSendGiftInvitationEmail = jest.fn(async (..._args: [unknown]) => undefined);

jest.mock("../src/server/gifts/owner-access", () => ({
  requireOwnedGift: jest.fn(async () => ({ db: {}, email: "owner@example.com", gift: { id: "gift-1", status: "bound" } })),
}));
jest.mock("../src/server/gifts/repository", () => ({
  addGiftMember: (db: unknown, giftId: string, email: string, createdAt: string, role: "viewer" | "editor") => mockAddGiftMember(db, giftId, email, createdAt, role),
  listGiftMembers: jest.fn(async () => [
    { email: "owner@example.com", role: "owner", createdAt: "2026-09-11T00:00:00.000Z" },
    { email: "viewer@example.com", role: "viewer", createdAt: "2026-09-11T00:01:00.000Z" },
  ]),
  removeGiftMember: jest.fn(),
  rollbackGiftMemberInvitation: (db: unknown, giftId: string, email: string) => mockRollbackGiftMemberInvitation(db, giftId, email),
  updateGiftMemberRole: jest.fn(),
}));
jest.mock("../src/server/gifts/resend-email-sender", () => ({
  sendGiftInvitationEmail: (input: unknown) => mockSendGiftInvitationEmail(input),
}));
jest.mock("../src/server/maintenance/opportunistic-gift-maintenance", () => ({ scheduleOpportunisticGiftMaintenance: jest.fn() }));

import { POST } from "../src/app/api/my-gifts/[id]/members+api";

function request(email = " Viewer@Example.com ") {
  return new Request("http://localhost/api/my-gifts/gift-1/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, role: "viewer" }),
  });
}

describe("gift member email invitations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "resend-key";
    process.env.GIFT_EMAIL_FROM = "support@onetapreality.com";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.GIFT_EMAIL_FROM;
    delete process.env.ALPHA_ALLOWED_EMAILS;
  });

  it("adds the normalized member and sends an invitation email", async () => {
    const response = await POST(request(), { id: "gift-1" });

    expect(response.status).toBe(201);
    expect(mockAddGiftMember).toHaveBeenCalledWith(expect.anything(), "gift-1", "viewer@example.com", expect.any(String), "viewer");
    expect(mockSendGiftInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "resend-key", from: "support@onetapreality.com", email: "viewer@example.com", role: "viewer" }));
  });

  it("rolls back only the unnotified invitation when delivery fails", async () => {
    mockSendGiftInvitationEmail.mockRejectedValueOnce(new Error("delivery failed"));

    const response = await POST(request(), { id: "gift-1" });

    expect(response.status).toBe(500);
    expect(mockRollbackGiftMemberInvitation).toHaveBeenCalledWith(expect.anything(), "gift-1", "viewer@example.com");
  });

  it("rejects an invite outside a configured staging allowlist", async () => {
    process.env.ALPHA_ALLOWED_EMAILS = "allowed@example.com";
    const response = await POST(request(), { id: "gift-1" });
    expect(response.status).toBe(403);
    expect(mockAddGiftMember).not.toHaveBeenCalled();
    expect(mockSendGiftInvitationEmail).not.toHaveBeenCalled();
  });
});
