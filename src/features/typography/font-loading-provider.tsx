import * as Font from "expo-font";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { createFontLoadingController, type FontLoadingSnapshot } from "./font-loading-state";
import { localFontDefinitions } from "./fonts";

type FontLoadingContextValue = {
  requestFont: (id: string, showProgress?: boolean) => void;
  resolveFontFamily: (id?: string) => string | undefined;
};

const fontById = new Map(localFontDefinitions.map((font) => [font.id, font]));
const emptySnapshot: FontLoadingSnapshot = {
  completedBytes: 0,
  statuses: Object.fromEntries(localFontDefinitions.map((font) => [font.id, "queued"])),
  totalBytes: localFontDefinitions.reduce((sum, font) => sum + font.byteSize, 0),
};

const FontLoadingContext = React.createContext<FontLoadingContextValue>({
  requestFont: () => undefined,
  resolveFontFamily: () => undefined,
});

export function FontLoadingProvider({ children }: { children: React.ReactNode }) {
  const controllerRef = React.useRef<ReturnType<typeof createFontLoadingController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createFontLoadingController(
      localFontDefinitions,
      (font) => Font.loadAsync({ [font.family]: font.source }),
    );
  }
  const controller = controllerRef.current;
  const [snapshot, setSnapshot] = React.useState<FontLoadingSnapshot>(emptySnapshot);
  const [noticeFontId, setNoticeFontId] = React.useState<string>();
  const [noticeVisible, setNoticeVisible] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    setSnapshot(controller.getSnapshot());
    controller.start();
    return unsubscribe;
  }, [controller]);

  const requestFont = React.useCallback((id: string, showProgress = false) => {
    if (showProgress && snapshot.statuses[id] !== "loaded") {
      setNoticeFontId(id);
      setNoticeVisible(true);
    }
    controller.request(id);
  }, [controller, snapshot.statuses]);

  const resolveFontFamily = React.useCallback((id?: string) => {
    if (!id || snapshot.statuses[id] !== "loaded") return undefined;
    return fontById.get(id)?.family;
  }, [snapshot.statuses]);

  const noticeFont = noticeFontId ? fontById.get(noticeFontId) : undefined;
  const noticeStatus = noticeFontId ? snapshot.statuses[noticeFontId] : undefined;
  const percent = snapshot.totalBytes > 0
    ? Math.round((snapshot.completedBytes / snapshot.totalBytes) * 100)
    : 0;

  return (
    <FontLoadingContext.Provider value={{ requestFont, resolveFontFamily }}>
      {children}
      {noticeVisible && noticeFont && noticeStatus !== "loaded" ? (
        <View accessibilityLabel="字体加载进度" style={styles.notice}>
          <View style={styles.noticeHeader}>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>正在准备“{noticeFont.label}”</Text>
              <Text style={styles.noticeBody}>当前先使用系统字体，后台加载完成后会自动替换 · {percent}%</Text>
            </View>
            <Pressable accessibilityLabel="关闭字体加载提示" onPress={() => setNoticeVisible(false)} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          {noticeStatus === "failed" ? (
            <Pressable
              accessibilityLabel="重试加载字体"
              onPress={() => {
                setNoticeVisible(true);
                controller.retry(noticeFont.id);
              }}
              style={styles.retryButton}>
              <Text style={styles.retryText}>加载失败，点此重试</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </FontLoadingContext.Provider>
  );
}

export function useFontLoading() {
  return React.useContext(FontLoadingContext);
}

export function useResolvedFontFamily(id?: string) {
  return useFontLoading().resolveFontFamily(id);
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(28,44,40,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    bottom: 24,
    elevation: 6,
    left: 20,
    padding: 14,
    position: "absolute",
    right: 20,
    shadowColor: "#000000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    zIndex: 30000,
  },
  noticeHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: "#1C2C28", fontSize: 14, fontWeight: "700" },
  noticeBody: { color: "rgba(28,44,40,0.65)", fontSize: 12, lineHeight: 18, marginTop: 3 },
  closeButton: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  closeText: { color: "#1C2C28", fontSize: 22, lineHeight: 24 },
  track: { backgroundColor: "rgba(183,101,69,0.15)", borderRadius: 3, height: 5, marginTop: 10, overflow: "hidden" },
  fill: { backgroundColor: "#B76545", borderRadius: 3, height: "100%" },
  retryButton: { alignSelf: "flex-start", marginTop: 10 },
  retryText: { color: "#B76545", fontSize: 13, fontWeight: "700" },
});
