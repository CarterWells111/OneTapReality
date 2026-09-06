import * as React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { captureRef } from "react-native-view-shot";

import { CanvasPage, listCanvasRasterAssetIds, type CanvasAssetEvent } from "../canvas/canvas-page";
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
 * 3. 等待全部图片显示后，captureRef 以 2x 逻辑分辨率截图 → JPEG data-URI
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
 * - string  → data-URI JPEG（页面有 layout 且截图成功）
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

const PDF_CAPTURE_SCALE = 2;
const PDF_CAPTURE_QUALITY = 0.80;
const PDF_PAGE_ASSET_TIMEOUT_MS = 10_000;

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
  const assetController = React.useRef<{
    index: number;
    onEvent: (event: CanvasAssetEvent) => void;
  } | null>(null);

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

  const handleAssetEvent = React.useCallback((event: CanvasAssetEvent) => {
    assetController.current?.onEvent(event);
  }, []);

  // 每次 progress 变化时，新页面已经提交到原生视图树。只有全部图片报告 displayed
  // 后才允许截图；timeout 只会失败，不会作为“继续截图”的许可。
  React.useLayoutEffect(() => {
    const t = task.current;
    if (!t) return;
    const activeTask = t;
    const page = t.pages[t.index];
    let cancelled = false;
    let capturing = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      if (assetController.current?.index === activeTask.index) assetController.current = null;
    };

    const fail = (message: string) => {
      if (cancelled || task.current !== activeTask) return;
      stop();
      activeTask.reject(new Error(message));
      busy.current = false;
      task.current = null;
      setProgress(null);
    };

    function advance() {
      if (timeout) clearTimeout(timeout);
      const nextIndex = activeTask.index + 1;
      if (nextIndex >= activeTask.pages.length) {
        const finalResults = [...activeTask.results];
        stop();
        activeTask.resolve(finalResults);
        busy.current = false;
        task.current = null;
        setProgress(null);
      } else {
        assetController.current = null;
        activeTask.index = nextIndex;
        setProgress({ current: nextIndex, total: activeTask.pages.length });
      }
    }

    if (!page?.layout) {
      t.results[t.index] = null;
      advance();
      return stop;
    }

    const expected = new Set(listCanvasRasterAssetIds(page.layout));
    const displayed = new Set<string>();

    const captureCurrent = async () => {
      if (capturing || cancelled) return;
      capturing = true;
      try {
        await nextAnimationFrame();
        await nextAnimationFrame();
        if (cancelled || task.current !== activeTask) return;
        const dataUri = await captureRef(pageRef, {
          format: "jpg",
          quality: PDF_CAPTURE_QUALITY,
          result: "data-uri",
          width: t.pageWidth * PDF_CAPTURE_SCALE,
          height: t.pageHeight * PDF_CAPTURE_SCALE,
        });
        if (cancelled || task.current !== activeTask) return;
        t.results[t.index] = dataUri;
      } catch {
        fail(`第 ${t.index + 1} 页截图失败，PDF 未生成`);
        return;
      }
      if (!cancelled) advance();
    };

    const maybeCapture = () => {
      if ([...expected].every((id) => displayed.has(id))) void captureCurrent();
    };
    assetController.current = {
      index: t.index,
      onEvent: (event) => {
        if (cancelled || !expected.has(event.id)) return;
        if (event.outcome === "error") {
          fail(`第 ${t.index + 1} 页有图片无法加载，PDF 未生成`);
          return;
        }
        displayed.add(event.id);
        maybeCapture();
      },
    };
    timeout = setTimeout(() => {
      fail(`第 ${t.index + 1} 页图片加载超时，PDF 未生成`);
    }, PDF_PAGE_ASSET_TIMEOUT_MS);
    maybeCapture();

    return () => {
      if (!cancelled) {
        cancelled = true;
        if (timeout) clearTimeout(timeout);
      }
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
              onAssetEvent={handleAssetEvent}
              width={task.current!.pageWidth}
            />
          </View>
        </View>
      ) : null}
    </>
  );
}

// ── 工具函数 ──

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
