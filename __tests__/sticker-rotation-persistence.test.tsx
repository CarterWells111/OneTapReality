import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";

import { normalizeLayout } from "../src/features/canvas/canvas-layout";
import { CanvasPage } from "../src/features/canvas/canvas-page";
import {
  addStickerToPage,
  canvasPages,
  updateCanvasElement,
} from "../src/features/canvas/editor-pages";
import type { CanvasLayout, StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const basePages: StoryPage[] = [
  { id: "cover-1", position: 0, kind: "cover", headline: "封面", body: "正文" },
];

/**
 * 回归：旋转过的贴纸保存后旋转效果消失。
 *
 * 完整闭环：
 *  1) 编辑器里在封面页放一个贴纸并旋转它（onTransformEnd 提交 rotation）
 *  2) 保存：layout_json 序列化保存 layout（含 rotation）
 *  3) 重载：SQLite 读出后经 normalizeLayout 还原 layout
 *  4) 阅读器：CanvasPage 非交互渲染应应用 element.rotation
 */
describe("sticker rotation survives save/reload round-trip", () => {
  it("committed sticker rotation is persisted and re-rendered after reload", () => {
    // 1) 新增贴纸（初始 rotation = 0）
    const withSticker = addStickerToPage(basePages, "cover-1", "sticker-1", "sticker1-01");
    const before = withSticker[0].layout!.elements.find((e) => e.id === "sticker-1")!;
    expect(before.rotation).toBe(0);

    // 2) 模拟旋转手势提交：onTransformEnd → updateCanvasElement(rotation: 0.6)
    const rotated = updateCanvasElement(withSticker, "cover-1", "sticker-1", { rotation: 0.6 });
    const committed = rotated[0].layout!.elements.find((e) => e.id === "sticker-1")!;
    expect(committed.rotation).toBeCloseTo(0.6);

    // 3) 模拟 SQLite 保存 + 重载：canvasPages → JSON.stringify/normalizeLayout
    const serialized = JSON.stringify(committed && rotated[0].layout);
    const reloadedLayout = normalizeLayout(JSON.parse(serialized) as CanvasLayout);
    const reloaded = reloadedLayout.elements.find((e) => e.id === "sticker-1")!;
    expect(reloaded.rotation).toBeCloseTo(0.6);

    // 4) 阅读器非交互渲染应用保存的旋转
    const rotatedLayout: CanvasLayout = { ...reloadedLayout, aspectRatio: 0.75 };
    const screen = render(<CanvasPage interactive={false} layout={rotatedLayout} width={300} />);
    const style = StyleSheet.flatten(screen.getByTestId("canvas-element-sticker-1").props.style) as any;
    expect(style.transform).toEqual([{ rotate: "0.6rad" }]);
  });

  it("canvasPages() keeps an existing rotated layout untouched for a fresh edit session", () => {
    const rotated = updateCanvasElement(
      addStickerToPage(basePages, "cover-1", "sticker-1", "sticker1-01"),
      "cover-1",
      "sticker-1",
      { rotation: -0.9 },
    );
    const reloaded = canvasPages(rotated);
    const el = reloaded[0].layout!.elements.find((e) => e.id === "sticker-1")!;
    expect(el.rotation).toBeCloseTo(-0.9);
  });

  it("a subsequent resize/corner-drag commit keeps the previously-saved rotation", () => {
    // 先旋转到 0.6
    const rotated = updateCanvasElement(
      addStickerToPage(basePages, "cover-1", "sticker-1", "sticker1-01"),
      "cover-1",
      "sticker-1",
      { rotation: 0.6 },
    );
    // 角落拖拽缩放：patch 只带宽度/高度（不含 rotation），不应把旋转重置为 0
    const resized = updateCanvasElement(rotated, "cover-1", "sticker-1", {
      width: 0.3,
      height: 0.3,
    });
    const el = resized[0].layout!.elements.find((e) => e.id === "sticker-1")!;
    expect(el.rotation).toBeCloseTo(0.6);
    expect(el.width).toBeCloseTo(0.3);
  });

  it("cumulative gesture rotation is reflected in the committed element state", () => {
    // 模拟 finalizeGesture 的计算：baseRotation + gestureRotation → 提交后成为新的基座旋转。
    // Stage 1: 从 0 旋转 0.6；Stage 2: 在已保存 0.6 基础上再旋转 0.3 → 最终 0.9。
    const once = updateCanvasElement(
      addStickerToPage(basePages, "cover-1", "sticker-1", "sticker1-01"),
      "cover-1",
      "sticker-1",
      { rotation: 0 + 0.6 },
    );
    const afterOnce = once[0].layout!.elements.find((e) => e.id === "sticker-1")!;
    expect(afterOnce.rotation).toBeCloseTo(0.6);
    const twice = updateCanvasElement(once, "cover-1", "sticker-1", {
      rotation: 0.6 + 0.3,
    });
    const afterTwice = twice[0].layout!.elements.find((e) => e.id === "sticker-1")!;
    expect(afterTwice.rotation).toBeCloseTo(0.9);
  });
});
