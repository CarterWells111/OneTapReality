import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { MemoryCard } from "../../components/memory-card";
import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";

export default function MemoriesHomeScreen() {
  const router = useRouter();
  const { memories, isReady } = useMemories();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <View style={{ backgroundColor: colors.accentSoft, borderRadius: 20, gap: 10, padding: 18 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 25, fontWeight: "800" }}>
          OneTapReality｜一触如初
        </Text>
        <Text selectable style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>
          让每一次触碰，都回到故事最初的地方。
        </Text>
        <Text selectable style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>
          选择照片，一触如初会用本地演示草稿帮你开启第一版旅行册。所有内容只留在这台设备。
        </Text>
        <AppButton label="创建纪念册" onPress={() => router.push("/memory/new")} />
      </View>

      <Section title="我的旅行册">
        {!isReady ? (
          <Text selectable style={{ color: colors.muted }}>正在读取本地记忆…</Text>
        ) : memories.length > 0 ? (
          <View style={{ gap: 12 }}>
            {memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onPress={() => router.push({ pathname: "/memory/[id]", params: { id: memory.id } })}
              />
            ))}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 }}>
            <Text selectable style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>
              还没有保存的旅行册
            </Text>
            <Text selectable style={{ color: colors.muted, lineHeight: 21 }}>
              先看看一册杭州示例，或直接用你们的照片开始。
            </Text>
            <AppButton
              label="查看杭州示例"
              tone="secondary"
              onPress={() => router.push({ pathname: "/memory/[id]", params: { id: sampleMemory.id } })}
            />
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

