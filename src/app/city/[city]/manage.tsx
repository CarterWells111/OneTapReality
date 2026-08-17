import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView, Text } from "react-native";

import { colors } from "../../../components/ui";
import { useAuth } from "../../../features/auth/auth-provider";
import { normalizeLocalAccountKey } from "../../../features/auth/local-account";
import { CityCollectionManager } from "../../../features/cities/city-collection-manager";
import { resolveCityRouteParam } from "../../../features/cities/city-route";
import { resolveCityCollection, saveCityCollection, type ResolvedCityCollection } from "../../../storage/city-collection-repository";

export default function ManageCityCollectionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isAuthReady, user } = useAuth();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const city = resolveCityRouteParam(rawCity);
  const accountKey = user ? normalizeLocalAccountKey(user.email) : null;
  const [loaded, setLoaded] = React.useState<{ accountKey: string; collection: ResolvedCityCollection } | null>(null);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    if (!isAuthReady) return () => { active = false; };
    if (!accountKey) {
      router.replace(`/login?returnTo=${encodeURIComponent(`/city/${city}/manage`)}` as never);
      return () => { active = false; };
    }
    const requestedAccountKey = accountKey;
    void resolveCityCollection(db, city, requestedAccountKey).then((nextCollection) => {
      if (active) setLoaded({ accountKey: requestedAccountKey, collection: nextCollection });
    });
    return () => { active = false; };
  }, [accountKey, city, db, isAuthReady, router]));

  const collection = loaded?.accountKey === accountKey && loaded.collection.city === city ? loaded.collection : null;

  const save = async (memoryIds: string[], featuredMemoryId: string | null) => {
    setError("");
    setIsSaving(true);
    try {
      const updatedAt = new Date().toISOString();
      if (!accountKey || loaded?.accountKey !== accountKey || loaded.collection.city !== city) throw new Error("请先登录");
      await saveCityCollection(db, city, memoryIds, featuredMemoryId, updatedAt, accountKey);
      router.back();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the city collection.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 20 }}>
      <Text selectable style={{ color: colors.ink, fontSize: 24, fontWeight: "800" }}>Manage city collection</Text>
      {collection ? (
        <CityCollectionManager
          featuredMemoryId={collection.featuredMemory?.id ?? null}
          memories={collection.memories}
          onCancel={() => router.back()}
          onSave={(memoryIds, featuredMemoryId) => { void save(memoryIds, featuredMemoryId); }}
        />
      ) : <Text selectable style={{ color: colors.muted }}>Loading local memories…</Text>}
      {isSaving ? <Text selectable style={{ color: colors.muted }}>Saving local collection…</Text> : null}
      {error ? <Text selectable style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}
