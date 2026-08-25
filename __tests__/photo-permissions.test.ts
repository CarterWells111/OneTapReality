import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("minimal iOS photo permissions", () => {
  it("opens the system picker without requesting full photo-library access first", () => {
    const sourceFiles = [
      "src/app/settings/index.tsx",
      "src/app/memory/new.tsx",
      "src/features/canvas/book-canvas-editor.tsx",
    ];

    for (const file of sourceFiles) {
      const source = read(file);
      expect(source).not.toContain("requestMediaLibraryPermissionsAsync");
      expect(source).toContain("launchImageLibraryAsync");
    }
  });

  it("allows only write-only permission requests when an export is saved to Photos", () => {
    const sourceFiles = [
      "src/features/export/share-action-sheet.ts",
      "src/features/export/page-capture-provider.tsx",
    ];

    for (const file of sourceFiles) {
      const source = read(file);
      const requests = [...source.matchAll(/MediaLibrary\.requestPermissionsAsync\(([^)]*)\)/gu)];
      for (const request of requests) {
        expect(request[1].replace(/\s/gu, "")).toBe("true");
      }
      expect(source).not.toContain("requestMediaLibraryPermissionsAsync");
    }
  });

  it("provides English and Simplified Chinese read, save, and NFC usage text", () => {
    const expo = require("../app.json").expo;
    const english = JSON.parse(read("locales/en.json"));
    const chinese = JSON.parse(read("locales/zh-Hans.json"));

    expect(expo.locales).toEqual({
      en: "./locales/en.json",
      "zh-Hans": "./locales/zh-Hans.json",
    });
    for (const locale of [english, chinese]) {
      expect(locale.NSPhotoLibraryUsageDescription).toEqual(expect.any(String));
      expect(locale.NSPhotoLibraryAddUsageDescription).toEqual(expect.any(String));
      expect(locale.NFCReaderUsageDescription).toEqual(expect.any(String));
      expect(locale.NFCReaderUsageDescription).not.toMatch(/write|写/u);
    }
  });

  it("does not declare unused camera or microphone access through the picker plugin", () => {
    const expo = require("../app.json").expo;

    expect(expo.plugins).toContainEqual([
      "expo-image-picker",
      expect.objectContaining({
        cameraPermission: false,
        microphonePermission: false,
      }),
    ]);
  });
});
