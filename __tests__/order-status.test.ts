import {
  countSouvenirItems,
  defaultLeadTimeDays,
  getOrderStage,
  getOrderTimeline,
  orderStageLabels,
} from "../src/features/commerce/shop/order-status";

const createdAt = "2026-07-01T10:00:00.000Z";

function daysAfter(days: number): Date {
  return new Date(new Date(createdAt).getTime() + days * 24 * 60 * 60 * 1000);
}

describe("getOrderStage", () => {
  it("starts as confirmed on the day the intent is submitted", () => {
    expect(getOrderStage(createdAt, 14, daysAfter(0))).toBe("confirmed");
  });

  it("moves to making after one day", () => {
    expect(getOrderStage(createdAt, 14, daysAfter(1))).toBe("making");
    expect(getOrderStage(createdAt, 14, daysAfter(13))).toBe("making");
  });

  it("ships once the lead time has passed", () => {
    expect(getOrderStage(createdAt, 14, daysAfter(14))).toBe("shipped");
    expect(getOrderStage(createdAt, 14, daysAfter(16))).toBe("shipped");
  });

  it("is delivered three days after shipping", () => {
    expect(getOrderStage(createdAt, 14, daysAfter(17))).toBe("delivered");
  });

  it("never ships before day two even for very short lead times", () => {
    expect(getOrderStage(createdAt, 1, daysAfter(1))).toBe("making");
    expect(getOrderStage(createdAt, 1, daysAfter(2))).toBe("shipped");
    expect(getOrderStage(createdAt, 1, daysAfter(5))).toBe("delivered");
  });

  it("falls back to confirmed for an unparsable timestamp", () => {
    expect(getOrderStage("not-a-date", 14, daysAfter(30))).toBe("confirmed");
  });
});

describe("getOrderTimeline", () => {
  it("returns all four stages in order with reachability and expected dates", () => {
    const timeline = getOrderTimeline(createdAt, 14, daysAfter(14));

    expect(timeline.map((entry) => entry.stage)).toEqual([
      "confirmed",
      "making",
      "shipped",
      "delivered",
    ]);
    expect(timeline.map((entry) => entry.reached)).toEqual([true, true, true, false]);
    expect(timeline[0].expectedDate).toBe("2026-07-01");
    expect(timeline[2].expectedDate).toBe("2026-07-15");
    expect(timeline[3].expectedDate).toBe("2026-07-18");
    expect(timeline[1].label).toBe(orderStageLabels.making);
  });
});

describe("countSouvenirItems", () => {
  it("sums quantities across intents", () => {
    expect(
      countSouvenirItems([{ quantity: 2 }, { quantity: 1 }, { quantity: 3 }])
    ).toBe(6);
  });

  it("returns zero for an empty list", () => {
    expect(countSouvenirItems([])).toBe(0);
  });

  it("ignores invalid quantities", () => {
    expect(countSouvenirItems([{ quantity: Number.NaN }, { quantity: 2 }])).toBe(2);
  });
});

describe("defaultLeadTimeDays", () => {
  it("is a sensible fallback for legacy records", () => {
    expect(defaultLeadTimeDays).toBeGreaterThan(0);
  });
});
