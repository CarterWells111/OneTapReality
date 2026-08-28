import * as React from "react";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PhotoCropState } from "../../types/memory";
import { bodyFont } from "../../components/ui";
import {
  DEFAULT_PHOTO_CROP,
  normalizePhotoCropState,
  panPhotoCrop,
} from "./photo-crop";

type FrameSize = { height: number; width: number };

export type PhotoCropModalProps = {
  aspectRatio: number;
  crop?: PhotoCropState;
  onCancel: () => void;
  onConfirm: (crop: PhotoCropState) => void;
  uri: string;
};

const clamp = (value: number, minimum: number, maximum: number) => {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
};

export function PhotoCropModal({ aspectRatio, crop, onCancel, onConfirm, uri }: PhotoCropModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const initialCrop = normalizePhotoCropState(crop);
  const [draft, setDraft] = React.useState(initialCrop);
  const [frameSize, setFrameSize] = React.useState<FrameSize>({ height: 0, width: 0 });
  const [sourceSize, setSourceSize] = React.useState<FrameSize | null>(null);
  const [failed, setFailed] = React.useState(false);
  const focusX = useSharedValue(draft.focusX);
  const focusY = useSharedValue(draft.focusY);
  const zoom = useSharedValue(draft.zoom);
  const panStartFocusX = useSharedValue(draft.focusX);
  const panStartFocusY = useSharedValue(draft.focusY);
  const pinchStartZoom = useSharedValue(draft.zoom);
  const frameHeight = useSharedValue(frameSize.height);
  const frameWidth = useSharedValue(frameSize.width);
  const sourceHeight = useSharedValue(sourceSize?.height ?? 0);
  const sourceWidth = useSharedValue(sourceSize?.width ?? 0);

  const commitGestureSnapshot = React.useCallback((nextFocusX: number, nextFocusY: number, nextZoom: number) => {
    setDraft(normalizePhotoCropState({ focusX: nextFocusX, focusY: nextFocusY, zoom: nextZoom }));
  }, []);

  const pan = Gesture.Pan()
    .withTestId("photo-crop-pan")
    .onStart(() => {
      panStartFocusX.value = focusX.value;
      panStartFocusY.value = focusY.value;
    })
    .onUpdate((event) => {
      if (sourceWidth.value <= 0 || sourceHeight.value <= 0 || frameWidth.value <= 0 || frameHeight.value <= 0) return;
      const next = panPhotoCrop({
        focusX: panStartFocusX.value,
        focusY: panStartFocusY.value,
        zoom: zoom.value,
      }, {
        sourceHeight: sourceHeight.value,
        sourceWidth: sourceWidth.value,
        translationX: event.translationX,
        translationY: event.translationY,
        viewportHeight: frameHeight.value,
        viewportWidth: frameWidth.value,
      });
      focusX.value = next.focusX;
      focusY.value = next.focusY;
    })
    .onFinalize(() => runOnJS(commitGestureSnapshot)(focusX.value, focusY.value, zoom.value));
  const pinch = Gesture.Pinch()
    .withTestId("photo-crop-pinch")
    .onStart(() => {
      pinchStartZoom.value = zoom.value;
    })
    .onUpdate((event) => {
      zoom.value = clamp(pinchStartZoom.value * event.scale, 1, 4);
    })
    .onEnd((event) => runOnJS(commitGestureSnapshot)(
      focusX.value,
      focusY.value,
      clamp(pinchStartZoom.value * event.scale, 1, 4),
    ));
  const imageLayerStyle = useAnimatedStyle(() => {
    if (!sourceSize || frameSize.width <= 0 || frameSize.height <= 0) {
      return { height: frameSize.height, left: 0, top: 0, width: frameSize.width };
    }
    const baseScale = Math.max(
      frameSize.width / sourceSize.width,
      frameSize.height / sourceSize.height,
    );
    const width = sourceSize.width * baseScale * zoom.value;
    const height = sourceSize.height * baseScale * zoom.value;
    return {
      height,
      left: clamp((frameSize.width / 2) - (focusX.value * width), frameSize.width - width, 0),
      top: clamp((frameSize.height / 2) - (focusY.value * height), frameSize.height - height, 0),
      width,
    };
  }, [frameSize.height, frameSize.width, sourceSize?.height, sourceSize?.width]);

  const horizontalPadding = 28;
  const maxWidth = Math.max(1, windowWidth - (horizontalPadding * 2));
  const maxHeight = Math.max(1, windowHeight - insets.top - insets.bottom - 190);
  const displayFrameWidth = Math.min(maxWidth, maxHeight * safeRatio);

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
            onPress={() => onConfirm(normalizePhotoCropState({
              focusX: focusX.value,
              focusY: focusY.value,
              zoom: zoom.value,
            }))}
            style={[styles.doneButton, failed && styles.disabled]}
          >
            <Text selectable style={styles.doneText}>完成</Text>
          </Pressable>
        </View>

        <View style={styles.stage}>
          <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
            <View
              onLayout={(event) => {
                const nextFrameSize = {
                  height: event.nativeEvent.layout.height,
                  width: event.nativeEvent.layout.width,
                };
                frameHeight.value = nextFrameSize.height;
                frameWidth.value = nextFrameSize.width;
                setFrameSize(nextFrameSize);
              }}
              style={[styles.frame, { aspectRatio: safeRatio, width: displayFrameWidth }]}
              testID="photo-crop-frame"
            >
              <Animated.View pointerEvents="none" style={[styles.imageLayer, imageLayerStyle]} testID="photo-crop-image-layer">
                <Image
                  contentFit={sourceSize ? "fill" : "cover"}
                  onError={() => setFailed(true)}
                  onLoad={(event) => {
                    const nextSourceSize = { height: event.source.height, width: event.source.width };
                    sourceHeight.value = nextSourceSize.height;
                    sourceWidth.value = nextSourceSize.width;
                    setSourceSize(nextSourceSize);
                  }}
                  source={{ uri }}
                  style={StyleSheet.absoluteFill}
                  testID="photo-crop-image"
                />
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
              focusX.value = DEFAULT_PHOTO_CROP.focusX;
              focusY.value = DEFAULT_PHOTO_CROP.focusY;
              zoom.value = DEFAULT_PHOTO_CROP.zoom;
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
  imageLayer: { position: "absolute" },
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
