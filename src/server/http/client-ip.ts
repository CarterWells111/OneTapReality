const UNKNOWN_CLIENT_IP = "unknown";

function normalizeIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets.join(".");
}

function normalizeIpv6(value: string): string | null {
  let candidate = value;
  if (candidate.includes(".")) {
    const lastColon = candidate.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = normalizeIpv4(candidate.slice(lastColon + 1));
    if (!ipv4) return null;
    const octets = ipv4.split(".").map(Number);
    candidate = `${candidate.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const compressionIndex = candidate.indexOf("::");
  if (compressionIndex !== candidate.lastIndexOf("::")) return null;

  let groups: string[];
  if (compressionIndex >= 0) {
    const left = candidate.slice(0, compressionIndex);
    const right = candidate.slice(compressionIndex + 2);
    const leftGroups = left ? left.split(":") : [];
    const rightGroups = right ? right.split(":") : [];
    const zeroCount = 8 - leftGroups.length - rightGroups.length;
    if (zeroCount < 1) return null;
    groups = [...leftGroups, ...Array<string>(zeroCount).fill("0"), ...rightGroups];
  } else {
    groups = candidate.split(":");
    if (groups.length !== 8) return null;
  }

  if (groups.some((group) => !/^[0-9a-f]{1,4}$/iu.test(group))) return null;
  const normalizedGroups = groups.map((group) => Number.parseInt(group, 16).toString(16));

  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < normalizedGroups.length;) {
    if (normalizedGroups[index] !== "0") {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < normalizedGroups.length && normalizedGroups[end] === "0") end += 1;
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }

  if (bestLength < 2) return normalizedGroups.join(":");
  return `${normalizedGroups.slice(0, bestStart).join(":")}::${normalizedGroups.slice(bestStart + bestLength).join(":")}`;
}

export function getTrustedClientIp(headers: Headers): string {
  const value = headers.get("x-real-ip")?.trim();
  if (!value) return UNKNOWN_CLIENT_IP;
  return normalizeIpv4(value) ?? normalizeIpv6(value) ?? UNKNOWN_CLIENT_IP;
}
