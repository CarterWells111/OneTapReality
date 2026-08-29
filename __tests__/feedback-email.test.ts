import {
  buildFeedbackMailtoUrl,
  openFeedbackEmail,
} from "../src/features/feedback/feedback-email";

describe("external Beta feedback email", () => {
  const context = {
    appVersion: "1.1.2",
    deviceName: "iPhone",
    system: "ios 18.6",
  };

  it("addresses support with non-sensitive version and device context", () => {
    const url = buildFeedbackMailtoUrl(context);

    expect(url.startsWith("mailto:support@onetapreality.com?")).toBe(true);
    expect(decodeURIComponent(url)).toContain("OneTapReality Beta 反馈（1.1.2）");
    expect(decodeURIComponent(url)).toContain("设备：iPhone");
    expect(decodeURIComponent(url)).toContain("系统：ios 18.6");
    expect(decodeURIComponent(url)).not.toMatch(/token|owner@example|照片内容/iu);
  });

  it("reports only whether the mail app accepted the URL", async () => {
    const openUrl = jest.fn().mockResolvedValue(undefined);

    await expect(openFeedbackEmail(context, openUrl)).resolves.toBe(true);
    expect(openUrl).toHaveBeenCalledWith(buildFeedbackMailtoUrl(context));
  });

  it("maps mail-app failures without exposing the raw exception", async () => {
    const openUrl = jest.fn().mockRejectedValue(new Error("LSApplicationWorkspace raw failure"));

    await expect(openFeedbackEmail(context, openUrl)).resolves.toBe(false);
  });
});
