import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const GIFT_MAX_EDGE = 2560;
export const GIFT_JPEG_QUALITY = 0.82;

export type GiftImageDerivative = {
  uri: string;
  contentType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
};

export async function createGiftImageDerivative(
  sourceUri: string,
  sourceContentType: string,
): Promise<GiftImageDerivative> {
  try {
    const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
    if (!(original.width > 0) || !(original.height > 0)) {
      throw new Error("invalid source dimensions");
    }

    let output = original;
    if (Math.max(original.width, original.height) > GIFT_MAX_EDGE) {
      const context = ImageManipulator.manipulate(original);
      context.resize(original.width >= original.height
        ? { width: GIFT_MAX_EDGE, height: null }
        : { width: null, height: GIFT_MAX_EDGE });
      output = await context.renderAsync();
    }

    const isPng = sourceContentType.toLowerCase() === "image/png";
    const saved = await output.saveAsync({
      compress: isPng ? 1 : GIFT_JPEG_QUALITY,
      format: isPng ? SaveFormat.PNG : SaveFormat.JPEG,
    });
    const info = await FileSystem.getInfoAsync(saved.uri);
    if (!info.exists || typeof info.size !== "number" || info.size <= 0) {
      throw new Error("invalid derivative file");
    }

    return {
      uri: saved.uri,
      contentType: isPng ? "image/png" : "image/jpeg",
      byteSize: info.size,
      width: saved.width,
      height: saved.height,
    };
  } catch (error) {
    throw new Error("无法生成礼品发布所需的临时图片，请重新选择照片后再试。", { cause: error });
  }
}

export async function removeGiftImageDerivatives(
  derivatives: readonly GiftImageDerivative[],
): Promise<void> {
  for (const uri of new Set(derivatives.map((item) => item.uri))) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch((error) => {
      console.warn("[gift-publish] 无法清理临时图片：", error);
    });
  }
}
