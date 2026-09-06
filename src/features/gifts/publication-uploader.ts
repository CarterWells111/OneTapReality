import * as FileSystem from "expo-file-system/legacy";

import type { RefreshedPublicationUploads } from "../../services/backend/api-client";

export type PublicationUploadFile = {
  kind: "media" | "cover";
  position?: number;
  uri: string;
  contentType: string;
  uploadUrl: string;
};

type RefreshSelection = { publicationId: string; positions: number[]; cover: boolean };

const retryDelays = [300, 900] as const;

function uploadLabel(file: PublicationUploadFile) {
  return file.kind === "cover" ? "封面" : `第 ${(file.position ?? 0) + 1} 张照片`;
}

function uploadError(file: PublicationUploadFile) {
  return new Error(`${uploadLabel(file)}上传失败，请检查网络后重试。`);
}

function isTransientStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function defaultDelay(milliseconds: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function uploadPublicationFile(file: PublicationUploadFile): Promise<{ status: number }> {
  const result = await FileSystem.uploadAsync(file.uploadUrl, file.uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": file.contentType },
  });
  return { status: result.status };
}

export async function uploadPublicationFiles(input: {
  publicationId: string;
  files: PublicationUploadFile[];
  uploadFile: (file: PublicationUploadFile) => Promise<{ status: number }>;
  refreshUploads: (selection: RefreshSelection) => Promise<RefreshedPublicationUploads>;
  delay?: (milliseconds: number) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
  const wait = input.delay ?? defaultDelay;
  let nextIndex = 0;
  let completed = 0;
  let uploadFailed = false;
  input.onProgress?.(0, input.files.length);

  const uploadOne = async (initialFile: PublicationUploadFile) => {
    let file = initialFile;
    let transientRetries = 0;
    let refreshed = false;
    while (true) {
      let status: number;
      try {
        status = (await input.uploadFile(file)).status;
      } catch {
        if (transientRetries >= retryDelays.length) throw uploadError(file);
        await wait(retryDelays[transientRetries]);
        transientRetries += 1;
        continue;
      }
      if (status >= 200 && status < 300) return;
      if ((status === 401 || status === 403) && !refreshed) {
        const selection: RefreshSelection = {
          publicationId: input.publicationId,
          positions: file.kind === "media" && typeof file.position === "number" ? [file.position] : [],
          cover: file.kind === "cover",
        };
        const fresh = await input.refreshUploads(selection);
        const uploadUrl = file.kind === "cover"
          ? fresh.coverUpload?.uploadUrl
          : fresh.uploads.find((item) => item.position === file.position)?.uploadUrl;
        if (!uploadUrl) throw uploadError(file);
        file = { ...file, uploadUrl };
        refreshed = true;
        continue;
      }
      if (isTransientStatus(status) && transientRetries < retryDelays.length) {
        await wait(retryDelays[transientRetries]);
        transientRetries += 1;
        continue;
      }
      throw uploadError(file);
    }
  };

  const worker = async () => {
    while (true) {
      if (uploadFailed) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= input.files.length) return;
      try {
        await uploadOne(input.files[index]);
      } catch (error) {
        uploadFailed = true;
        throw error;
      }
      completed += 1;
      input.onProgress?.(completed, input.files.length);
    }
  };

  const results = await Promise.allSettled(
    Array.from({ length: Math.min(2, input.files.length) }, () => worker()),
  );
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}
