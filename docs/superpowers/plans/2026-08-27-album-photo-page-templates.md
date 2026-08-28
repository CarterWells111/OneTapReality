# Album Photo Page Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a photo-first draft/page workflow with five template families, fifteen local 1–3 photo layouts, whole-book allocation, per-page refinement, and editable persisted template state.

**Architecture:** Keep template geometry and page allocation as pure local domain modules. Store only an optional template ID in the existing `CanvasLayout` JSON, generate draft pages from optional page plans, and let shared picker components feed the existing canvas transaction/save paths. The page manager requests an add-page workflow while `BookCanvasEditor` continues to own photo picking, strict persistence, and page mutation.

**Tech Stack:** TypeScript 5.9, React 19, React Native 0.81, Expo Router 6, Expo Image Picker, Jest 29 with jest-expo, React Native Testing Library.

---

## File map

- Create `src/features/canvas/photo-templates.ts`: the 15-template registry, lookup functions, and geometry-to-layout conversion.
- Create `src/features/memories/photo-page-planner.ts`: pure whole-book distribution, reassignment, and family-application rules.
- Create `src/features/canvas/photo-template-picker.tsx`: accessible template thumbnails shared by draft creation and editor sheets.
- Create `src/features/memories/draft-photo-allocation.tsx`: controlled “一起配置 / 逐页配置” draft UI.
- Create `src/features/canvas/photo-layout-sheet.tsx`: staged add/replace-photo and template confirmation modal.
- Modify `src/types/memory.ts`: template IDs, page plan type, and optional layout metadata.
- Modify `src/features/canvas/canvas-layout.ts`: preserve valid template IDs during normalization.
- Modify `src/features/canvas/editor-pages.ts`: apply templates, replace photos, and clear stale template state after manual image edits.
- Modify `src/features/canvas/page-manager-sheet.tsx`: request add-page workflow instead of inserting an empty page.
- Modify `src/features/canvas/book-canvas-editor.tsx`: own multi-photo picking/persistence, staged layout sheet, and current-page template editing.
- Modify `src/services/ai/demo-draft-generator.ts`: generate planned multi-photo pages while preserving legacy calls.
- Modify `src/features/memories/memory-factory.ts`: exclude transient page plans from persisted `Memory` fields.
- Modify `src/app/memory/new.tsx`: initialize and submit controlled page plans after photo selection.
- Add focused tests under `__tests__/` for each domain and UI boundary.

### Task 1: Define and validate the 15 local templates

**Files:**
- Create: `src/features/canvas/photo-templates.ts`
- Modify: `src/types/memory.ts`
- Modify: `src/features/canvas/canvas-layout.ts`
- Test: `__tests__/photo-templates.test.ts`
- Test: `__tests__/canvas-layout.test.ts`

- [ ] **Step 1: Write the failing registry and normalization tests**

Create `__tests__/photo-templates.test.ts`:

```ts
import {
  PHOTO_TEMPLATE_FAMILIES,
  PHOTO_TEMPLATES,
  createPhotoTemplateLayout,
  getPhotoTemplatesForCount,
  resolvePhotoTemplate,
} from "../src/features/canvas/photo-templates";

describe("photo templates", () => {
  it("contains five families and exactly five templates for each supported count", () => {
    expect(PHOTO_TEMPLATE_FAMILIES).toHaveLength(5);
    expect(PHOTO_TEMPLATES).toHaveLength(15);
    expect(new Set(PHOTO_TEMPLATES.map((template) => template.id)).size).toBe(15);
    expect(getPhotoTemplatesForCount(1)).toHaveLength(5);
    expect(getPhotoTemplatesForCount(2)).toHaveLength(5);
    expect(getPhotoTemplatesForCount(3)).toHaveLength(5);
    expect(getPhotoTemplatesForCount(4)).toEqual([]);
  });

  it("keeps every slot inside the normalized page", () => {
    for (const template of PHOTO_TEMPLATES) {
      expect(template.slots).toHaveLength(template.photoCount);
      for (const slot of template.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.x + slot.width).toBeLessThanOrEqual(1);
        expect(slot.y + slot.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it("builds image elements from the selected template and rejects mismatched counts", () => {
    const layout = createPhotoTemplateLayout(["file://a.jpg", "file://b.jpg"], "magazine-2");
    expect(layout.photoTemplateId).toBe("magazine-2");
    expect(layout.elements).toHaveLength(2);
    expect(layout.elements[0]).toMatchObject({ type: "image", uri: "file://a.jpg", x: 0.08 });
    expect(createPhotoTemplateLayout(["file://a.jpg"], "magazine-2")).toBeNull();
    expect(resolvePhotoTemplate("missing")).toBeUndefined();
  });
});
```

Append to `__tests__/canvas-layout.test.ts`:

```ts
it("preserves a known photo template id while normalizing layout", () => {
  const layout = normalizeLayout({
    aspectRatio: 0.75,
    photoTemplateId: "classic-1",
    elements: [{ id: "image-1", type: "image", uri: "file://a.jpg", x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zIndex: 1 }],
  });
  expect(layout.photoTemplateId).toBe("classic-1");
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx jest --runInBand __tests__/photo-templates.test.ts __tests__/canvas-layout.test.ts`

Expected: FAIL because `photo-templates.ts` and `photoTemplateId` do not exist.

- [ ] **Step 3: Add the template and plan types**

Add to `src/types/memory.ts`:

```ts
export const photoTemplateFamilyIds = ["classic", "magazine", "story", "collage", "columns"] as const;
export type PhotoTemplateFamilyId = (typeof photoTemplateFamilyIds)[number];
export type PhotoTemplateId = `${PhotoTemplateFamilyId}-${1 | 2 | 3}`;

export type MemoryDraftPagePlan = {
  photoUris: string[];
  photoTemplateId?: PhotoTemplateId;
};
```

Add `pagePlans?: MemoryDraftPagePlan[]` to `MemoryDraftInput`, add `photoTemplateId?: PhotoTemplateId` to `CanvasLayout`, and change `Memory` to exclude transient plans:

```ts
export type Memory = Omit<MemoryDraftInput, "pagePlans"> & {
  id: string;
  status?: MemoryStatus;
  pages: StoryPage[];
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Implement the exact registry and lookup functions**

Create `src/features/canvas/photo-templates.ts` with these 15 definitions:

```ts
import type {
  CanvasImageElement,
  CanvasLayout,
  PhotoTemplateFamilyId,
  PhotoTemplateId,
} from "../../types/memory";

export type PhotoTemplateSlot = {
  x: number; y: number; width: number; height: number; rotation: number;
};

export type PhotoTemplateDefinition = {
  id: PhotoTemplateId;
  familyId: PhotoTemplateFamilyId;
  familyLabel: string;
  photoCount: 1 | 2 | 3;
  slots: PhotoTemplateSlot[];
};

export const PHOTO_TEMPLATE_FAMILIES = [
  { id: "classic", label: "经典留白" },
  { id: "magazine", label: "杂志侧栏" },
  { id: "story", label: "横向叙事" },
  { id: "collage", label: "手账错落" },
  { id: "columns", label: "竖向切片" },
] as const;

const slot = (x: number, y: number, width: number, height: number, rotation = 0): PhotoTemplateSlot =>
  ({ x, y, width, height, rotation });

export const PHOTO_TEMPLATES: PhotoTemplateDefinition[] = [
  { id: "classic-1", familyId: "classic", familyLabel: "经典留白", photoCount: 1, slots: [slot(.10, .10, .80, .80)] },
  { id: "classic-2", familyId: "classic", familyLabel: "经典留白", photoCount: 2, slots: [slot(.09, .09, .82, .37), slot(.09, .54, .82, .37)] },
  { id: "classic-3", familyId: "classic", familyLabel: "经典留白", photoCount: 3, slots: [slot(.09, .09, .82, .43), slot(.09, .63, .38, .28), slot(.53, .63, .38, .28)] },
  { id: "magazine-1", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 1, slots: [slot(.10, .10, .65, .80)] },
  { id: "magazine-2", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 2, slots: [slot(.08, .09, .52, .82), slot(.64, .18, .28, .57)] },
  { id: "magazine-3", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 3, slots: [slot(.08, .09, .51, .82), slot(.63, .09, .29, .34), slot(.63, .57, .29, .34)] },
  { id: "story-1", familyId: "story", familyLabel: "横向叙事", photoCount: 1, slots: [slot(.07, .25, .86, .49)] },
  { id: "story-2", familyId: "story", familyLabel: "横向叙事", photoCount: 2, slots: [slot(.07, .07, .86, .43), slot(.18, .57, .75, .36)] },
  { id: "story-3", familyId: "story", familyLabel: "横向叙事", photoCount: 3, slots: [slot(.07, .07, .86, .25), slot(.14, .375, .79, .25), slot(.07, .68, .79, .25)] },
  { id: "collage-1", familyId: "collage", familyLabel: "手账错落", photoCount: 1, slots: [slot(.14, .09, .72, .82, -2.5)] },
  { id: "collage-2", familyId: "collage", familyLabel: "手账错落", photoCount: 2, slots: [slot(.08, .11, .56, .48, -3), slot(.38, .44, .54, .45, 3)] },
  { id: "collage-3", familyId: "collage", familyLabel: "手账错落", photoCount: 3, slots: [slot(.08, .08, .53, .39, -3), slot(.47, .27, .45, .34, 3), slot(.13, .58, .47, .34, -1.5)] },
  { id: "columns-1", familyId: "columns", familyLabel: "竖向切片", photoCount: 1, slots: [slot(.20, .08, .60, .84)] },
  { id: "columns-2", familyId: "columns", familyLabel: "竖向切片", photoCount: 2, slots: [slot(.08, .08, .39, .84), slot(.53, .08, .39, .84)] },
  { id: "columns-3", familyId: "columns", familyLabel: "竖向切片", photoCount: 3, slots: [slot(.06, .08, .27, .84), slot(.365, .08, .27, .84), slot(.67, .08, .27, .84)] },
];

export function resolvePhotoTemplate(id: string | undefined) {
  return PHOTO_TEMPLATES.find((template) => template.id === id);
}

export function getPhotoTemplatesForCount(count: number) {
  return PHOTO_TEMPLATES.filter((template) => template.photoCount === count);
}

export function resolvePhotoTemplateForFamily(familyId: PhotoTemplateFamilyId, count: number) {
  return PHOTO_TEMPLATES.find((template) => template.familyId === familyId && template.photoCount === count);
}

export function createPhotoTemplateLayout(photoUris: string[], templateId: string): CanvasLayout | null {
  const template = resolvePhotoTemplate(templateId);
  if (!template || template.photoCount !== photoUris.length) return null;
  const elements: CanvasImageElement[] = photoUris.map((uri, index) => ({
    id: `image-${index + 1}`,
    type: "image",
    uri,
    ...template.slots[index],
    zIndex: index + 1,
  }));
  return { aspectRatio: 3 / 4, elements, photoTemplateId: template.id };
}
```

Preserve only known IDs in `normalizeLayout()`:

```ts
const template = resolvePhotoTemplate(layout.photoTemplateId);
return {
  aspectRatio: 3 / 4,
  ...(template ? { photoTemplateId: template.id } : {}),
  // existing background/cover fields and normalized elements
};
```

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npx jest --runInBand __tests__/photo-templates.test.ts __tests__/canvas-layout.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the registry**

```bash
git add src/types/memory.ts src/features/canvas/photo-templates.ts src/features/canvas/canvas-layout.ts __tests__/photo-templates.test.ts __tests__/canvas-layout.test.ts
git commit -m "feat: add local photo template registry"
```

### Task 2: Build the whole-book photo planner

**Files:**
- Create: `src/features/memories/photo-page-planner.ts`
- Test: `__tests__/photo-page-planner.test.ts`

- [ ] **Step 1: Write failing planner tests**

```ts
import {
  applyTemplateFamilyToPlans,
  createBalancedPhotoPagePlans,
  distributePhotoUris,
  movePhotoToPage,
} from "../src/features/memories/photo-page-planner";

const photos = Array.from({ length: 8 }, (_, index) => `file://photo-${index + 1}.jpg`);

describe("photo page planner", () => {
  it("defaults to at most three ordered photos per page", () => {
    const plans = createBalancedPhotoPagePlans(photos);
    expect(plans.map((plan) => plan.photoUris.length)).toEqual([3, 3, 2]);
    expect(plans.flatMap((plan) => plan.photoUris)).toEqual(photos);
    expect(plans.map((plan) => plan.photoTemplateId)).toEqual(["classic-3", "classic-3", "classic-2"]);
  });

  it("supports fewer pages and leaves over-three pages freeform", () => {
    const plans = distributePhotoUris(photos, 2);
    const result = applyTemplateFamilyToPlans(plans, "story");
    expect(plans.map((plan) => plan.photoUris.length)).toEqual([4, 4]);
    expect(result.plans.every((plan) => plan.photoTemplateId === undefined)).toBe(true);
    expect(result.skippedPageNumbers).toEqual([1, 2]);
  });

  it("moves a photo without creating an empty source page", () => {
    const plans = distributePhotoUris(photos.slice(0, 4), 2);
    expect(movePhotoToPage(plans, "file://photo-1.jpg", 1).plans.map((plan) => plan.photoUris.length)).toEqual([1, 3]);
    const blocked = movePhotoToPage([{ photoUris: ["only"] }, { photoUris: ["other"] }], "only", 1);
    expect(blocked.error).toBe("每页至少保留一张照片");
  });

  it("rejects empty photos and invalid page counts", () => {
    expect(() => distributePhotoUris([], 1)).toThrow("请至少选择一张照片");
    expect(() => distributePhotoUris(photos, 0)).toThrow("页数必须在 1 到 8 之间");
    expect(() => distributePhotoUris(photos, 9)).toThrow("页数必须在 1 到 8 之间");
  });
});
```

- [ ] **Step 2: Run the planner test and confirm RED**

Run: `npx jest --runInBand __tests__/photo-page-planner.test.ts`

Expected: FAIL because the planner module does not exist.

- [ ] **Step 3: Implement the planner as pure functions**

```ts
import type { MemoryDraftPagePlan, PhotoTemplateFamilyId } from "../../types/memory";
import { resolvePhotoTemplateForFamily } from "../canvas/photo-templates";

export function distributePhotoUris(photoUris: string[], pageCount: number): MemoryDraftPagePlan[] {
  if (photoUris.length === 0) throw new Error("请至少选择一张照片");
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > photoUris.length) {
    throw new Error(`页数必须在 1 到 ${photoUris.length} 之间`);
  }
  const minimum = Math.floor(photoUris.length / pageCount);
  const remainder = photoUris.length % pageCount;
  let offset = 0;
  return Array.from({ length: pageCount }, (_, index) => {
    const count = minimum + (index < remainder ? 1 : 0);
    const plan = { photoUris: photoUris.slice(offset, offset + count) };
    offset += count;
    return plan;
  });
}

export function applyTemplateFamilyToPlans(plans: MemoryDraftPagePlan[], familyId: PhotoTemplateFamilyId) {
  const skippedPageNumbers: number[] = [];
  const nextPlans = plans.map((plan, index) => {
    const template = resolvePhotoTemplateForFamily(familyId, plan.photoUris.length);
    if (!template) {
      skippedPageNumbers.push(index + 1);
      return { photoUris: [...plan.photoUris] };
    }
    return { photoUris: [...plan.photoUris], photoTemplateId: template.id };
  });
  return { plans: nextPlans, skippedPageNumbers };
}

export function createBalancedPhotoPagePlans(photoUris: string[], familyId: PhotoTemplateFamilyId = "classic") {
  return applyTemplateFamilyToPlans(distributePhotoUris(photoUris, Math.ceil(photoUris.length / 3)), familyId).plans;
}

export function movePhotoToPage(plans: MemoryDraftPagePlan[], uri: string, targetIndex: number) {
  const sourceIndex = plans.findIndex((plan) => plan.photoUris.includes(uri));
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= plans.length || sourceIndex === targetIndex) {
    return { plans, error: undefined };
  }
  if (plans[sourceIndex].photoUris.length === 1) {
    return { plans, error: "每页至少保留一张照片" };
  }
  return {
    error: undefined,
    plans: plans.map((plan, index) => index === sourceIndex
      ? { photoUris: plan.photoUris.filter((candidate) => candidate !== uri) }
      : index === targetIndex
        ? { photoUris: [...plan.photoUris, uri] }
        : { ...plan, photoUris: [...plan.photoUris] }),
  };
}
```

- [ ] **Step 4: Run the planner test and confirm GREEN**

Run: `npx jest --runInBand __tests__/photo-page-planner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the planner**

```bash
git add src/features/memories/photo-page-planner.ts __tests__/photo-page-planner.test.ts
git commit -m "feat: add draft photo page planner"
```

### Task 3: Apply templates without damaging other canvas content

**Files:**
- Modify: `src/features/canvas/editor-pages.ts`
- Modify: `src/features/canvas/auto-layout.ts`
- Test: `__tests__/editor-photo-templates.test.ts`
- Test: `__tests__/auto-layout.test.ts`

- [ ] **Step 1: Write failing editor mutation tests**

Create `__tests__/editor-photo-templates.test.ts` with a page containing two images, text, sticker, background and `classic-2`, then assert:

```ts
import {
  addImageToPage,
  applyPhotoTemplateToPage,
  deleteCanvasElement,
  replacePagePhotos,
  setCanvasBackground,
  updateCanvasElement,
} from "../src/features/canvas/editor-pages";
import type { StoryPage } from "../src/types/memory";

const page: StoryPage = {
  id: "page-1", position: 0, kind: "photo", headline: "Title", body: "Body",
  layout: {
    aspectRatio: .75,
    backgroundId: "background-01",
    photoTemplateId: "classic-2",
    elements: [
      { id: "a", type: "image", uri: "file://a.jpg", x: .09, y: .09, width: .82, height: .37, rotation: 0, zIndex: 1 },
      { id: "b", type: "image", uri: "file://b.jpg", x: .09, y: .54, width: .82, height: .37, rotation: 0, zIndex: 2 },
      { id: "text", type: "text", text: "Keep", fontStyle: "system", color: "#000000", fontSize: 16, x: .1, y: .9, width: .8, height: .05, rotation: 0, zIndex: 3 },
      { id: "sticker", type: "sticker", stickerId: "sticker1-01", x: .7, y: .7, width: .1, height: .1, rotation: 0, zIndex: 4 },
    ],
  },
};

describe("editor photo templates", () => {
  it("changes only image geometry when applying a matching template", () => {
    const next = applyPhotoTemplateToPage([page], "page-1", "columns-2")[0];
    expect(next.layout?.photoTemplateId).toBe("columns-2");
    expect(next.layout?.backgroundId).toBe("background-01");
    expect(next.layout?.elements.find((element) => element.id === "text")).toEqual(page.layout?.elements[2]);
    expect(next.layout?.elements.find((element) => element.id === "sticker")).toEqual(page.layout?.elements[3]);
    expect(next.layout?.elements.find((element) => element.id === "a")).toMatchObject({ uri: "file://a.jpg", x: .08, width: .39 });
  });

  it("clears template state only for manual image geometry or image-count changes", () => {
    expect(updateCanvasElement([page], "page-1", "a", { x: .2 })[0].layout?.photoTemplateId).toBeUndefined();
    expect(updateCanvasElement([page], "page-1", "text", { text: "Changed" })[0].layout?.photoTemplateId).toBe("classic-2");
    expect(addImageToPage([page], "page-1", "c", "file://c.jpg")[0].layout?.photoTemplateId).toBeUndefined();
    expect(deleteCanvasElement([page], "page-1", "a")[0].layout?.photoTemplateId).toBeUndefined();
    expect(setCanvasBackground([page], "page-1", undefined)[0].layout?.photoTemplateId).toBe("classic-2");
  });

  it("replaces photos while preserving non-image elements and metadata", () => {
    const next = replacePagePhotos([page], "page-1", [
      { id: "new-a", uri: "file://new-a.jpg" },
      { id: "new-b", uri: "file://new-b.jpg" },
      { id: "new-c", uri: "file://new-c.jpg" },
    ], "story-3")[0];
    expect(next.layout?.photoTemplateId).toBe("story-3");
    expect(next.layout?.elements.filter((element) => element.type === "image")).toHaveLength(3);
    expect(next.layout?.elements).toEqual(expect.arrayContaining([expect.objectContaining({ id: "text" }), expect.objectContaining({ id: "sticker" })]));
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx jest --runInBand __tests__/editor-photo-templates.test.ts __tests__/auto-layout.test.ts`

Expected: FAIL because the new editor functions and metadata behavior do not exist.

- [ ] **Step 3: Refactor layout metadata preservation and add mutations**

Replace `preserveLayoutMeta` with a helper that carries `photoTemplateId` unless explicitly cleared. Use an explicit mode so `undefined` cannot accidentally preserve stale state through a default parameter:

```ts
function preserveLayoutMeta(
  page: StoryPage,
  elements: CanvasElement[],
  templateMode: "preserve" | "clear" | PhotoTemplateId = "preserve",
) {
  const prev = page.layout;
  const photoTemplateId = templateMode === "preserve"
    ? prev?.photoTemplateId
    : templateMode === "clear"
      ? undefined
      : templateMode;
  return {
    aspectRatio: 0.75 as const,
    ...(prev?.backgroundId ? { backgroundId: prev.backgroundId } : {}),
    ...(prev?.coverColor ? { coverColor: prev.coverColor } : {}),
    ...(prev?.coverImage ? { coverImage: prev.coverImage } : {}),
    ...(photoTemplateId ? { photoTemplateId } : {}),
    elements,
  };
}
```

Add `applyPhotoTemplateToPage()` by resolving the template, sorting image elements by `zIndex`, validating the count, and copying each slot onto its matching image ID. Add `replacePagePhotos()` with signature:

```ts
export function replacePagePhotos(
  pages: StoryPage[],
  pageId: string,
  photos: Array<{ id: string; uri: string }>,
  templateId?: PhotoTemplateId,
): StoryPage[]
```

For 1–3 photos, use `createPhotoTemplateLayout()` when `templateId` matches. For 4–12 photos, use `createPhotoLayout()` and omit `photoTemplateId`. Keep all non-image elements unchanged.

Pass `"clear"` when photo membership or manual image geometry changes, and pass the resolved template ID when applying a template. Clear template state in `addImageToPage`, image duplication, image deletion, and `updateCanvasElement` only when the changed element is an image and the patch contains `x`, `y`, `width`, `height`, or `rotation`. Preserve it for text/style/background operations. Update `setCanvasBackground`, `setCanvasCoverColor`, and `setCanvasCoverImage` to retain `photoTemplateId` whenever they rebuild layout metadata.

- [ ] **Step 4: Run editor and existing canvas tests**

Run: `npx jest --runInBand __tests__/editor-photo-templates.test.ts __tests__/editor-pages-reorder.test.ts __tests__/auto-layout.test.ts __tests__/canvas-layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit editor-domain behavior**

```bash
git add src/features/canvas/editor-pages.ts src/features/canvas/auto-layout.ts __tests__/editor-photo-templates.test.ts __tests__/auto-layout.test.ts
git commit -m "feat: apply photo templates to canvas pages"
```

### Task 4: Generate planned multi-photo draft pages

**Files:**
- Modify: `src/services/ai/demo-draft-generator.ts`
- Modify: `src/features/memories/memory-factory.ts`
- Test: `__tests__/demo-draft-generator.test.ts`
- Test: `__tests__/memory-factory.test.ts`

- [ ] **Step 1: Write failing generator and persistence-boundary tests**

Add to `__tests__/demo-draft-generator.test.ts`:

```ts
it("creates planned multi-photo pages with persisted template ids", async () => {
  const pages = await new DemoDraftGenerator().generate({
    title: "我们的旅行", city: "hangzhou", travelDate: "2026-08-27",
    photoUris: ["file://a.jpg", "file://b.jpg", "file://c.jpg"],
    pagePlans: [
      { photoUris: ["file://a.jpg", "file://b.jpg"], photoTemplateId: "magazine-2" },
      { photoUris: ["file://c.jpg"], photoTemplateId: "columns-1" },
    ],
  });
  expect(pages.map((page) => page.kind)).toEqual(["cover", "photo", "photo", "closing"]);
  expect(pages[1].layout?.photoTemplateId).toBe("magazine-2");
  expect(pages[1].layout?.elements.filter((element) => element.type === "image")).toHaveLength(2);
  expect(pages[2].layout?.photoTemplateId).toBe("columns-1");
});
```

Create `__tests__/memory-factory.test.ts`:

```ts
import { createMemory } from "../src/features/memories/memory-factory";

it("does not keep transient page plans on the persisted memory object", () => {
  const memory = createMemory({
    id: "memory-1", now: "2026-08-27T10:00:00.000Z", pages: [],
    input: {
      title: "Trip", city: "hangzhou", travelDate: "2026-08-27", photoUris: ["file://a.jpg"],
      pagePlans: [{ photoUris: ["file://a.jpg"], photoTemplateId: "classic-1" }],
    },
  });
  expect(memory).not.toHaveProperty("pagePlans");
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npx jest --runInBand __tests__/demo-draft-generator.test.ts __tests__/memory-factory.test.ts`

Expected: FAIL because page plans are ignored and spread into the memory record.

- [ ] **Step 3: Implement planned generation with legacy fallback**

In `DemoDraftGenerator.generate`, choose `input.pagePlans` only when it is non-empty; otherwise retain the current one-photo-per-page loop. For each planned page:

```ts
const imageLayout = plan.photoTemplateId
  ? createPhotoTemplateLayout(plan.photoUris, plan.photoTemplateId)
  : null;
const freeLayout = imageLayout ?? createPhotoLayout(plan.photoUris);
const pageId = `photo-${index + 1}`;
const legacy = createLegacyLayout({
  id: pageId,
  position: pages.length,
  kind: "photo",
  headline: "把这一刻留住",
  body: `这一页收录了 ${plan.photoUris.length} 张照片。`,
  photoUri: plan.photoUris[0],
});
const textElements = legacy.elements.filter((element) => element.type === "text").map((element, textIndex) => ({
  ...element,
  zIndex: freeLayout.elements.length + textIndex + 1,
}));
pages.push({
  id: pageId,
  position: pages.length,
  kind: "photo",
  headline: "把这一刻留住",
  body: `这一页收录了 ${plan.photoUris.length} 张照片。`,
  photoUri: plan.photoUris[0],
  layout: { ...freeLayout, elements: [...freeLayout.elements, ...textElements] },
});
```

In `createMemory`, destructure page plans before returning:

```ts
const { pagePlans: _pagePlans, ...persistedInput } = input;
return { id, ...persistedInput, pages: namespacedPages, createdAt: now, updatedAt: now };
```

- [ ] **Step 4: Run generator, factory, provider, and remote-contract tests**

Run: `npx jest --runInBand __tests__/demo-draft-generator.test.ts __tests__/memory-factory.test.ts __tests__/memories-provider-draft-pages.test.tsx __tests__/remote-contract.test.ts`

Expected: PASS, including legacy one-photo-per-page behavior.

- [ ] **Step 5: Commit planned draft generation**

```bash
git add src/services/ai/demo-draft-generator.ts src/features/memories/memory-factory.ts __tests__/demo-draft-generator.test.ts __tests__/memory-factory.test.ts
git commit -m "feat: generate planned album draft pages"
```

### Task 5: Build the shared accessible template picker

**Files:**
- Create: `src/features/canvas/photo-template-picker.tsx`
- Test: `__tests__/photo-template-picker.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
import { fireEvent, render } from "@testing-library/react-native";
import { PhotoTemplatePicker } from "../src/features/canvas/photo-template-picker";

it("shows only five templates matching the photo count and reports selection", () => {
  const onSelect = jest.fn();
  const screen = render(<PhotoTemplatePicker photoCount={2} selectedTemplateId="classic-2" onSelect={onSelect} />);
  expect(screen.getAllByRole("button")).toHaveLength(5);
  expect(screen.getByLabelText("经典留白双图模板").props.accessibilityState).toEqual({ selected: true });
  fireEvent.press(screen.getByLabelText("杂志侧栏双图模板"));
  expect(onSelect).toHaveBeenCalledWith("magazine-2");
  expect(screen.queryByLabelText("杂志侧栏三图模板")).toBeNull();
});
```

- [ ] **Step 2: Run the picker test and confirm RED**

Run: `npx jest --runInBand __tests__/photo-template-picker.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled picker**

Create a horizontal `ScrollView` that maps `getPhotoTemplatesForCount(photoCount)`. Each `Pressable` must use:

```tsx
<Pressable
  accessibilityLabel={`${template.familyLabel}${countLabels[template.photoCount]}模板`}
  accessibilityRole="button"
  accessibilityState={{ selected: selectedTemplateId === template.id }}
  onPress={() => onSelect(template.id)}
>
  <View style={styles.preview}>
    {template.slots.map((slot, index) => (
      <View key={index} style={[styles.slot, {
        left: `${slot.x * 100}%`, top: `${slot.y * 100}%`,
        width: `${slot.width * 100}%`, height: `${slot.height * 100}%`,
        transform: [{ rotate: `${slot.rotation}deg` }],
      }]} />
    ))}
  </View>
  <Text>{template.familyLabel}</Text>
</Pressable>
```

Use the existing `colors`, `bodyFont`, 3:4 preview ratio, visible selected border and check mark, and touch targets of at least 44 points.

- [ ] **Step 4: Run the picker test and confirm GREEN**

Run: `npx jest --runInBand __tests__/photo-template-picker.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the picker**

```bash
git add src/features/canvas/photo-template-picker.tsx __tests__/photo-template-picker.test.tsx
git commit -m "feat: add photo template picker"
```

### Task 6: Add hybrid draft allocation to the new-memory flow

**Files:**
- Create: `src/features/memories/draft-photo-allocation.tsx`
- Modify: `src/app/memory/new.tsx`
- Test: `__tests__/draft-photo-allocation.test.tsx`
- Test: `__tests__/new-memory-photo-planning.test.tsx`
- Modify: `__tests__/new-memory-city-selector.test.tsx`

- [ ] **Step 1: Write failing controlled-allocation tests**

Test these observable behaviors in `__tests__/draft-photo-allocation.test.tsx` as two separate tests. The first renders with `onChange = jest.fn()` and verifies that reducing two default pages emits one four-photo freeform plan. The second uses a controlled harness that writes `onChange` back into state, switches to per-page mode, and moves the first photo from page 1 to page 2:

```tsx
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const photos = ["file://1.jpg", "file://2.jpg", "file://3.jpg", "file://4.jpg"];
const initial = createBalancedPhotoPagePlans(photos);
const onChange = jest.fn();
const screen = render(<DraftPhotoAllocation photoUris={photos} value={initial} onChange={onChange} />);

expect(screen.getByText("一起配置")).toBeTruthy();
expect(screen.getByText("2 个内容页")).toBeTruthy();
fireEvent.press(screen.getByLabelText("减少内容页数"));
expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ photoUris: photos })]);

function Harness() {
  const [plans, setPlans] = React.useState(initial);
  return <DraftPhotoAllocation photoUris={photos} value={plans} onChange={setPlans} />;
}
const controlled = render(<Harness />);
fireEvent.press(controlled.getByText("逐页配置"));
fireEvent.press(controlled.getByLabelText("编辑第 2 页"));
fireEvent.press(controlled.getByLabelText("把照片 1 分配到第 2 页"));
expect(controlled.getByLabelText("第 1 页，1 张照片")).toBeTruthy();
expect(controlled.getByLabelText("第 2 页，3 张照片")).toBeTruthy();
```

In `__tests__/new-memory-photo-planning.test.tsx`, mock a four-photo picker result, press “从相册选择照片”, choose “杂志侧栏” and “应用到全部页面”, then press “生成旅行册草稿”. Assert:

```ts
expect(mockCreateDraft).toHaveBeenCalledWith(expect.objectContaining({
  photoUris: photos,
  pagePlans: [
    { photoUris: photos.slice(0, 2), photoTemplateId: "magazine-2" },
    { photoUris: photos.slice(2), photoTemplateId: "magazine-2" },
  ],
}));
```

- [ ] **Step 2: Run the allocation tests and confirm RED**

Run: `npx jest --runInBand __tests__/draft-photo-allocation.test.tsx __tests__/new-memory-photo-planning.test.tsx __tests__/new-memory-city-selector.test.tsx`

Expected: FAIL because allocation UI and `pagePlans` submission do not exist.

- [ ] **Step 3: Implement the controlled hybrid allocation component**

`DraftPhotoAllocation` props:

```ts
type DraftPhotoAllocationProps = {
  photoUris: string[];
  value: MemoryDraftPagePlan[];
  onChange: (plans: MemoryDraftPagePlan[]) => void;
};
```

Keep only display mode, active page index, selected family and local error in component state. “一起配置” must call `distributePhotoUris(photoUris, nextPageCount)` only when the user changes page count, then immediately reapply the selected family to all compatible pages. Family buttons update the selected family; the explicit “应用到全部页面” button calls `applyTemplateFamilyToPlans` and renders skipped page numbers as `第 1、2 页保持自由排版`. “逐页配置” uses `movePhotoToPage`; render all photos with page-number labels and disable moves that would empty a source page. Use `PhotoTemplatePicker` for the active page when its count is 1–3, and update only that plan’s `photoTemplateId`.

- [ ] **Step 4: Integrate allocation after photo selection**

In `NewMemoryScreen` add:

```ts
const [pagePlans, setPagePlans] = React.useState<MemoryDraftPagePlan[]>([]);
```

After a successful picker:

```ts
const uris = result.assets.map((asset) => asset.uri);
setPhotoUris(uris);
setPagePlans(createBalancedPhotoPagePlans(uris));
```

Render `DraftPhotoAllocation` after the photo strip, and submit `pagePlans` in `createDraft`. Disable generation when `pagePlans` is empty or contains an empty page.

- [ ] **Step 5: Run the new-memory tests and confirm GREEN**

Run: `npx jest --runInBand __tests__/draft-photo-allocation.test.tsx __tests__/new-memory-photo-planning.test.tsx __tests__/new-memory-city-selector.test.tsx __tests__/demo-draft-generator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the draft workflow**

```bash
git add src/features/memories/draft-photo-allocation.tsx src/app/memory/new.tsx __tests__/draft-photo-allocation.test.tsx __tests__/new-memory-photo-planning.test.tsx __tests__/new-memory-city-selector.test.tsx
git commit -m "feat: plan photos before creating album drafts"
```

### Task 7: Add photo-first page creation and post-creation layout editing

**Files:**
- Create: `src/features/canvas/photo-layout-sheet.tsx`
- Modify: `src/features/canvas/page-manager-sheet.tsx`
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Modify: `__tests__/page-manager-sheet.test.tsx`
- Modify: `__tests__/book-canvas-editor.test.tsx`
- Modify: `__tests__/draft-review-screen.test.tsx`
- Test: `__tests__/photo-layout-sheet.test.tsx`

- [ ] **Step 1: Change the page-manager test to require delegation**

Replace the current empty-page test with:

```tsx
it("requests the photo-first add-page flow without mutating pages", () => {
  const onChange = jest.fn();
  const onRequestAddPage = jest.fn();
  const screen = render(
    <PageManagerSheet onChange={onChange} onClose={() => undefined} onRequestAddPage={onRequestAddPage} pages={pages} />,
  );
  fireEvent.press(screen.getByLabelText("添加页面"));
  expect(onRequestAddPage).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write failing editor workflow tests**

Extend `__tests__/book-canvas-editor.test.tsx` so the picker mock can return multiple assets. Add tests that:

1. Open page management, press “添加页面”, return two selected photos, and assert no `onChange` call until “杂志侧栏双图模板” and “创建页面” are pressed.
2. Cancel the system picker and assert no new page or layout sheet.
3. Select photos, open the staged sheet, press “取消”, and assert no page is created.
4. Return four photos and assert the text “模板仅支持 3 张及以内照片，仍可自行排版” and a working “创建自由排版页面” button.
5. Reject the second `persistSelectedPhoto` call and assert the iCloud/storage alert plus no page change.
6. On an existing photo page, press “照片布局”, replace photos, choose a template, confirm, and assert text/background elements remain.
7. Transform an image and assert the emitted page has no `photoTemplateId`.

Create `__tests__/photo-layout-sheet.test.tsx` to assert that zero photos disable confirmation, two photos render exactly five template buttons, four photos render the exact freeform warning, and cancel calls only `onCancel`.

- [ ] **Step 3: Run page-manager and editor tests and confirm RED**

Run: `npx jest --runInBand __tests__/photo-layout-sheet.test.tsx __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx __tests__/draft-review-screen.test.tsx`

Expected: FAIL because the delegated flow and photo layout sheet do not exist.

- [ ] **Step 4: Build the staged `PhotoLayoutSheet`**

Use controlled props:

```ts
type PhotoLayoutSheetProps = {
  action: "add" | "edit";
  photoUris: string[];
  selectedTemplateId?: PhotoTemplateId;
  onCancel: () => void;
  onConfirm: (templateId?: PhotoTemplateId) => void;
  onReplacePhotos: () => void;
};
```

The modal shows photo thumbnails, a “重新选择照片” button, `PhotoTemplatePicker` only for counts 1–3, the required over-three warning, and a disabled confirm button for zero photos. Its confirm label is “创建页面”, “创建自由排版页面”, or “应用照片布局” based on action/count. It does not mutate pages directly.

- [ ] **Step 5: Delegate add-page requests from `PageManagerSheet`**

Add required `onRequestAddPage: () => void`. Replace `addPage()` with:

```ts
const addPage = () => {
  onClose();
  onRequestAddPage();
};
```

Remove `buildPageId` and the `addCanvasPage` import from the page manager.
Update every existing `PageManagerSheet` test render to pass `onRequestAddPage={() => undefined}` unless that test is asserting the callback.

- [ ] **Step 6: Let `BookCanvasEditor` own photo picking and strict persistence**

Add staged state:

```ts
type PendingPhotoLayout = {
  action: "add" | "edit";
  pageId?: string;
  photoUris: string[];
  selectedTemplateId?: PhotoTemplateId;
};
const [pendingPhotoLayout, setPendingPhotoLayout] = React.useState<PendingPhotoLayout | null>(null);
```

Add `pickAndPersistPhotos()` that requests permission, launches with `allowsMultipleSelection: true`, caps assets at `MAX_PHOTOS_PER_CANVAS_PAGE`, persists each URI through `persistPickedPhoto`, and returns `null` on cancel/permission/failure. It must not call `changePages`.

For add page, set `{ action: "add", photoUris }` after persistence. For edit, initialize from `pageImageUris(currentPage)` and existing `photoTemplateId`; “重新选择照片” replaces only staged URIs. On confirm:

```ts
if (pending.action === "add") {
  const addedPageId = buildCanvasId("page");
  const next = addCanvasPage(pages, pending.photoUris, addedPageId, templateId);
  changePages(next, "structure");
  const addedIndex = next.findIndex((page) => page.id === addedPageId);
  activePageIdRef.current = addedPageId;
  setCurrentIndex(addedIndex);
} else if (pending.pageId) {
  changePages(replacePagePhotos(
    clearPendingTextFrom(),
    pending.pageId,
    pending.photoUris.map((uri, index) => ({ id: buildCanvasId(`image-${index + 1}`), uri })),
    templateId,
  ), "structure");
}
setPendingPhotoLayout(null);
```

Update `addCanvasPage` to accept optional `templateId`, produce aspect ratio `3 / 4`, and use template layout only when count matches. Insert the new page immediately before a trailing `kind === "closing"` page so the closing page remains last. Add a domain test asserting `[cover, closing]` becomes `[cover, new photo page, closing]`. Add a “照片布局” button for `currentPage.kind === "photo"`; retain the current “📷 添加照片” behavior as a quick freeform addition that clears the template ID.

- [ ] **Step 7: Run editor, draft-review, and saved-editor tests**

Run: `npx jest --runInBand __tests__/photo-layout-sheet.test.tsx __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx __tests__/draft-review-screen.test.tsx __tests__/memory-canvas-editor.test.tsx __tests__/editor-photo-templates.test.ts`

Expected: PASS, including saved-editor regression coverage in `memory-canvas-editor.test.tsx`.

- [ ] **Step 8: Commit the editor workflow**

```bash
git add src/features/canvas/photo-layout-sheet.tsx src/features/canvas/page-manager-sheet.tsx src/features/canvas/book-canvas-editor.tsx src/features/canvas/editor-pages.ts __tests__/photo-layout-sheet.test.tsx __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx __tests__/draft-review-screen.test.tsx
git commit -m "feat: add photo-first canvas pages"
```

### Task 8: Run full gates and perform a focused final review

**Files:**
- Modify only files required by failures caused by Tasks 1–7.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: PASS with zero ESLint errors.

- [ ] **Step 2: Run type checking**

Run: `npm run typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 3: Run the complete test suite**

Run: `npm run test:ci`

Expected: PASS with every Jest and Node test green.

- [ ] **Step 4: Run the production server build**

Run: `npm run build:server`

Expected: Expo web export completes successfully; no route or bundle error.

- [ ] **Step 5: Review scope and safety boundaries**

Run:

```bash
git diff --check
git status --short
git diff --stat bca9deb..HEAD
rg -n "fetch\(|axios|apiKey|API_KEY|analytics|payment" src/features/canvas src/features/memories src/app/memory/new.tsx
```

Expected: no whitespace errors; only intended files changed; no new network, secret, analytics, or payment behavior.

Verify manually from the code and tests:

- exactly 15 templates and five per supported photo count;
- cover/closing excluded from configurable content pages;
- add-page cancel creates nothing;
- 4–12 photos show the exact freeform warning;
- strict persistence completes before page mutation;
- applying a template preserves all non-image elements;
- manual image geometry clears template state;
- existing draft autosave and saved-memory recovery/save boundaries remain intact.

- [ ] **Step 6: Record the final verified revision**

Run: `git log -1 --oneline`

Expected: the latest feature or focused gate-fix commit is shown. If a gate exposed a defect, return to the task that owns that file, add a failing regression test, complete a fresh RED/GREEN cycle, and use that task's exact `git add` file list before re-running all four gates. Do not create an empty commit.
