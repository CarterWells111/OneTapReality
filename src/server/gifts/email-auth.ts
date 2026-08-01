import { hashAccessToken } from "../auth/device-auth";

const codeLifetimeMs = 5 * 60 * 1000;

function createCryptographicCode(): number {
  const values = new Uint32Array(1);
  const unbiasedLimit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= unbiasedLimit);
  return values[0] % 1_000_000;
}

export function normalizeGiftEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) throw new Error("Invalid email");
  return normalized;
}

export async function createGiftEmailCode(
  email: string,
  pepper: string,
  random: () => number = createCryptographicCode,
  now = new Date().toISOString(),
) {
  const code = String(random()).padStart(6, "0").slice(-6);
  return {
    email: normalizeGiftEmail(email),
    code,
    codeHash: await hashAccessToken(code, pepper),
    expiresAt: new Date(new Date(now).getTime() + codeLifetimeMs).toISOString(),
  };
}

export async function isGiftEmailCodeValid(
  storedHash: string,
  code: string,
  pepper: string,
  now: string,
  expiresAt: string,
) {
  return new Date(now).getTime() < new Date(expiresAt).getTime()
    && storedHash === await hashAccessToken(code, pepper);
}
