import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";

import { movePhotoUri, removePhotoUri } from "../features/photos/photo-order";
import { isMissingPhotoToken } from "../features/memories/photo-references";
import { LocalMissingPhotoPlaceholder } from "./local-missing-photo-placeholder";
import { colors } from "./ui";

export function PhotoStrip({ photoUris, onChange }: { photoUris: string[]; onChange: (photoUris: string[]) => void }) {
  if (photoUris.length === 0) {
    return <Text selectable style={{ color: colors.muted }}>尚未选择照片</Text>;
  }

  return (
    <ScrollView horizontal contentContainerStyle={{ gap: 10 }} showsHorizontalScrollIndicator={false}>
      {photoUris.map((uri, index) => (
        <View key={`${uri}-${index}`} style={{ gap: 6, width: 96 }}>
          {isMissingPhotoToken(uri)
            ? <LocalMissingPhotoPlaceholder style={{ borderRadius: 12, height: 96, width: 96 }} />
            : <Image contentFit="cover" source={{ uri }} style={{ backgroundColor: colors.accentSoft, borderRadius: 12, height: 96, width: 96 }} />}
          <Text selectable style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>{index + 1} / {photoUris.length}</Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable accessibilityLabel={`前移照片 ${index + 1}`} disabled={index === 0} onPress={() => onChange(movePhotoUri(photoUris, index, -1))} style={{ flex: 1, opacity: index === 0 ? 0.35 : 1 }}>
              <Text selectable style={{ color: colors.accent, textAlign: "center" }}>前移</Text>
            </Pressable>
            <Pressable accessibilityLabel={`后移照片 ${index + 1}`} disabled={index === photoUris.length - 1} onPress={() => onChange(movePhotoUri(photoUris, index, 1))} style={{ flex: 1, opacity: index === photoUris.length - 1 ? 0.35 : 1 }}>
              <Text selectable style={{ color: colors.accent, textAlign: "center" }}>后移</Text>
            </Pressable>
          </View>
          <Pressable accessibilityLabel={`删除照片 ${index + 1}`} onPress={() => onChange(removePhotoUri(photoUris, index))}>
            <Text selectable style={{ color: colors.danger, textAlign: "center" }}>删除</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
