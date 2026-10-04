export type DraftCreationStage = "photo-import" | "layout" | "photo-reference" | "storage";

type DraftCreationReason =
  | "title-required"
  | "city-invalid"
  | "photos-required"
  | "library-preparing"
  | "library-switched"
  | "library-migrating"
  | "library-safety-operation"
  | "storage-full"
  | "permission-denied"
  | "photo-missing"
  | "photo-verification"
  | "photo-unavailable"
  | "database-busy"
  | "database-corrupt"
  | "database-schema"
  | "database-readonly"
  | "unknown";

const knownLocalMessages: ReadonlyMap<string, DraftCreationReason> = new Map([
  ["请输入纪念册标题", "title-required"],
  ["请选择支持的城市", "city-invalid"],
  ["请至少选择一张照片", "photos-required"],
  ["本机旅行册仍在准备中", "library-preparing"],
  ["本机旅行册已经切换，请重新操作", "library-switched"],
  ["本机旅行册正在迁移，请稍后再试", "library-migrating"],
  ["本机旅行册正在进行安全操作，请稍后再试", "library-safety-operation"],
]);

const reasonMessages: Partial<Record<DraftCreationReason, string>> = {
  "title-required": "请输入纪念册标题。",
  "city-invalid": "请选择支持的城市。",
  "photos-required": "请至少选择一张照片。",
  "library-preparing": "本机旅行册仍在准备中，请稍后再试。",
  "library-switched": "本机旅行册已经切换，请重新打开创建页面后重试。",
  "library-migrating": "本机旅行册正在迁移，请稍后再试。",
  "library-safety-operation": "本机旅行册正在进行安全操作，请稍后再试。",
  "database-busy": "本机旅行册正在被占用，请稍后重试。",
  "database-corrupt": "本机旅行册数据暂时无法读取。请重启应用；若仍失败，请联系支持，不要卸载应用。",
  "database-schema": "本机旅行册数据结构尚未准备完成。请重启应用并确认已更新到最新版本；若仍失败，请联系支持。",
  "database-readonly": "本机旅行册当前无法写入。请重启应用后重试；若仍失败，请联系支持。",
};

function readErrorField(error: unknown, field: "code" | "message"): string {
  if (typeof error === "string") return field === "message" ? error : "";
  if (!error || (typeof error !== "object" && typeof error !== "function")) return "";
  try {
    const value = (error as Record<string, unknown>)[field];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

/** Classify native failures locally; never retain the native message or details. */
function classifyError(error: unknown): DraftCreationReason {
  if (error instanceof DraftCreationError) return error.reason;
  const message = readErrorField(error, "message");
  const knownReason = knownLocalMessages.get(message);
  if (knownReason) return knownReason;
  const details = `${readErrorField(error, "code")} ${message}`;
  if (/\b(?:ENOSPC|SQLITE_FULL)\b|disk (?:is )?full|no space left|out of (?:disk )?space|not enough (?:free )?space/i.test(details)) {
    return "storage-full";
  }
  if (/\b(?:EACCES|EPERM)\b|permission denied|operation not permitted/i.test(details)) {
    return "permission-denied";
  }
  if (/\bSQLITE_(?:BUSY|LOCKED)(?:_\w+)?\b|database (?:is )?(?:busy|locked)|database table is locked/i.test(details)) {
    return "database-busy";
  }
  if (/\bSQLITE_(?:CORRUPT|NOTADB)(?:_\w+)?\b|database.*malformed|file is not a database/i.test(details)) {
    return "database-corrupt";
  }
  if (/no such (?:table|column)|has no column named|database schema.*(?:changed|invalid)/i.test(details)) {
    return "database-schema";
  }
  if (/\bSQLITE_READONLY(?:_\w+)?\b|read[ -]?only database/i.test(details)) {
    return "database-readonly";
  }
  if (/\bENOENT\b|no such file|(?:photo|file|asset).*(?:missing|does not exist|not found)/i.test(details)) {
    return "photo-missing";
  }
  if (/photo.*verification.*fail/i.test(details)) return "photo-verification";
  if (/(?:photo|asset).*(?:unavailable|not available|cannot be read|could not be read)/i.test(details)) {
    return "photo-unavailable";
  }
  return "unknown";
}

function messageFor(error: Pick<DraftCreationError, "stage" | "reason" | "photoNumber" | "isCover">): string {
  const knownMessage = reasonMessages[error.reason];
  if (knownMessage) return knownMessage;
  const isPhotoStage = error.stage === "photo-import" || error.stage === "photo-reference";
  const photo = error.isCover
    ? "封面照片"
    : error.photoNumber !== undefined ? `第 ${error.photoNumber} 张照片` : "所选照片";
  if (error.reason === "storage-full") {
    return isPhotoStage
      ? `设备存储空间不足，无法导入${photo}。请释放空间后重试。`
      : "设备存储空间不足，无法保存旅行册。请释放空间后重试。";
  }
  if (error.reason === "permission-denied") {
    return isPhotoStage
      ? `无法读取或保存${photo}。请检查照片访问权限，重启应用后重试。`
      : "应用暂时无法写入本机旅行册。请重启应用后重试；若仍失败，请联系支持。";
  }
  if (error.reason === "photo-missing") {
    return isPhotoStage
      ? `${photo}已不可用。请在系统相册中确认照片已下载到本机，再重新选择。`
      : "本机旅行册所需文件暂时无法访问。请重启应用后重试；若仍失败，请联系支持。";
  }
  if (isPhotoStage && error.reason === "photo-verification") {
    return `${photo}未能成功保存。请重新选择该照片后重试。`;
  }
  if (isPhotoStage && error.reason === "photo-unavailable") {
    return `${photo}暂时无法读取。请在系统相册中打开并下载该照片，再重新选择。`;
  }
  if (error.stage === "photo-import") {
    const action = error.isCover || error.photoNumber !== undefined ? "该照片" : "照片";
    return `导入${photo}时失败。请重新选择${action}后重试；若仍失败，请联系支持。`;
  }
  if (error.stage === "layout") {
    return "生成旅行册页面时失败。请调整页面布局后重试；若仍失败，请联系支持。";
  }
  if (error.stage === "photo-reference") {
    const target = error.isCover || error.photoNumber !== undefined ? photo : "旅行册照片";
    return `准备${target}时失败。请重新选择照片后重试；若仍失败，请联系支持。`;
  }
  return "保存旅行册草稿时失败。请稍后重试；若仍失败，请联系支持。";
}

/** A safe boundary error: raw file paths, account identifiers and native errors stay out of UI and logs. */
export class DraftCreationError extends Error {
  readonly stage: DraftCreationStage;
  readonly reason: DraftCreationReason;
  readonly photoNumber: number | undefined;
  readonly isCover: boolean;

  constructor(stage: DraftCreationStage, cause: unknown, context?: { photoNumber?: number; isCover?: boolean }) {
    const reason = classifyError(cause);
    const photoNumber = context?.photoNumber !== undefined
      && Number.isSafeInteger(context.photoNumber) && context.photoNumber > 0
      ? context.photoNumber
      : undefined;
    const isCover = context?.isCover === true;
    super(messageFor({ stage, reason, photoNumber, isCover }));
    this.name = "DraftCreationError";
    this.stage = stage;
    this.reason = reason;
    this.photoNumber = photoNumber;
    this.isCover = isCover;
  }
}

export function getDraftCreationErrorMessage(error: unknown): string {
  if (error instanceof DraftCreationError) return error.message;
  const reason = classifyError(error);
  if (reason === "unknown") {
    return "无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。";
  }
  return messageFor({ stage: "storage", reason, photoNumber: undefined, isCover: false });
}
