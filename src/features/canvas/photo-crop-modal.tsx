import * as React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PhotoCropState } from "../../types/memory";
import { bodyFont } from "../../components/ui";
import { CroppedImage } from "./cropped-image";
import {
  DEFAULT_PHOTO_CROP,
  normalizePhotoCropState,
  panPhotoCrop,
  zoomPhotoCrop,
} from "./photo-crop";

type FrameSize = { height: number; width: number };

export type PhotoCropModalProps = {
  aspectRatio: number;
  crop?: PhotoCropState;
  onCancel: () => void;
  onConfirm: (crop: PhotoCropState) => void;
  uri: string;
};

export function PhotoCropModal({ aspectRatio, crop, onCancel, onConfirm, uri }: PhotoCropModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const [draft, setDraft] = React.useState(() => normalizePhotoCropState(crop));
  const frameSizeRef = React.useRef<FrameSize>({ height: 0, width: 0 });
  const [failed, setFailed] = React.useState(false);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinchScale = useSharedValue(1);

  React.useEffect(() => setDraft(normalizePhotoCropState(crop)), [crop]);

  const commitPan = React.useCallback((translationX: number, translationY: number) => {
    setDraft((current) => panPhotoCrop(current, {
      translationX,
      translationY,
      viewportHeight: frameSizeRef.current.height,
      viewportWidth: frameSizeRef.current.width,
    }));
  }, []);
  const commitZoom = React.useCallback((scale: number) => {
    setDraft((current) => zoomPhotoCrop(current, scale));
  }, []);

  const pan = Gesture.Pan()
    .withTestId("photo-crop-pan")
    .onUpdate((event) => {
      panX.value = event.translationX;
      panY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(commitPan)(event.translationX, event.translationY);
      panX.value = 0;
      panY.value = 0;
    });
  const pinch = Gesture.Pinch()
    .withTestId("photo-crop-pinch")
    .onUpdate((event) => {
      pinchScale.value = event.scale;
    })
    .onEnd((event) => {
      runOnJS(commitZoom)(event.scale);
      pinchScale.value = 1;
    });
  const liveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: panX.value },
      { translateY: panY.value },
      { scale: pinchScale.value },
    ],
  }));

  const horizontalPadding = 28;
  const maxWidth = Math.max(1, windowWidth - (horizontalPadding * 2));
  const maxHeight = Math.max(1, windowHeight - insets.top - insets.bottom - 190);
  const frameWidth = Math.min(maxWidth, maxHeight * safeRatio);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent={false} visible>
      <View style={[styles.root, { paddingBottom: insets.bottom + 18, paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="取消裁剪" accessibilityRole="button" hitSlop={10} onPress={onCancel} style={styles.headerButton}>
            <Text selectable style={styles.secondaryText}>取消</Text>
          </Pressable>
          <Text selectable style={styles.title}>调整照片取景</Text>
          <Pressable
            accessibilityLabel="完成裁剪"
            accessibilityRole="button"
            accessibilityState={{ disabled: failed }}
            disabled={failed}
            onPress={() => onConfirm(normalizePhotoCropState(draft))}
            style={[styles.doneButton, failed && styles.disabled]}
          >
            <Text selectable style={styles.doneText}>完成</Text>
          </Pressable>
        </View>

        <View style={styles.stage}>
          <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
            <View
              onLayout={(event) => {
                frameSizeRef.current = {
                  height: event.nativeEvent.layout.height,
                  width: event.nativeEvent.layout.width,
                };
              }}
              style={[styles.frame, { aspectRatio: safeRatio, width: frameWidth }]}
              testID="photo-crop-frame"
            >
              <Animated.View style={[StyleSheet.absoluteFill, liveStyle]}>
                <CroppedImage crop={draft} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} uri={uri} />
              </Animated.View>
              <View pointerEvents="none" style={styles.verticalGuideOne} />
              <View pointerEvents="none" style={styles.verticalGuideTwo} />
              <View pointerEvents="none" style={styles.horizontalGuideOne} />
              <View pointerEvents="none" style={styles.horizontalGuideTwo} />
            </View>
          </GestureDetector>
          {failed ? <Text accessibilityLiveRegion="polite" selectable style={styles.error}>照片无法加载，请取消后重试。</Text> : null}
        </View>

        <View style={styles.footer}>
          <Text selectable style={styles.hint}>拖动调整位置，双指缩放照片</Text>
          <Pressable
            accessibilityLabel="重置裁剪"
            accessibilityRole="button"
            onPress={() => {
              setFailed(false);
              setDraft({ ...DEFAULT_PHOTO_CROP });
            }}
            style={styles.resetButton}
          >
            <Text selectable style={styles.resetText}>重置</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const guideColor = "rgba(255,255,255,0.38)";
const styles = StyleSheet.create({
  root: { backgroundColor: "#111111", flex: 1, paddingHorizontal: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headerButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 56 },
  secondaryText: { color: "#FFFFFF", fontFamily: bodyFont, fontSize: 15, fontWeight: "600" },
  title: { color: "#FFFFFF", fontFamily: bodyFont, fontSize: 16, fontWeight: "700" },
  doneButton: { alignItems: "center", backgroundColor: "#07C160", borderRadius: 10, justifyContent: "center", minHeight: 38, minWidth: 56, paddingHorizontal: 12 },
  doneText: { color: "#FFFFFF", fontFamily: bodyFont, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  stage: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center" },
  frame: { backgroundColor: "#222222", overflow: "hidden" },
  verticalGuideOne: { backgroundColor: guideColor, bottom: 0, left: "33.333%", position: "absolute", top: 0, width: StyleSheet.hairlineWidth },
  verticalGuideTwo: { backgroundColor: guideColor, bottom: 0, left: "66.666%", position: "absolute", top: 0, width: StyleSheet.hairlineWidth },
  horizontalGuideOne: { backgroundColor: guideColor, height: StyleSheet.hairlineWidth, left: 0, position: "absolute", right: 0, top: "33.333%" },
  horizontalGuideTwo: { backgroundColor: guideColor, height: StyleSheet.hairlineWidth, left: 0, position: "absolute", right: 0, top: "66.666%" },
  error: { color: "#FFB4AB", fontFamily: bodyFont, fontSize: 14, textAlign: "center" },
  footer: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 58 },
  hint: { color: "rgba(255,255,255,0.68)", fontFamily: bodyFont, fontSize: 13 },
  resetButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.45)", borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 16 },
  resetText: { color: "#FFFFFF", fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
});
