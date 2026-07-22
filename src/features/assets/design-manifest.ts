import rawManifest from "../../../assets/design/manifest.json";
import type { AssetManifest } from "./asset-manifest";

/**
 * 内置设计资源清单。JSON 在构建期打包，运行时不做任何网络请求。
 * 类型经由 validateAssetManifest 的测试保证与 AssetManifest 一致。
 */
export const designManifest = rawManifest as unknown as AssetManifest;
