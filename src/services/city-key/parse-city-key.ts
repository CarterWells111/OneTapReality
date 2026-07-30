/**
 * 城市纪念品 QR/URL 载荷解析器（安全兜底）。
 * 支持 app scheme 与未来 HTTPS URL 两种前缀，载荷带版本号：
 *   onetapreality://city-key/v1?city=hangzhou&exp=2027-07-01&sig=abcd
 *   https://onetapreality.com/city-key/v1?city=hangzhou&exp=2027-07-01&sig=abcd
 * 校验为演示级 checksum，仅拦截误扫与明显篡改；
 * 正式版必须由服务端做加密验签。本文件不接原生 NFC，也不改路由。
 */

import { cities, type City } from "../../types/memory";

export type CityKey = {
  version: 1;
  city: City;
  /** 过期日（YYYY-MM-DD，UTC 当天 23:59:59 前有效）。 */
  expiresAt: string;
};

export type CityKeyErrorReason =
  | "invalid"
  | "unsupported-version"
  | "unknown-city"
  | "expired"
  | "tampered";

export type CityKeyResult =
  | { ok: true; key: CityKey }
  | { ok: false; reason: CityKeyErrorReason };

const payloadPattern =
  /^(?:onetapreality:\/\/|https:\/\/onetapreality\.com\/)city-key\/(v\d+)\?(.*)$/;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** 演示级 checksum：确定性、无密钥、不声称加密强度。 */
export function computeDemoSignature(payload: string): string {
  let hash = 7;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) % 0xfff1;
  }
  return hash.toString(16).padStart(4, "0");
}

function parseQuery(query: string): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const pair of query.split("&")) {
    if (!pair) {
      continue;
    }
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      return null;
    }
    try {
      const key = decodeURIComponent(pair.slice(0, separator));
      const value = decodeURIComponent(pair.slice(separator + 1));
      params[key] = value;
    } catch {
      return null;
    }
  }
  return params;
}

/** 生成合法载荷（供演示 QR 与测试使用）。 */
export function buildCityKeyPayload(
  city: City,
  expiresAt: string,
  base: "app-scheme" | "https" = "app-scheme"
): string {
  const prefix =
    base === "https" ? "https://onetapreality.com/" : "onetapreality://";
  const sig = computeDemoSignature(`v1|${city}|${expiresAt}`);
  return `${prefix}city-key/v1?city=${city}&exp=${expiresAt}&sig=${sig}`;
}

/**
 * 纯函数：解析并校验城市钥匙载荷。
 * 任何异常输入都返回安全错误，绝不抛出。
 */
export function parseCityKey(raw: string, now: Date): CityKeyResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const match = payloadPattern.exec(raw.trim());
  if (!match) {
    return { ok: false, reason: "invalid" };
  }

  const [, version, query] = match;
  if (version !== "v1") {
    return { ok: false, reason: "unsupported-version" };
  }

  const params = parseQuery(query);
  if (!params || !params.city || !params.exp || !params.sig) {
    return { ok: false, reason: "invalid" };
  }

  if (!(cities as readonly string[]).includes(params.city)) {
    return { ok: false, reason: "unknown-city" };
  }
  const city = params.city as City;

  if (!datePattern.test(params.exp)) {
    return { ok: false, reason: "invalid" };
  }

  const expectedSig = computeDemoSignature(`v1|${city}|${params.exp}`);
  if (params.sig !== expectedSig) {
    return { ok: false, reason: "tampered" };
  }

  const expiryInstant = Date.parse(`${params.exp}T23:59:59.999Z`);
  if (Number.isNaN(expiryInstant)) {
    return { ok: false, reason: "invalid" };
  }
  if (now.getTime() > expiryInstant) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, key: { version: 1, city, expiresAt: params.exp } };
}
