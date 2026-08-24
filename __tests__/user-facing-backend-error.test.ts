import {
  toUserFacingBackendError,
  toUserFacingOperationError,
  UserActionRequiredError,
} from "../src/services/backend/user-facing-error";

describe("user-facing backend errors", () => {
  it.each([
    ["network_unavailable", "网络连接不可用，请检查网络后重试。"],
    ["beta_invite_required", "此邮箱暂未加入测试，请确认邀请邮箱后重试。"],
    ["invalid_code", "验证码无效或已过期，请重新获取。"],
    ["email_code_rate_limited", "请求过于频繁，请稍后再试。"],
    ["gift_album_version_conflict", "共享相册已有新版本，请重新打开后再编辑。"],
  ])("maps %s to stable Chinese copy", (code, expected) => {
    expect(toUserFacingBackendError({ code, message: "raw internal failure" }, "操作失败，请重试。")).toBe(expected);
  });

  it("uses the supplied action-specific fallback without returning raw messages", () => {
    expect(toUserFacingBackendError(new Error("SQLite raw failure"), "暂时无法保存，请重试。")).toBe("暂时无法保存，请重试。");
  });

  it("allows only explicitly marked local action guidance through", () => {
    expect(toUserFacingOperationError(new UserActionRequiredError("请重新选择照片。"), "操作失败。")).toBe("请重新选择照片。");
    expect(toUserFacingOperationError(new Error("raw failure"), "操作失败。")).toBe("操作失败。");
  });
});
