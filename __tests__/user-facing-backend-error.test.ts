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
    ["gift_publication_retryable", "照片已上传，正在重试完成发布。"],
    ["gift_relationship_blocked", "你与该成员之间已停止共享，无法再次邀请或激活。"],
    ["gift_report_forbidden", "你目前无法举报此礼品，请刷新列表后重试。"],
    ["gift_report_no_snapshot", "此礼品尚无可举报的已发布内容。"],
    ["gift_block_invalid_target", "请选择当前共享关系中的其他成员。"],
    ["gift_leave_forbidden", "你目前无法退出此礼品，请刷新列表后重试。"],
    ["gift_owner_cannot_leave", "礼品拥有者不能直接退出；如需停止共享，请永久停用礼品。"],
    ["gift_owner_cannot_report", "礼品拥有者不能举报自己发布的内容；如需停止共享，请永久停用礼品。"],
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
