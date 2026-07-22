/**
 * 未来服务端 AI 的接口契约（仅类型与纯函数）。
 * 本文件禁止出现 fetch、密钥、环境变量或任何后端实现；
 * 请求体在类型层面就排除照片二进制、URI、精确位置和生物特征。
 */

import type { City, MemoryDraftInput, StoryPage } from "../../types/memory";
import type { DraftGenerator } from "./demo-draft-generator";

export const remoteContractVersion = 1;

export type ConsentState = "unset" | "granted" | "denied";

export type RemoteDraftConsent = {
  state: ConsentState;
  /** 用户同意的隐私政策版本。 */
  policyVersion: string;
  /** granted 时的同意时间（ISO 字符串）。 */
  acceptedAt?: string;
};

/**
 * 发往服务端的请求：只允许用户手填的标题、城市、日期与照片数量。
 * 不含照片二进制、本地 URI、精确位置或生物特征。
 */
export type RemoteDraftRequest = {
  contractVersion: typeof remoteContractVersion;
  title: string;
  city: City;
  travelDate: string;
  photoCount: number;
  consent: RemoteDraftConsent;
};

export type RemoteDraftPage = {
  id: string;
  kind: StoryPage["kind"];
  headline: string;
  body: string;
  /** 引用本地照片顺序的下标；服务端永远看不到照片本体。 */
  photoSlot?: number;
};

export type RemoteDraftResponse = {
  contractVersion: typeof remoteContractVersion;
  pages: RemoteDraftPage[];
};

/** 客户端可处理的错误类型，全部可安全展示与恢复。 */
export type RemoteDraftError =
  | { type: "consent-required"; retryable: false }
  | { type: "network-unavailable"; retryable: true }
  | { type: "rate-limited"; retryable: true; retryAfterSeconds?: number }
  | { type: "server-error"; retryable: boolean; message: string }
  | { type: "invalid-response"; retryable: false };

export type BuildRequestResult =
  | { ok: true; request: RemoteDraftRequest }
  | { ok: false; error: RemoteDraftError };

/**
 * 纯函数：把本地草稿输入映射为隐私安全的请求。
 * photoUris 只折叠成数量；未授予同意时返回 consent-required 错误。
 */
export function buildRemoteDraftRequest(
  input: MemoryDraftInput,
  consent: RemoteDraftConsent
): BuildRequestResult {
  if (consent.state !== "granted") {
    return { ok: false, error: { type: "consent-required", retryable: false } };
  }
  return {
    ok: true,
    request: {
      contractVersion: remoteContractVersion,
      title: input.title,
      city: input.city,
      travelDate: input.travelDate,
      photoCount: input.photoUris.length,
      consent,
    },
  };
}

const forbiddenPatterns: { label: string; pattern: RegExp }[] = [
  { label: "本地照片 URI", pattern: /\b(file|content|ph|assets-library):\/\//i },
  { label: "远程 URL", pattern: /\bhttps?:\/\//i },
  { label: "内联图片数据", pattern: /\bdata:image\//i },
  { label: "疑似经纬度", pattern: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/ },
];

/**
 * 纯函数：扫描请求中的字符串字段，返回隐私违规说明列表（空数组代表安全）。
 * 作为测试与未来发送前的最后防线。
 */
export function findPrivacyViolations(request: RemoteDraftRequest): string[] {
  const texts = [request.title, request.travelDate, String(request.city)];
  const violations: string[] = [];
  for (const text of texts) {
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(text)) {
        violations.push(`${label}: ${text}`);
      }
    }
  }
  return violations;
}

/**
 * 纯函数：把服务端响应还原为 StoryPage[]，photoSlot 映射回本地照片。
 * 照片始终留在设备上，服务端只处理文字。
 */
export function toStoryPages(
  response: RemoteDraftResponse,
  localPhotoUris: readonly string[]
): StoryPage[] {
  return response.pages.map((page, index) => {
    const story: StoryPage = {
      id: page.id,
      position: index,
      kind: page.kind,
      headline: page.headline,
      body: page.body,
    };
    if (
      page.photoSlot !== undefined &&
      page.photoSlot >= 0 &&
      page.photoSlot < localPhotoUris.length
    ) {
      story.photoUri = localPhotoUris[page.photoSlot];
    }
    return story;
  });
}

/** 抽象传输层：由未来的实现注入，本文件不提供任何网络代码。 */
export type RemoteDraftTransport = (
  request: RemoteDraftRequest
) => Promise<RemoteDraftResponse>;

/** 把可处理错误包装成 Error 实例，保留全部结构化字段。 */
export function toRemoteDraftFailure(error: RemoteDraftError): Error & RemoteDraftError {
  return Object.assign(new Error(error.type), error);
}

/**
 * 组合出一个与现有 DraftGenerator 兼容的生成器。
 * 传输层完全由调用方注入；缺少同意时抛出携带结构化字段的可处理错误。
 */
export function createRemoteDraftGenerator(
  transport: RemoteDraftTransport,
  consent: RemoteDraftConsent
): DraftGenerator {
  return {
    async generate(input: MemoryDraftInput): Promise<StoryPage[]> {
      const built = buildRemoteDraftRequest(input, consent);
      if (!built.ok) {
        throw toRemoteDraftFailure(built.error);
      }
      const response = await transport(built.request);
      if (response.contractVersion !== remoteContractVersion) {
        throw toRemoteDraftFailure({ type: "invalid-response", retryable: false });
      }
      return toStoryPages(response, input.photoUris);
    },
  };
}
