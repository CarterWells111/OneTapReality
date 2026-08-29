import {
  MIN_TRAVEL_DATE,
  parseIsoTravelDate,
  toIsoTravelDate,
} from "../src/features/memories/travel-date";

describe("travel date conversion", () => {
  it("parses an ISO travel date at local midnight", () => {
    expect(parseIsoTravelDate("2026-07-20")).toEqual(new Date(2026, 6, 20));
  });

  it("formats the local calendar date", () => {
    expect(toIsoTravelDate(new Date(2026, 7, 21, 23, 30))).toBe("2026-08-21");
  });

  it("exposes the minimum supported travel date", () => {
    expect(MIN_TRAVEL_DATE).toEqual(new Date(2000, 0, 1));
  });

  it("falls back to the current time for invalid dates", () => {
    const before = Date.now();
    const invalidFormat = parseIsoTravelDate("2026/07/20");
    const invalidTime = parseIsoTravelDate("2026-02-30");
    const after = Date.now();

    expect(invalidFormat.getTime()).toBeGreaterThanOrEqual(before);
    expect(invalidFormat.getTime()).toBeLessThanOrEqual(after);
    expect(invalidTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(invalidTime.getTime()).toBeLessThanOrEqual(after);
  });
});
