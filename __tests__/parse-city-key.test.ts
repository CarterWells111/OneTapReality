import {
  buildCityKeyPayload,
  computeDemoSignature,
  parseCityKey,
} from "../src/services/city-key/parse-city-key";
import { cities } from "../src/types/memory";

const now = new Date("2026-07-23T12:00:00.000Z");
const future = "2027-07-01";

describe("parseCityKey · 合法载荷", () => {
  it.each(cities)("parses the app-scheme payload for %s", (city) => {
    const result = parseCityKey(buildCityKeyPayload(city, future), now);

    expect(result).toEqual({
      ok: true,
      key: { version: 1, city, expiresAt: future },
    });
  });

  it("parses the future https form with the same payload format", () => {
    const result = parseCityKey(
      buildCityKeyPayload("shanghai", future, "https"),
      now
    );

    expect(result).toEqual({
      ok: true,
      key: { version: 1, city: "shanghai", expiresAt: future },
    });
  });

  it("accepts a key that expires today (boundary)", () => {
    const result = parseCityKey(buildCityKeyPayload("hangzhou", "2026-07-23"), now);

    expect(result.ok).toBe(true);
  });
});

describe("parseCityKey · 安全错误", () => {
  it("rejects garbage input without throwing", () => {
    expect(parseCityKey("", now)).toEqual({ ok: false, reason: "invalid" });
    expect(parseCityKey("not-a-payload", now)).toEqual({ ok: false, reason: "invalid" });
    expect(parseCityKey("https://evil.example/city-key/v1?city=hangzhou", now)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects unsupported versions", () => {
    const sig = computeDemoSignature("v2|hangzhou|2027-07-01");
    const payload = `tralbum://city-key/v2?city=hangzhou&exp=2027-07-01&sig=${sig}`;

    expect(parseCityKey(payload, now)).toEqual({
      ok: false,
      reason: "unsupported-version",
    });
  });

  it("rejects unknown cities", () => {
    const payload = "tralbum://city-key/v1?city=hong-kong&exp=2027-07-01&sig=0000";

    expect(parseCityKey(payload, now)).toEqual({ ok: false, reason: "unknown-city" });
  });

  it("rejects expired keys", () => {
    const result = parseCityKey(buildCityKeyPayload("hangzhou", "2026-07-22"), now);

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects tampered payloads where the city was swapped", () => {
    const genuine = buildCityKeyPayload("hangzhou", future);
    const tampered = genuine.replace("city=hangzhou", "city=shanghai");

    expect(parseCityKey(tampered, now)).toEqual({ ok: false, reason: "tampered" });
  });

  it("rejects tampered payloads where the expiry was extended", () => {
    const genuine = buildCityKeyPayload("hangzhou", "2026-07-22");
    const tampered = genuine.replace("exp=2026-07-22", "exp=2099-01-01");

    expect(parseCityKey(tampered, now)).toEqual({ ok: false, reason: "tampered" });
  });

  it("rejects payloads with missing fields or malformed dates", () => {
    expect(parseCityKey("tralbum://city-key/v1?city=hangzhou&sig=0000", now)).toEqual({
      ok: false,
      reason: "invalid",
    });

    const sig = computeDemoSignature("v1|hangzhou|07/01/2027");
    expect(
      parseCityKey(
        `tralbum://city-key/v1?city=hangzhou&exp=${encodeURIComponent("07/01/2027")}&sig=${sig}`,
        now
      )
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects malformed percent-encoding safely", () => {
    expect(
      parseCityKey("tralbum://city-key/v1?city=%E4%ZZ&exp=2027-07-01&sig=0000", now)
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("computeDemoSignature", () => {
  it("is deterministic and produces 4 hex chars", () => {
    const a = computeDemoSignature("v1|hangzhou|2027-07-01");
    const b = computeDemoSignature("v1|hangzhou|2027-07-01");

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{4}$/);
  });

  it("changes when any field changes", () => {
    const base = computeDemoSignature("v1|hangzhou|2027-07-01");

    expect(computeDemoSignature("v1|shanghai|2027-07-01")).not.toBe(base);
    expect(computeDemoSignature("v1|hangzhou|2027-07-02")).not.toBe(base);
  });
});
