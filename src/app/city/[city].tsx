import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { ScrollView } from "react-native";

import { CityWorkspaceContent } from "../../features/cities/city-workspace-content";
import { useAuth } from "../../features/auth/auth-provider";
import { normalizeLocalAccountKey } from "../../features/auth/local-account";
import { resolveCityRouteParam } from "../../features/cities/city-route";
import { resolveCityCollection, type ResolvedCityCollection } from "../../storage/city-collection-repository";
import type { City } from "../../types/memory";

function emptyCollection(city: City): ResolvedCityCollection {
  return { city, featuredMemory: null, memories: [] };
}

export default function CityScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isAuthReady, user } = useAuth();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const city = resolveCityRouteParam(rawCity);
  const accountKey = user ? normalizeLocalAccountKey(user.email) : null;
  const [loaded, setLoaded] = React.useState<{ accountKey: string; collection: ResolvedCityCollection } | null>(null);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    if (!isAuthReady) return () => { active = false; };
    if (!accountKey) {
      router.replace(`/login?returnTo=${encodeURIComponent(`/city/${city}`)}` as never);
      return () => { active = false; };
    }
    const requestedAccountKey = accountKey;
    void resolveCityCollection(db, city, requestedAccountKey).then((nextCollection) => {
      // 仅当回调仍有效且城市未切换时应用，避免快速切换城市时旧结果覆盖新集合
      if (active && nextCollection.city === city) setLoaded({ accountKey: requestedAccountKey, collection: nextCollection });
    });
    return () => { active = false; };
  }, [accountKey, city, db, isAuthReady, router]));

  const collection = loaded?.accountKey === accountKey && loaded.collection.city === city
    ? loaded.collection
    : emptyCollection(city);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <CityWorkspaceContent
        city={city}
        collection={collection}
        onCreate={(selectedCity) => router.push({ pathname: "/memory/new", params: { city: selectedCity } })}
        onManage={(selectedCity) => router.push({ pathname: "/city/[city]/manage", params: { city: selectedCity } })}
        onMemoryPress={(id) => router.push({ pathname: "/memory/[id]", params: { id } })}
      />
    </ScrollView>
  );
}
