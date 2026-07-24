import { hashAccessToken } from "../auth/device-auth";

const codeLifetimeMs = 5 * 60 * 1000;

export function normalizeGiftEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) throw new Error("Invalid email");
  return normalized;
}

export async function createGiftEmailCode(
  email: string,
  pepper: string,
  random: () => number = () => Math.floor(Math.random() * 1_000_000),
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
