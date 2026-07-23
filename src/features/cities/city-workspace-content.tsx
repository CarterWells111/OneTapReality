import { Pressable, Text, View } from "react-native";

import { MemoryCard } from "../../components/memory-card";
import { colors, Section } from "../../components/ui";
import type { ResolvedCityCollection } from "../../storage/city-collection-repository";
import type { City, Memory } from "../../types/memory";
import { cityContent } from "./city-content";
import { CityMap } from "./city-map";
import { getCityStats } from "./city-stats";
import { getCityWorkspaceLayout } from "./city-workspace";

type CityWorkspaceContentProps = {
  readonly city: City;
  readonly collection: ResolvedCityCollection;
  readonly onCityPress: (city: City) => void;
  readonly onCreate: (city: City) => void;
  readonly onManage: (city: City) => void;
  readonly onMemoryPress: (id: string) => void;
  readonly width: number;
  readonly allMemories?: readonly Memory[];
};

export function CityWorkspaceContent({
  allMemories = [],
  city,
  collection,
  onCityPress,
  onCreate,
  onManage,
  onMemoryPress,
  width,
}: CityWorkspaceContentProps) {
  const layout = getCityWorkspaceLayout(width);
  const item = cityContent[city];
  const mapMemories = allMemories.length > 0 ? allMemories : collection.memories;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 30, fontWeight: "800" }}>{item.name}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 16 }}>{collection.memories.length} saved memories</Text>
      </View>
      <View testID="city-workspace-layout" style={{ flexDirection: layout.direction, gap: 16 }}>
        <View style={{ flex: layout.mapFlex, minWidth: 0 }}>
          <CityMap initialCity={city} interactive onCityPress={onCityPress} stats={getCityStats(mapMemories)} variant="workspace" />
        </View>
        <View style={{ flex: layout.collectionFlex, gap: 14, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text selectable style={{ color: colors.ink, fontSize: 19, fontWeight: "700" }}>City collection</Text>
            <Pressable
              accessibilityLabel={`Manage ${item.name} collection`}
              accessibilityRole="button"
              onPress={() => onManage(city)}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.82 : 1, paddingHorizontal: 10 })}
            >
              <Text selectable style={{ color: colors.accent, fontWeight: "700" }}>Manage</Text>
            </Pressable>
          </View>
          {collection.memories.length === 0 ? (
            <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 14, padding: 18 }}>
              <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>No saved memories in this city yet.</Text>
              <Pressable
                accessibilityLabel={`Create a ${item.name} memory`}
                accessibilityRole="button"
                onPress={() => onCreate(city)}
                style={({ pressed }) => ({ backgroundColor: colors.accent, borderRadius: 14, justifyContent: "center", minHeight: 48, opacity: pressed ? 0.82 : 1, paddingHorizontal: 18 })}
              >
                <Text selectable style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" }}>Create memory</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {collection.featuredMemory ? (
                <Section title="Featured memory">
                  <MemoryCard memory={collection.featuredMemory} onPress={() => onMemoryPress(collection.featuredMemory!.id)} />
                </Section>
              ) : null}
              <Section title="All memories">
                <View style={{ gap: 10 }}>
                  {collection.memories.map((memory) => (
                    <MemoryCard key={memory.id} memory={memory} onPress={() => onMemoryPress(memory.id)} />
                  ))}
                </View>
              </Section>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
