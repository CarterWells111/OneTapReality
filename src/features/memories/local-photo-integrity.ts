import { isMissingPhotoToken } from "./photo-references";
import type { Memory } from "../../types/memory";

/** Returns true when any local image field is an unrecoverable local-photo token. */
export function hasMissingLocalPhotos(memory: Pick<Memory, "photoUris" | "pages" | "coverImage">): boolean {
  if (memory.coverImage && isMissingPhotoToken(memory.coverImage)) return true;
  if (memory.photoUris.some(isMissingPhotoToken)) return true;
  return memory.pages.some((page) => {
    if ((page.photoUri && isMissingPhotoToken(page.photoUri)) || (page.coverImage && isMissingPhotoToken(page.coverImage))) return true;
    if (page.layout?.coverImage && isMissingPhotoToken(page.layout.coverImage)) return true;
    return page.layout?.elements.some((element) => element.type === "image" && isMissingPhotoToken(element.uri)) ?? false;
  });
}

export const MISSING_LOCAL_PHOTO_ACTION_MESSAGE = "相册中有缺失的本地照片。请重新选择照片后再继续。";
