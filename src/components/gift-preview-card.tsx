import { Image } from "expo-image";
import { Text, View } from "react-native";

import { colors } from "./ui";

export function GiftPreviewCard({ coverUri, cityName, templateName, recipient, note }: { coverUri?: string; cityName: string; templateName: string; recipient?: string; note?: string }) {
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 14, padding: 14 }}>
    {coverUri ? <Image contentFit="cover" source={{ uri: coverUri }} style={{ borderRadius: 12, height: 104, width: 82 }} testID="gift-cover" /> : <View style={{ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 12, height: 104, justifyContent: "center", width: 82 }}><Text selectable style={{ color: colors.muted, textAlign: "center" }}>封面待选</Text></View>}
    <View style={{ flex: 1, flexShrink: 1, gap: 7, justifyContent: "center" }}>
      <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{cityName} · {templateName}</Text>
      <Text numberOfLines={1} selectable style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>送给：{recipient?.trim() || "待填写"}</Text>
      <Text selectable style={{ color: colors.muted, flexShrink: 1, lineHeight: 20 }}>{note?.trim() || "写一句想对 TA 说的话"}</Text>
    </View>
  </View>;
}
