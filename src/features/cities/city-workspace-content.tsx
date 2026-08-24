import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { MemoryCard } from "../../components/memory-card";
import { colors, PaperCard, Section, serifFont } from "../../components/ui";
import type { ResolvedCityCollection } from "../../storage/city-collection-repository";
import { cityRegistry, type City } from "../../types/city";
import type { Memory } from "../../types/memory";
import { cityContent } from "./city-content";
import { getCityCardVisual } from "./city-illustrations";

type CityWorkspaceContentProps = {
  readonly city: City;
  readonly collection: ResolvedCityCollection;
  readonly onCreate: (city: City) => void;
  readonly onManage: (city: City) => void;
  readonly onMemoryPress: (id: string) => void;
  /** Kept optional for callers from the former map workspace. */
  readonly onCityPress?: (city: City) => void;
  readonly width?: number;
  readonly allMemories?: readonly Memory[];
};

function CityArchiveGenericIllustration({ city }: { readonly city: City }) {
  return (
    <View style={styles.lineArt} testID={`city-archive-hero-generic-${city}`}>
      <Svg height="100%" viewBox="0 0 280 170" width="100%">
        <Circle cx="222" cy="41" fill="none" r="21" stroke={colors.warmAccent} strokeWidth="2" />
        <Path d="M18 126C54 94 78 110 108 79C138 49 165 98 195 71C221 48 242 73 267 42" fill="none" stroke={colors.accent} strokeLinecap="round" strokeWidth="3" />
        <Path d="M20 145H264M48 112V145M90 96V145M132 107V145M174 88V145M216 102V145" fill="none" stroke={colors.muted} strokeLinecap="round" strokeWidth="2" />
        <Path d="M31 65C54 48 79 50 98 65M139 55C156 42 182 42 199 55" fill="none" stroke={colors.ink} strokeLinecap="round" strokeWidth="1.5" />
      </Svg>
    </View>
  );
}

function CityArchiveHero({ city }: { readonly city: City }) {
  const content = cityContent[city];
  const registryEntry = cityRegistry.find((candidate) => candidate.id === city)!;
  const visual = getCityCardVisual(city);

  return (
    <PaperCard style={styles.hero} tone="paper">
      <View style={styles.heroCopy}>
        <Text selectable style={styles.cityName}>{content.name}</Text>
        <Text selectable style={styles.region}>{registryEntry.region}</Text>
        <View style={styles.heroRule} />
        <Text selectable style={styles.slogan}>{content.discoverySlogan}</Text>
      </View>
      {visual.kind === "illustration" ? (
        <Image
          accessibilityLabel={`${content.name}城市插画`}
          resizeMode="cover"
          source={visual.source}
          style={styles.heroIllustration}
          testID={`city-archive-hero-illustration-${city}`}
        />
      ) : (
        <CityArchiveGenericIllustration city={city} />
      )}
    </PaperCard>
  );
}

export function CityWorkspaceContent({ city, collection, onCreate, onManage, onMemoryPress }: CityWorkspaceContentProps) {
  const [showAll, setShowAll] = React.useState(false);
  const content = cityContent[city];
  const memories = collection.memories;
  const visitCount = memories.length;
  const featuredMemory = collection.featuredMemory;
  const remainingMemories = featuredMemory
    ? memories.filter((memory) => memory.id !== featuredMemory.id)
    : memories;
  const isVisited = visitCount > 0;

  return (
    <View style={styles.page} testID="city-archive-page">
      <CityArchiveHero city={city} />

      <PaperCard style={styles.summary}>
        <View style={styles.summaryCount}>
          <Text selectable style={styles.countNumber}>{visitCount}</Text>
          <Text selectable style={styles.countLabel}>册旅行记忆</Text>
        </View>
        {isVisited ? (
          <Text selectable style={styles.summaryText}>每一册，都是留给这座城的回声。</Text>
        ) : (
          <Text selectable style={styles.summaryText}>还在等待你的第一段旅行记忆</Text>
        )}
      </PaperCard>

      {isVisited ? (
        <View style={styles.collection}>
          <View style={styles.collectionHeader}>
            <Text selectable style={styles.collectionTitle}>来自{content.name}的记忆</Text>
            <Pressable
              accessibilityLabel={`管理${content.name}相册`}
              accessibilityRole="button"
              onPress={() => onManage(city)}
              style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
            >
              <Text selectable style={styles.manageText}>管理相册</Text>
            </Pressable>
          </View>

          {featuredMemory ? (
            <Section title="精选相册">
              <MemoryCard memory={featuredMemory} onPress={() => onMemoryPress(featuredMemory.id)} />
            </Section>
          ) : null}

          {remainingMemories.length > 0 ? (
            <View style={styles.allMemories}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAll((current) => !current)}
                style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
              >
                <Text selectable style={styles.expandText}>{showAll ? "收起相册" : "查看全部相册"}</Text>
              </Pressable>
              {showAll ? (
                <View style={styles.memoryList}>
                  {remainingMemories.map((memory) => (
                    <MemoryCard key={memory.id} memory={memory} onPress={() => onMemoryPress(memory.id)} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={isVisited ? `再添一本${content.name}相册` : `开始记录${content.name}`}
        accessibilityRole="button"
        onPress={() => onCreate(city)}
        style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
      >
        <Text selectable style={styles.createText}>{isVisited ? "再添一本相册" : "开始记录这座城"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 20, paddingBottom: 12 },
  hero: { gap: 16, overflow: "hidden", padding: 20 },
  heroCopy: { gap: 6 },
  cityName: { color: colors.ink, fontFamily: serifFont, fontSize: 38, fontWeight: "800", letterSpacing: 2 },
  region: { color: colors.warmAccent, fontSize: 14, fontWeight: "800", letterSpacing: 1.2 },
  heroRule: { backgroundColor: colors.warmAccent, borderRadius: 2, height: 3, marginVertical: 4, width: 38 },
  slogan: { color: colors.muted, fontSize: 15, lineHeight: 24 },
  heroIllustration: { borderColor: colors.paperEdge, borderRadius: 16, borderWidth: 1, height: 188, width: "100%" },
  lineArt: { alignItems: "center", backgroundColor: colors.paper, borderColor: colors.paperEdge, borderRadius: 16, borderWidth: 1, height: 188, justifyContent: "center", overflow: "hidden", width: "100%" },
  summary: { alignItems: "center", flexDirection: "row", gap: 16, paddingVertical: 16 },
  summaryCount: { alignItems: "baseline", borderRightColor: colors.line, borderRightWidth: 1, flexDirection: "row", gap: 4, paddingRight: 16 },
  countNumber: { color: colors.warmAccent, fontFamily: serifFont, fontSize: 31, fontWeight: "800" },
  countLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  summaryText: { color: colors.muted, flex: 1, fontSize: 14, lineHeight: 21 },
  collection: { gap: 16 },
  collectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  collectionTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 21, fontWeight: "800" },
  manageButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  manageText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  allMemories: { gap: 12 },
  expandButton: { alignSelf: "flex-start", minHeight: 42, justifyContent: "center", paddingHorizontal: 2 },
  expandText: { color: colors.warmAccent, fontSize: 15, fontWeight: "800" },
  memoryList: { gap: 10 },
  createButton: { backgroundColor: colors.warmAccent, borderRadius: 18, justifyContent: "center", minHeight: 56, paddingHorizontal: 20 },
  createText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.82 },
});
