import { sendAccountDeletionFailureEmail, sendGiftVerificationEmail } from "../src/server/gifts/resend-email-sender";

describe("Resend gift email sender", () => {
  it("sends the six digit code from the verified support address", async () => {
    const request = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));

    await sendGiftVerificationEmail({
      apiKey: "resend-key",
      from: "support@onetapreality.com",
      email: "owner@example.com",
      code: "123456",
      request,
    });

    expect(request).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer resend-key" }),
    }));
    expect(JSON.parse((request.mock.calls[0][1] as RequestInit).body as string)).toEqual(expect.objectContaining({
      from: "support@onetapreality.com",
      to: ["owner@example.com"],
      subject: "一触如初验证码：123456",
    }));
  });

  it("sends a sanitized deletion failure notice without account or object identifiers", async () => {
    const request = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));

    await sendAccountDeletionFailureEmail({
      apiKey: "resend-key",
      from: "support@onetapreality.com",
      to: "support@onetapreality.com",
      receiptId: "receipt-1",
      errorCode: "account_media_delete_failed",
      attempt: 2,
      request,
    });

    const body = JSON.parse((request.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({ to: ["support@onetapreality.com"], text: expect.stringContaining("receipt-1") }));
    expect(JSON.stringify(body)).not.toMatch(/owner@example\.com|private\/photo/u);
  });
});
