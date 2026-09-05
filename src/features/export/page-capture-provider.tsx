import * as React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { captureRef } from "react-native-view-shot";

import { CanvasPage } from "../canvas/canvas-page";
import { colors, bodyFont, serifFont } from "../../components/ui";
import type { StoryPage } from "../../types/memory";

/**
 * 页面截图桥接与服务。
 *
 * 设计动机：
 * - share-action-sheet.ts 是纯逻辑模块，无法访问 React 组件或 Hook；
 * - 但高质量截图需要真实的 React Native 渲染（边框、贴纸、字体、expo-image）；
 * - 所以通过模块级回调建立命令式桥接，由 PageCaptureProvider 在挂载时注册。
 *
 * 工作流程：
 * 1. capturePagesAsImages() 被调用（从 share-action-sheet）
 * 2. Provider 显示进度遮罩层，逐页渲染 CanvasPage
 * 3. captureRef 以 3x 逻辑分辨率截图 → data-URI
 * 4. 全部完成后 resolve 结果数组，调用者嵌入 HTML → PDF
 */

// ── 模块级桥接 ──

type CaptureAPI = {
  capturePages: (
    pages: StoryPage[],
    pageWidth: number,
    pageHeight: number,
  ) => Promise<(string | null)[]>;
};

let bridge: CaptureAPI | null = null;

/**
 * 命令式入口：请求对给定的页面列表逐页截图。
 *
 * 返回值是一个 (string | null)[]，其中：
 * - string  → data-URI PNG（页面有 layout 且截图成功）
 * - null    → 该页无 layout（调用方回退到 HTML 渲染）
 *
 * 如果 Provider 未挂载或正在执行另一个任务，会抛出错误。
 */
export function capturePagesAsImages(
  pages: StoryPage[],
  pageWidth: number,
  pageHeight: number,
): Promise<(string | null)[]> {
  if (!bridge) {
    throw new Error("PageCaptureProvider 未挂载，请在根布局中包裹该组件。");
  }
  return bridge.capturePages(pages, pageWidth, pageHeight);
}

// ── 截图缩放倍率 ──
// 1x → 360x480 logical pixels → 360x480 output.
// Keep Expo Go and TestFlight exports at the original 360x480 canvas size.
// This avoids iOS PDF memory limits for multipage albums.
const CAPTURE_SCALE = 1;

// ── Provider 组件 ──

export function PageCaptureProvider({ children }: { children: React.ReactNode }) {
  // 仅用于驱动进度遮罩的 React 状态
  const [progress, setProgress] = React.useState<{
    current: number;
    total: number;
  } | null>(null);

  // 避免并发截图
  const busy = React.useRef(false);
  // 截图目标的 View ref（每次换页时指向新的 CanvasPage 包裹容器）
  const pageRef = React.useRef<View>(null);

  // 截图任务的完整可变状态用 ref 存储，避免闭包陈旧问题
  const task = React.useRef<{
    pages: StoryPage[];
    pageWidth: number;
    pageHeight: number;
    results: (string | null)[];
    index: number;
    resolve: (results: (string | null)[]) => void;
    reject: (error: Error) => void;
  } | null>(null);

  // ── 注册到模块级桥接 ──
  const capturePages = React.useCallback(
    (
      pages: StoryPage[],
      pageWidth: number,
      pageHeight: number,
    ): Promise<(string | null)[]> => {
      return new Promise((resolve, reject) => {
        if (busy.current) {
          reject(new Error("已有导出任务正在进行中"));
          return;
        }
        if (pages.length === 0) {
          resolve([]);
          return;
        }
        busy.current = true;
        task.current = {
          pages,
          pageWidth,
          pageHeight,
          results: new Array(pages.length).fill(null),
          index: 0,
          resolve,
          reject,
        };
        setProgress({ current: 0, total: pages.length });
      });
    },
    [],
  );

  React.useEffect(() => {
    bridge = { capturePages };
    return () => {
      bridge = null;
    };
  }, [capturePages]);

  // ── 截图循环 ──
  // 每次 progress 变化 → 新页面已挂载 → 截图 → 推进到下一页
  React.useEffect(() => {
    const t = task.current;
    if (!t) return;
    const activeTask = t;

    const page = t.pages[t.index];

    // 无 layout 的页面：不截图，直接跳到下一页
    if (!page?.layout) {
      t.results[t.index] = null;
      advance();
      return;
    }

    let cancelled = false;

    const captureCurrent = async () => {
      // 给 expo-image 和布局留出渲染时间
      await delay(100);

      if (cancelled || !pageRef.current) {
        // 如果 ref 还没就位，再等一下
        await delay(200);
      }
      if (cancelled) return;

      try {
        const dataUri = await captureRef(pageRef, {
          format: "png",
          quality: 1,
          result: "data-uri",
          width: t.pageWidth * CAPTURE_SCALE,
          height: t.pageHeight * CAPTURE_SCALE,
        });
        t.results[t.index] = dataUri;
      } catch (err) {
        // 单页失败不中断整体流程，该页保持 null
        console.warn(
          `[PageCapture] 第 ${t.index + 1} 页截图失败:`,
          err instanceof Error ? err.message : String(err),
        );
        t.results[t.index] = null;
      }

      if (!cancelled) {
        advance();
      }
    };

    function advance() {
      const nextIndex = activeTask.index + 1;
      if (nextIndex >= activeTask.pages.length) {
        // 全部完成
        const finalResults = [...activeTask.results];
        activeTask.resolve(finalResults);
        busy.current = false;
        task.current = null;
        setProgress(null);
      } else {
        activeTask.index = nextIndex;
        setProgress({ current: nextIndex, total: activeTask.pages.length });
      }
    }

    captureCurrent();

    return () => {
      cancelled = true;
    };
  }, [progress]);

  // ── 清理：组件卸载时拒绝进行中的任务 ──
  React.useEffect(() => {
    return () => {
      if (task.current) {
        task.current.reject(new Error("页面截图组件已卸载"));
        busy.current = false;
        task.current = null;
      }
    };
  }, []);

  const currentPage =
    progress && task.current
      ? task.current.pages[task.current.index]
      : null;

  return (
    <>
      {children}

      {/* 进度遮罩 */}
      {progress ? (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator color="#B76545" size="large" />
            <Text style={styles.overlayTitle}>正在生成高清 PDF</Text>
            <Text style={styles.overlayProgress}>
              第 {progress.current + 1} / {progress.total} 页
            </Text>
            <Text style={styles.overlayHint}>
              请稍候，正在逐页渲染截图…
            </Text>
          </View>
        </View>
      ) : null}

      {/* 隐藏渲染层 —— 仅在有 layout 的页需要截图时挂载 */}
      {currentPage?.layout ? (
        <View style={styles.captureSurface} pointerEvents="none">
          <View
            ref={pageRef}
            collapsable={false}
            style={{
              backgroundColor: "#FFFFFF",
              width: task.current!.pageWidth,
              height: task.current!.pageHeight,
              overflow: "hidden",
            }}
          >
            <CanvasPage
              flatEdges
              height={task.current!.pageHeight}
              interactive={false}
              layout={currentPage.layout}
              width={task.current!.pageWidth}
            />
          </View>
        </View>
      ) : null}
    </>
  );
}

// ── 工具函数 ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 样式 ──

const styles = StyleSheet.create({
  // 全屏遮罩
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(28, 44, 40, 0.6)",
    justifyContent: "center",
    zIndex: 9999,
  },
  overlayCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    gap: 12,
    paddingHorizontal: 36,
    paddingVertical: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  overlayTitle: {
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 18,
    fontWeight: "800",
  },
  overlayProgress: {
    color: colors.warmAccent,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: "700",
  },
  overlayHint: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
  },
  // 屏幕外渲染层（不可见但保持布局，供 captureRef 截图）
  captureSurface: {
    left: -9999,
    position: "absolute",
    top: 0,
  },
});
