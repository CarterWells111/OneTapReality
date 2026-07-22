import type { ItineraryNode } from "../src/features/itinerary/itinerary";
import {
  addItineraryNode,
  buildTimeline,
  moveItineraryNode,
  removeItineraryNode,
  updateItineraryNode,
  validateItineraryInput,
} from "../src/features/itinerary/itinerary";

function node(
  id: string,
  position: number,
  place: string,
  date: string
): ItineraryNode {
  return { id, position, place, date };
}

describe("validateItineraryInput", () => {
  it("requires a hand-typed place", () => {
    expect(validateItineraryInput({ place: "   ", date: "2026-07-23" })).toBe(
      "地点不能为空"
    );
  });

  it("requires YYYY-MM-DD dates", () => {
    expect(validateItineraryInput({ place: "西湖", date: "07/23/2026" })).toBe(
      "日期格式必须是 YYYY-MM-DD"
    );
  });

  it("accepts valid input", () => {
    expect(validateItineraryInput({ place: "西湖", date: "2026-07-23" })).toBeNull();
  });
});

describe("add / update / remove / move", () => {
  it("adds a node at the end and trims the place", () => {
    const result = addItineraryNode([], "n1", { place: " 西湖 ", date: "2026-07-23" });

    expect(result).toEqual([node("n1", 0, "西湖", "2026-07-23")]);
  });

  it("ignores invalid input and duplicate ids", () => {
    const base = [node("n1", 0, "西湖", "2026-07-23")];

    expect(addItineraryNode(base, "n2", { place: "", date: "2026-07-23" })).toEqual(base);
    expect(addItineraryNode(base, "n1", { place: "灵隐寺", date: "2026-07-23" })).toEqual(base);
  });

  it("updates place, date, and note of an existing node", () => {
    const base = [node("n1", 0, "西湖", "2026-07-23")];
    const result = updateItineraryNode(base, "n1", {
      place: "灵隐寺",
      date: "2026-07-24",
      note: "上午出发",
    });

    expect(result).toEqual([
      { id: "n1", position: 0, place: "灵隐寺", date: "2026-07-24", note: "上午出发" },
    ]);
  });

  it("removes a node and renumbers positions", () => {
    const base = [
      node("n1", 0, "西湖", "2026-07-23"),
      node("n2", 1, "外滩", "2026-07-24"),
      node("n3", 2, "深圳湾", "2026-07-25"),
    ];

    const result = removeItineraryNode(base, "n2");
    expect(result.map((item) => item.id)).toEqual(["n1", "n3"]);
    expect(result.map((item) => item.position)).toEqual([0, 1]);
  });

  it("moves a node and keeps order at the boundaries", () => {
    const base = [
      node("n1", 0, "西湖", "2026-07-23"),
      node("n2", 1, "外滩", "2026-07-24"),
    ];

    expect(moveItineraryNode(base, "n2", -1).map((item) => item.id)).toEqual(["n2", "n1"]);
    expect(moveItineraryNode(base, "n1", -1).map((item) => item.id)).toEqual(["n1", "n2"]);
    expect(moveItineraryNode(base, "n2", 1).map((item) => item.id)).toEqual(["n1", "n2"]);
  });
});

describe("buildTimeline", () => {
  const base = [
    node("late", 0, "深圳湾", "2026-07-25"),
    node("early", 1, "西湖", "2026-07-23"),
    node("same-day-b", 2, "湖滨银泰", "2026-07-23"),
  ];

  it("sorts by date and keeps manual order within the same day", () => {
    const timeline = buildTimeline(base);

    expect(timeline.map((item) => item.id)).toEqual(["early", "same-day-b", "late"]);
    expect(timeline.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("is stable: the same input always yields the same output", () => {
    expect(buildTimeline(base)).toEqual(buildTimeline(base));
  });

  it("does not mutate the source nodes", () => {
    buildTimeline(base);

    expect(base.map((item) => item.id)).toEqual(["late", "early", "same-day-b"]);
  });
});
