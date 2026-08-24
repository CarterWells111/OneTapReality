import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView, Text } from "react-native";

import { colors } from "../../../components/ui";
import { useLocalLibrary } from "../../../features/auth/local-library-provider";
import { CityCollectionManager } from "../../../features/cities/city-collection-manager";
import { resolveCityRouteParam } from "../../../features/cities/city-route";
import { resolveCityCollection, saveCityCollection, type ResolvedCityCollection } from "../../../storage/city-collection-repository";

export const CITY_COLLECTION_LOAD_ERROR = "暂时无法读取这座城市的旅行册，请稍后重试。";
export const CITY_COLLECTION_SAVE_ERROR = "暂时无法保存城市旅行册，请检查本机空间后重试。";

export default function ManageCityCollectionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isReady: isLibraryReady, owner: accountKey } = useLocalLibrary();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const city = resolveCityRouteParam(rawCity);
  const [loaded, setLoaded] = React.useState<{ accountKey: string; collection: ResolvedCityCollection } | null>(null);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    if (!isLibraryReady) return () => { active = false; };
    const requestedAccountKey = accountKey;
    setError("");
    void resolveCityCollection(db, city, requestedAccountKey)
      .then((nextCollection) => {
        if (active) setLoaded({ accountKey: requestedAccountKey, collection: nextCollection });
      })
      .catch(() => {
        if (active) setError(CITY_COLLECTION_LOAD_ERROR);
      });
    return () => { active = false; };
  }, [accountKey, city, db, isLibraryReady]));

  const collection = loaded?.accountKey === accountKey && loaded.collection.city === city ? loaded.collection : null;

  const save = async (memoryIds: string[], featuredMemoryId: string | null) => {
    setError("");
    setIsSaving(true);
    try {
      const updatedAt = new Date().toISOString();
      if (loaded?.accountKey !== accountKey || loaded.collection.city !== city) {
        setError("本机旅行册已经切换，请重新打开这座城市。");
        return;
      }
      await saveCityCollection(db, city, memoryIds, featuredMemoryId, updatedAt, accountKey);
      router.back();
    } catch {
      setError(CITY_COLLECTION_SAVE_ERROR);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 20 }}>
      <Text selectable style={{ color: colors.ink, fontSize: 24, fontWeight: "800" }}>管理城市旅行册</Text>
      {collection ? (
        <CityCollectionManager
          featuredMemoryId={collection.featuredMemory?.id ?? null}
          memories={collection.memories}
          onCancel={() => router.back()}
          onSave={(memoryIds, featuredMemoryId) => { void save(memoryIds, featuredMemoryId); }}
        />
      ) : <Text selectable style={{ color: colors.muted }}>正在读取本机旅行册…</Text>}
      {isSaving ? <Text selectable style={{ color: colors.muted }}>正在保存城市旅行册…</Text> : null}
      {error ? <Text selectable style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}
