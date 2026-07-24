type SendGiftVerificationEmailInput = {
  apiKey: string;
  from: string;
  email: string;
  code: string;
  request?: typeof fetch;
};

export async function sendGiftVerificationEmail({ apiKey, from, email, code, request = fetch }: SendGiftVerificationEmailInput): Promise<void> {
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `一触如初验证码：${code}`,
      text: `你的验证码是 ${code}。验证码 5 分钟内有效，请勿转发给他人。`,
    }),
  });
  if (!response.ok) throw new Error("Unable to send verification email");
}
