import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { cityContent } from "../features/cities/city-content";
import { isMissingPhotoToken } from "../features/memories/photo-references";
import { LocalMissingPhotoPlaceholder } from "./local-missing-photo-placeholder";
import type { Memory } from "../types/memory";
import { colors } from "./ui";

export function MemoryCard({ memory, onPress }: { memory: Memory; onPress?: () => void }) {
  const city = cityContent[memory.city];
  const coverUri = memory.photoUris[0];

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "row",
        gap: 14,
        opacity: pressed ? 0.9 : 1,
        overflow: "hidden",
        padding: 12,
      })}
    >
      {coverUri && isMissingPhotoToken(coverUri) ? (
        <LocalMissingPhotoPlaceholder style={{ borderRadius: 12, height: 76, width: 76 }} />
      ) : coverUri ? (
        <Image
          contentFit="cover"
          source={{ uri: coverUri }}
          style={{ backgroundColor: city.color, borderRadius: 12, height: 76, width: 76 }}
        />
      ) : (
        <View style={{ backgroundColor: city.color, borderRadius: 12, height: 76, width: 76 }} />
      )}
      <View style={{ flex: 1, gap: 6, justifyContent: "center" }}>
        <Text numberOfLines={1} selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "700" }}>
          {memory.title}
        </Text>
        <Text selectable style={{ color: colors.muted, fontSize: 14 }}>
          {city.name} · {memory.photoUris.length} 张照片
        </Text>
        <Text selectable style={{ color: colors.muted, fontSize: 13 }}>
          {memory.travelDate}
        </Text>
      </View>
    </Pressable>
  );
}

