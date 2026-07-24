import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView } from "react-native";

import { CityWorkspaceContent } from "../../features/cities/city-workspace-content";
import { resolveCityRouteParam } from "../../features/cities/city-route";
import { resolveCityCollection, type ResolvedCityCollection } from "../../storage/city-collection-repository";
import type { City } from "../../types/memory";

function emptyCollection(city: City): ResolvedCityCollection {
  return { city, featuredMemory: null, memories: [] };
}

export default function CityScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const city = resolveCityRouteParam(rawCity);
  const [collection, setCollection] = React.useState<ResolvedCityCollection>(() => emptyCollection(city));

  useFocusEffect(React.useCallback(() => {
    let active = true;
    void resolveCityCollection(db, city).then((nextCollection) => {
      if (active) setCollection(nextCollection);
    });
    return () => { active = false; };
  }, [city, db]));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <CityWorkspaceContent
        city={city}
        collection={collection.city === city ? collection : emptyCollection(city)}
        onCreate={(selectedCity) => router.push({ pathname: "/memory/new", params: { city: selectedCity } })}
        onManage={(selectedCity) => router.push({ pathname: "/city/[city]/manage", params: { city: selectedCity } })}
        onMemoryPress={(id) => router.push({ pathname: "/memory/[id]", params: { id } })}
      />
    </ScrollView>
  );
}
