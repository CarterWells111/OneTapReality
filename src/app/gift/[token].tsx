import { useLocalSearchParams } from "expo-router";
import { Platform } from "react-native";

import { GiftEntry } from "../../features/gifts/gift-entry";

export default function GiftRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <GiftEntry token={token ?? "invalid"} platform={Platform.OS === "web" ? "web" : "native"} />;
}
