import { createBookLayoutDraft, applyBookLayoutDraft } from "../src/features/canvas/book-layout-draft";
import type { StoryPage } from "../src/types/memory";

const pages: StoryPage[] = [
  { id: "cover", position: 0, kind: "cover", headline: "封面", body: "", coverImage: "cover.jpg" },
  { id: "a", position: 1, kind: "photo", headline: "文字", body: "正文", layout: { aspectRatio: 0.75, backgroundId: "paper", elements: [
    { id: "one", type: "image", uri: "same.jpg", crop: { focusX: 0.2, focusY: 0.3, zoom: 2 }, x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 0.2, zIndex: 1 },
    { id: "two", type: "image", uri: "same.jpg", x: 0.5, y: 0.6, width: 0.2, height: 0.3, rotation: 0, zIndex: 2 },
    { id: "sticker", type: "sticker", stickerId: "star", x: 0.2, y: 0.2, width: 0.1, height: 0.1, rotation: 0, zIndex: 3 },
  ] } },
  { id: "empty", position: 2, kind: "photo", headline: "空页", body: "保留", layout: { aspectRatio: 0.75, elements: [] } },
];

it("keeps untouched pages and their geometry exactly", () => {
  const draft = createBookLayoutDraft(pages);
  expect(applyBookLayoutDraft(pages, draft, draft.plans)).toBe(pages);
});
it("reorders duplicate URI photos by identity and retains crop, decoration and covers", () => {
  const draft = createBookLayoutDraft(pages);
  const plans = draft.plans.map((plan, i) => i === 1 ? { ...plan, photoUris: [...plan.photoUris].reverse(), photoTemplateId: "classic-2" as const } : plan);
  const result = applyBookLayoutDraft(pages, draft, plans);
  expect(result[0]).toBe(pages[0]);
  expect(result[2]).toBe(pages[2]);
  expect(result[1].layout?.elements.map(e => e.id)).toEqual(["two", "one", "sticker"]);
  expect(result[1].layout?.elements[1]).toMatchObject({ crop: { focusX: 0.2, focusY: 0.3, zoom: 2 } });
  expect(result[1].layout?.elements[2]).toBe(pages[1].layout?.elements[2]);
  expect(result[1]).toMatchObject({ id: "a", headline: "文字", body: "正文", layout: { backgroundId: "paper" } });
});
it("rejects stale snapshots and malformed allocations rather than dropping content", () => {
  const draft = createBookLayoutDraft(pages);
  expect(() => applyBookLayoutDraft([...pages], draft, draft.plans)).toThrow();
  expect(() => applyBookLayoutDraft(pages, draft, draft.plans.slice(1))).toThrow();
  const plans = draft.plans.map((p, i) => i === 1 ? { ...p, photoUris: [p.photoUris[0], p.photoUris[0]] } : p);
  expect(() => applyBookLayoutDraft(pages, draft, plans)).toThrow();
});
it("keeps freeform slot geometry while moving photo identity and crop", () => {
  const draft = createBookLayoutDraft(pages);
  const plans = draft.plans.map((plan, i) => i === 1 ? { ...plan, photoUris: [...plan.photoUris].reverse() } : plan);
  const result = applyBookLayoutDraft(pages, draft, plans);
  expect(result[1].layout!.elements[0]).toMatchObject({ id: "two", x: 0.1, y: 0.2, rotation: 0.2, width: 0.3, height: 0.4 });
  expect(result[1].layout!.elements[1]).toMatchObject({ id: "one", x: 0.5, y: 0.6, crop: { focusX: 0.2, focusY: 0.3, zoom: 2 } });
});
it("rejects invalid template counts and adding photos beyond the existing page", () => {
  const draft = createBookLayoutDraft(pages);
  const plans = draft.plans.map((plan, i) => i === 1 ? { ...plan, photoTemplateId: "classic-3" as const } : plan);
  expect(() => applyBookLayoutDraft(pages, draft, plans)).toThrow();
  expect(() => applyBookLayoutDraft(pages, draft, draft.plans.map((p, i) => i === 1 ? { ...p, photoUris: Array(10).fill(p.photoUris[0]) } : p))).toThrow();
});
it("updates the legacy first-photo reference when slot order changes", () => {
  const original: StoryPage[] = [{ ...pages[1], photoUri: "first.jpg", layout: { ...pages[1].layout!, elements: pages[1].layout!.elements.map(e => e.type === "image" ? { ...e, uri: e.id === "one" ? "first.jpg" : "second.jpg" } : e) } }];
  const draft = createBookLayoutDraft(original);
  const result = applyBookLayoutDraft(original, draft, [{ ...draft.plans[0], photoUris: [...draft.plans[0].photoUris].reverse() }]);
  expect(result[0].photoUri).toBe("second.jpg");
});
