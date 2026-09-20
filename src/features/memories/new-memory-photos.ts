import type { MemoryDraftPagePlan } from "../../types/memory";
import { resolvePhotoTemplate, resolvePhotoTemplateForFamily } from "../canvas/photo-templates";
import { createBalancedPhotoPagePlans } from "./photo-page-planner";

type PhotoAsset = { uri: string; assetId?: string | null };
type PhotoLoadState = "loading" | "loaded" | "failed";
type DraftPhoto = PhotoAsset & { id: number; loadState: PhotoLoadState };
type PhotoState = { photos: DraftPhoto[]; pagePlans: MemoryDraftPagePlan[]; nextId: number };
type PhotoAction =
  | { type: "append"; assets: PhotoAsset[] }
  | { type: "remove"; id: number }
  | { type: "load"; id: number; loadState: PhotoLoadState }
  | { type: "plans"; pagePlans: MemoryDraftPagePlan[] };

export const initialNewMemoryPhotos: PhotoState = { photos: [], pagePlans: [], nextId: 0 };

export function newMemoryPhotosReducer(state: PhotoState, action: PhotoAction): PhotoState {
  if (action.type === "plans") return { ...state, pagePlans: action.pagePlans };
  if (action.type === "load") {
    return { ...state, photos: state.photos.map((photo) => photo.id === action.id ? { ...photo, loadState: action.loadState } : photo) };
  }
  if (action.type === "append") {
    const uris = new Set(state.photos.map((photo) => photo.uri));
    const assetIds = new Set(state.photos.map((photo) => photo.assetId).filter(Boolean));
    let nextId = state.nextId;
    const added: DraftPhoto[] = [];
    for (const asset of action.assets) {
      if (uris.has(asset.uri) || (asset.assetId && assetIds.has(asset.assetId))) continue;
      uris.add(asset.uri);
      if (asset.assetId) assetIds.add(asset.assetId);
      added.push({ uri: asset.uri, assetId: asset.assetId, id: nextId++, loadState: "loading" });
    }
    if (!added.length) return state;
    return {
      photos: [...state.photos, ...added], nextId,
      pagePlans: [...state.pagePlans, ...createBalancedPhotoPagePlans(added.map((photo) => photo.uri))],
    };
  }
  const removed = state.photos.find((photo) => photo.id === action.id);
  if (!removed) return state;
  return {
    ...state,
    photos: state.photos.filter((photo) => photo.id !== action.id),
    pagePlans: state.pagePlans.flatMap((plan) => {
      if (!plan.photoUris.includes(removed.uri)) return [plan];
      const photoUris = plan.photoUris.filter((uri) => uri !== removed.uri);
      if (!photoUris.length) return [];
      const { photoTemplateId, ...rest } = plan;
      const template = resolvePhotoTemplate(photoTemplateId);
      const replacement = template && resolvePhotoTemplateForFamily(template.familyId, photoUris.length);
      return [{ ...rest, photoUris, ...(replacement ? { photoTemplateId: replacement.id } : {}) }];
    }),
  };
}
