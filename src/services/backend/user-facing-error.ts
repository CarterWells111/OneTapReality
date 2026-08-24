const backendErrorMessages: Readonly<Record<string, string>> = {
  beta_invite_required: "此邮箱暂未加入测试，请确认邀请邮箱后重试。",
  email_code_rate_limited: "请求过于频繁，请稍后再试。",
  gift_access_denied: "你目前无权访问此礼品，请联系赠送者确认邀请。",
  gift_activation_denied: "无法激活此礼品，请确认登录邮箱与邀请邮箱一致。",
  gift_activation_required: "请先使用礼品链接完成激活。",
  gift_album_not_found: "礼品拥有者尚未发布共享相册。",
  gift_album_version_conflict: "共享相册已有新版本，请重新打开后再编辑。",
  gift_management_request_pending: "已有相同申请等待处理，请勿重复提交。",
  gift_member_exists: "该邮箱已经可以访问此礼品。",
  gift_member_limit: "此礼品的受邀成员已达上限。",
  gift_member_limit_or_duplicate: "该邮箱已受邀，或受邀成员已达上限。",
  gift_member_not_found: "未找到该成员，请刷新后重试。",
  gift_media_unavailable: "照片服务暂时不可用，请稍后重试。",
  gift_publication_unavailable: "暂时无法发布共享相册，请稍后重试。",
  gift_service_unavailable: "礼品服务暂时不可用，请稍后重试。",
  gift_sharing_paused: "礼品服务暂时停用，请稍后再试。",
  gift_upload_incomplete: "部分照片未完成上传，请重新发布。",
  invalid_code: "验证码无效或已过期，请重新获取。",
  network_unavailable: "网络连接不可用，请检查网络后重试。",
  unauthorized: "登录状态已失效，请重新登录。",
  validation_failed: "填写内容有误，请检查后重试。",
  verification_rate_limited: "验证码尝试过于频繁，请稍后再试。",
};

export class UserActionRequiredError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "UserActionRequiredError";
  }
}

export function toUserFacingBackendError(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return fallback;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? backendErrorMessages[code] ?? fallback : fallback;
}

export function toUserFacingOperationError(error: unknown, fallback: string): string {
  return error instanceof UserActionRequiredError
    ? error.userMessage
    : toUserFacingBackendError(error, fallback);
}
