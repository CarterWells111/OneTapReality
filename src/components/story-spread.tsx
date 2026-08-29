import { Image } from "expo-image";
import { Text, View } from "react-native";

import { LocalMissingPhotoPlaceholder } from "./local-missing-photo-placeholder";
import { isMissingPhotoToken } from "../features/memories/photo-references";
import type { StoryPage } from "../types/memory";
import { colors } from "./ui";

export function StorySpread({ page }: { page: StoryPage }) {
  const hasPhoto = page.kind !== "closing" && Boolean(page.photoUri);

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 12, overflow: "hidden", padding: 18 }}>
      {hasPhoto && isMissingPhotoToken(page.photoUri!) ? (
        <LocalMissingPhotoPlaceholder style={{ borderRadius: 12, height: page.kind === "cover" ? 240 : 180, width: "100%" }} />
      ) : hasPhoto ? (
        <Image contentFit="cover" source={{ uri: page.photoUri }} style={{ backgroundColor: colors.accentSoft, borderRadius: 12, height: page.kind === "cover" ? 240 : 180, width: "100%" }} testID="story-photo" />
      ) : page.kind !== "closing" ? (
        <View style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 12, height: page.kind === "cover" ? 240 : 180, justifyContent: "center", width: "100%" }}>
          <Text selectable style={{ color: colors.muted, fontWeight: "700" }}>照片待补充</Text>
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        <Text selectable style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{page.position + 1}</Text>
        <Text selectable style={{ color: colors.ink, fontSize: page.kind === "cover" ? 28 : 20, fontWeight: "800" }}>{page.headline}</Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{page.body}</Text>
      </View>
    </View>
  );
}
