import * as React from "react";
import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { PhotoCropState } from "../../types/memory";
import { resolvePhotoCropGeometry } from "./photo-crop";

type ImageSize = { height: number; width: number };

export type CroppedImageProps = {
  accessibilityLabel?: string;
  crop?: PhotoCropState;
  imageTestID?: string;
  onError?: () => void;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  style?: StyleProp<ViewStyle>;
  testID?: string;
  uri: string;
};

export function CroppedImage({
  accessibilityLabel,
  crop,
  imageTestID,
  onError,
  pointerEvents,
  style,
  testID,
  uri,
}: CroppedImageProps) {
  const [sourceSize, setSourceSize] = React.useState<ImageSize | null>(null);
  const [viewportSize, setViewportSize] = React.useState<ImageSize | null>(null);
  const geometry = sourceSize && viewportSize
    ? resolvePhotoCropGeometry({
        crop,
        sourceHeight: sourceSize.height,
        sourceWidth: sourceSize.width,
        viewportHeight: viewportSize.height,
        viewportWidth: viewportSize.width,
      })
    : null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      onLayout={(event) => setViewportSize({
        height: event.nativeEvent.layout.height,
        width: event.nativeEvent.layout.width,
      })}
      pointerEvents={pointerEvents}
      style={[styles.viewport, style]}
      testID={testID}
    >
      <Image
        contentFit={geometry ? "fill" : "cover"}
        onError={onError}
        onLoad={(event) => setSourceSize({ height: event.source.height, width: event.source.width })}
        source={{ uri }}
        style={geometry ? [styles.content, geometry] : StyleSheet.absoluteFill}
        testID={imageTestID ?? (testID ? `${testID}-content` : undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: "hidden" },
  content: { position: "absolute" },
});
