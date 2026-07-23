import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView, Text } from "react-native";

import { colors } from "../../../components/ui";
import { CityCollectionManager } from "../../../features/cities/city-collection-manager";
import { resolveCityRouteParam } from "../../../features/cities/city-route";
import {
  persistCityCollectionOrder,
  resolveCityCollection,
  setFeaturedCityMemory,
  type ResolvedCityCollection,
} from "../../../storage/city-collection-repository";

export default function ManageCityCollectionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const city = resolveCityRouteParam(rawCity);
  const [collection, setCollection] = React.useState<ResolvedCityCollection | null>(null);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    void resolveCityCollection(db, city).then((nextCollection) => {
      if (active) setCollection(nextCollection);
    });
    return () => { active = false; };
  }, [city, db]));

  const save = async (memoryIds: string[], featuredMemoryId: string | null) => {
    setError("");
    setIsSaving(true);
    try {
      const updatedAt = new Date().toISOString();
      await persistCityCollectionOrder(db, city, memoryIds, updatedAt);
      if (featuredMemoryId) await setFeaturedCityMemory(db, city, featuredMemoryId, updatedAt);
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
