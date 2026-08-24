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

export async function sendAccountDeletionVerificationEmail({ apiKey, from, email, code, request = fetch }: SendGiftVerificationEmailInput): Promise<void> {
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "确认永久删除账号",
      text: `你正在申请永久删除 OneTapReality 账号及云端数据。验证码是 ${code}，5 分钟内有效，请不要转发。如果不是你本人操作，请忽略此邮件，你的账号不会被删除。`,
    }),
  });
  if (!response.ok) throw new Error("Unable to send account deletion verification email");
}

type SendAccountDeletionFailureEmailInput = {
  apiKey: string;
  from: string;
  to: string;
  receiptId: string;
  errorCode: string;
  attempt: number;
  request?: typeof fetch;
};

/** Sends only an opaque receipt and stable diagnostics; account email and object keys are intentionally absent. */
export async function sendAccountDeletionFailureEmail({
  apiKey,
  from,
  to,
  receiptId,
  errorCode,
  attempt,
  request = fetch,
}: SendAccountDeletionFailureEmailInput): Promise<void> {
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "OneTapReality 账号删除任务需要处理",
      text: `删除回执 ${receiptId} 清理失败。错误码：${errorCode}；尝试次数：${attempt}。账号访问已保持撤销，请检查后台维护任务。`,
    }),
  });
  if (!response.ok) throw new Error("Unable to send account deletion support notice");
}

export async function sendAccountDeletionFailureEmailFromEnvironment(input: {
  receiptId: string;
  errorCode: string;
  attempt: number;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.GIFT_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Account deletion support email is not configured");
  await sendAccountDeletionFailureEmail({
    ...input,
    apiKey,
    from,
    to: process.env.ACCOUNT_DELETION_SUPPORT_EMAIL ?? "support@onetapreality.com",
  });
}
