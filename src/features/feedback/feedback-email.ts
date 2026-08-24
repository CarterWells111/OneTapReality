export type FeedbackEmailContext = {
  readonly appVersion: string;
  readonly deviceName: string;
  readonly system: string;
};

export type OpenFeedbackUrl = (url: string) => Promise<unknown>;

const feedbackAddress = "support@onetapreality.com";

export function buildFeedbackMailtoUrl(context: FeedbackEmailContext): string {
  const subject = `OneTapReality Beta 反馈（${context.appVersion}）`;
  const body = [
    "请在这里描述你遇到的问题或建议：",
    "",
    "—— 应用环境（请保留）——",
    `版本：${context.appVersion}`,
    `设备：${context.deviceName}`,
    `系统：${context.system}`,
  ].join("\n");

  return `mailto:${feedbackAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function openFeedbackEmail(
  context: FeedbackEmailContext,
  openUrl: OpenFeedbackUrl,
): Promise<boolean> {
  try {
    await openUrl(buildFeedbackMailtoUrl(context));
    return true;
  } catch {
    return false;
  }
}
