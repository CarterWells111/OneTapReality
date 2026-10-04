import {
  DraftCreationError,
  getDraftCreationErrorMessage,
  type DraftCreationStage,
} from "../src/features/memories/draft-creation-error";

describe("draft creation error messages", () => {
  it.each([
    ["请输入纪念册标题", "请输入纪念册标题。"],
    ["请选择支持的城市", "请选择支持的城市。"],
    ["请至少选择一张照片", "请至少选择一张照片。"],
    ["本机旅行册仍在准备中", "本机旅行册仍在准备中，请稍后再试。"],
    ["本机旅行册已经切换，请重新操作", "本机旅行册已经切换，请重新打开创建页面后重试。"],
    ["本机旅行册正在迁移，请稍后再试", "本机旅行册正在迁移，请稍后再试。"],
    ["本机旅行册正在进行安全操作，请稍后再试", "本机旅行册正在进行安全操作，请稍后再试。"],
  ])("maps the known local message %s", (message, expected) => {
    expect(getDraftCreationErrorMessage(new Error(message))).toBe(expected);
    expect(getDraftCreationErrorMessage(new DraftCreationError("storage", { message }))).toBe(expected);
  });

  it.each(["ENOSPC", "SQLITE_FULL", "disk full", "No space left on device"])(
    "explains storage exhaustion from %s without blaming photos",
    (message) => {
      const error = new DraftCreationError("storage", new Error(`${message}: file:///private/library.db`));
      expect(error.reason).toBe("storage-full");
      expect(getDraftCreationErrorMessage(error)).toBe("设备存储空间不足，无法保存旅行册。请释放空间后重试。");
    },
  );

  it.each(["EACCES", "EPERM", "Permission denied"])(
    "explains storage permission failure from %s without requesting photo authorization",
    (message) => {
      const error = new DraftCreationError("storage", { code: message, message: "private details" });
      expect(error.reason).toBe("permission-denied");
      expect(error.message).toBe("应用暂时无法写入本机旅行册。请重启应用后重试；若仍失败，请联系支持。");
      expect(error.message).not.toContain("照片");
    },
  );

  it.each([
    { message: "Media Library permission is required to do this operation" },
    { code: "ERR_FILE_NOT_READABLE", message: "native operation failed" },
    { code: "ERR_FILE_NOT_WRITABLE", message: "native operation failed" },
    { message: "File 'file:///private/photo.jpg' is not readable" },
    { message: "File 'file:///private/photo.jpg' is not writable" },
  ])("recognizes the installed iOS permission exception %j", (cause) => {
    const error = new DraftCreationError("photo-import", cause, { photoNumber: 2 });
    expect(error.reason).toBe("permission-denied");
    expect(error.message).toBe("无法读取或保存第 2 张照片。请检查照片访问权限，重启应用后重试。");
    expect(error.message).not.toContain("file://");
  });

  it.each([
    ["SQLITE_BUSY", "database-busy", "本机旅行册正在被占用，请稍后重试。"],
    ["SQLITE_LOCKED", "database-busy", "本机旅行册正在被占用，请稍后重试。"],
    ["database is locked", "database-busy", "本机旅行册正在被占用，请稍后重试。"],
    ["SQLITE_CORRUPT", "database-corrupt", "本机旅行册数据暂时无法读取。请重启应用；若仍失败，请联系支持，不要卸载应用。"],
    ["SQLITE_NOTADB", "database-corrupt", "本机旅行册数据暂时无法读取。请重启应用；若仍失败，请联系支持，不要卸载应用。"],
    ["database disk image is malformed", "database-corrupt", "本机旅行册数据暂时无法读取。请重启应用；若仍失败，请联系支持，不要卸载应用。"],
    ["no such table: private_table", "database-schema", "本机旅行册数据结构尚未准备完成。请重启应用并确认已更新到最新版本；若仍失败，请联系支持。"],
    ["no such column: private_column", "database-schema", "本机旅行册数据结构尚未准备完成。请重启应用并确认已更新到最新版本；若仍失败，请联系支持。"],
    ["SQLITE_READONLY", "database-readonly", "本机旅行册当前无法写入。请重启应用后重试；若仍失败，请联系支持。"],
    ["attempt to write a readonly database", "database-readonly", "本机旅行册当前无法写入。请重启应用后重试；若仍失败，请联系支持。"],
  ])("maps %s to its database guidance", (message, reason, expected) => {
    const error = new DraftCreationError("storage", new Error(message));
    expect(error.reason).toBe(reason);
    expect(getDraftCreationErrorMessage(error)).toBe(expected);
  });

  it.each([
    ["ENOENT", "photo-missing", "第 3 张照片已不可用。请在系统相册中确认照片已下载到本机，再重新选择。"],
    ["Photo file is missing", "photo-missing", "第 3 张照片已不可用。请在系统相册中确认照片已下载到本机，再重新选择。"],
    ["Photo destination verification failed", "photo-verification", "第 3 张照片未能成功保存。请重新选择该照片后重试。"],
    ["Photo asset unavailable", "photo-unavailable", "第 3 张照片暂时无法读取。请在系统相册中打开并下载该照片，再重新选择。"],
    ["ENOSPC", "storage-full", "设备存储空间不足，无法导入第 3 张照片。请释放空间后重试。"],
    ["EACCES", "permission-denied", "无法读取或保存第 3 张照片。请检查照片访问权限，重启应用后重试。"],
    ["unrecognized exception", "unknown", "导入第 3 张照片时失败。请重新选择该照片后重试；若仍失败，请联系支持。"],
  ])("identifies the photo and gives an action for %s", (message, reason, expected) => {
    const error = new DraftCreationError("photo-import", { message }, { photoNumber: 3 });
    expect(error.reason).toBe(reason);
    expect(error.photoNumber).toBe(3);
    expect(error.message).toBe(expected);
  });

  it("identifies a cover photo even when its URI also occurred in the selected photos", () => {
    const error = new DraftCreationError("photo-import", { code: "ENOENT" }, { photoNumber: 2, isCover: true });
    expect(error.isCover).toBe(true);
    expect(error.message).toBe("封面照片已不可用。请在系统相册中确认照片已下载到本机，再重新选择。");
  });

  it("preserves specific photo-reference guidance", () => {
    expect(new DraftCreationError("photo-reference", new Error("Photo asset unavailable"), { photoNumber: 4 }).message)
      .toBe("第 4 张照片暂时无法读取。请在系统相册中打开并下载该照片，再重新选择。");
  });

  it("uses stage-specific missing-file guidance for storage", () => {
    expect(new DraftCreationError("storage", { code: "ENOENT" }).message)
      .toBe("本机旅行册所需文件暂时无法访问。请重启应用后重试；若仍失败，请联系支持。");
  });

  it.each([
    ["photo-import", "导入所选照片时失败。请重新选择照片后重试；若仍失败，请联系支持。"],
    ["layout", "生成旅行册页面时失败。请调整页面布局后重试；若仍失败，请联系支持。"],
    ["photo-reference", "准备旅行册照片时失败。请重新选择照片后重试；若仍失败，请联系支持。"],
    ["storage", "保存旅行册草稿时失败。请稍后重试；若仍失败，请联系支持。"],
  ] as [DraftCreationStage, string][])("has its own unknown fallback for %s", (stage, expected) => {
    expect(new DraftCreationError(stage, new Error("unknown")).message).toBe(expected);
  });

  it("supports the native Error code even when the message has no known marker", () => {
    const nativeError = Object.assign(new Error("native operation failed"), { code: "SQLITE_BUSY" });
    expect(new DraftCreationError("storage", nativeError).reason).toBe("database-busy");
  });

  it.each([new Error("unknown"), { code: "private-code", message: "private-message" }, "unknown", undefined, null, 1])(
    "has a general fallback for unknown unwrapped errors",
    (error) => {
      expect(getDraftCreationErrorMessage(error)).toBe("无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。");
    },
  );

  it("does not expose or retain raw paths, emails, tokens or identifiers", () => {
    const rawMessage = "EACCES file:///private/account@example.com/memory-secret-id.jpg token=secret-token";
    const cause = Object.assign(new Error(rawMessage), { path: "file:///private/library.db" });
    const error = new DraftCreationError("storage", cause);
    const exposed = `${error.message} ${error.stack ?? ""} ${JSON.stringify(error)}`;
    for (const secret of [rawMessage, "file:///private", "account@example.com", "memory-secret-id", "secret-token"]) {
      expect(exposed).not.toContain(secret);
    }
    expect(error).not.toHaveProperty("cause");
    expect(Object.values(error)).not.toContain(cause);
  });

  it("does not allow a known message with appended private information through the whitelist", () => {
    expect(getDraftCreationErrorMessage(new Error("请输入纪念册标题 account@example.com")))
      .toBe("无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。");
  });

  it.each([0, -1, 1.5, NaN, Infinity])("discards invalid photo number %s", (photoNumber) => {
    const error = new DraftCreationError("photo-import", new Error("unknown"), { photoNumber });
    expect(error.photoNumber).toBeUndefined();
    expect(error.message).toContain("所选照片");
  });

  it("safely handles native error fields whose getters throw", () => {
    const error = {
      get message(): string { throw new Error("private getter failure"); },
      get code(): string { throw new Error("private code failure"); },
    };
    expect(() => new DraftCreationError("storage", error)).not.toThrow();
    expect(getDraftCreationErrorMessage(error)).toBe("无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。");
  });
});
