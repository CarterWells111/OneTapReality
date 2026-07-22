import * as React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

export type GiftMetadata = {
  recipient: string;
  occasion: string;
  date: string;
  note: string;
};

export function GiftMetadataForm({ onSubmit }: { onSubmit: (metadata: GiftMetadata) => void }) {
  const [metadata, setMetadata] = React.useState<GiftMetadata>({ recipient: "", occasion: "", date: "", note: "" });
  const [error, setError] = React.useState("");
  const update = (field: keyof GiftMetadata) => (value: string) => setMetadata((current) => ({ ...current, [field]: value }));
  const submit = () => {
    if (!metadata.recipient.trim() || !metadata.occasion.trim() || !metadata.date.trim()) {
      setError("请填写收礼人、纪念场景和纪念日期。");
      return;
    }
    setError("");
    onSubmit({ ...metadata, recipient: metadata.recipient.trim(), occasion: metadata.occasion.trim(), date: metadata.date.trim(), note: metadata.note.trim() });
  };

  return <View style={{ gap: 10 }}>
    <TextInput accessibilityLabel="收礼人" onChangeText={update("recipient")} placeholder="收礼人" value={metadata.recipient} />
    <TextInput accessibilityLabel="纪念场景" onChangeText={update("occasion")} placeholder="纪念场景" value={metadata.occasion} />
    <TextInput accessibilityLabel="纪念日期" onChangeText={update("date")} placeholder="YYYY-MM-DD" value={metadata.date} />
    <TextInput accessibilityLabel="留言" multiline onChangeText={update("note")} placeholder="想对 TA 说的话（可选）" value={metadata.note} />
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={submit}><Text>保存礼物信息</Text></Pressable>
  </View>;
}
