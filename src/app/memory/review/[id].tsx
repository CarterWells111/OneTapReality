import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import { IconButton } from "../../../components/icon-button";
import { AppButton, colors } from "../../../components/ui";
import { cityContent } from "../../../features/cities/city-content";
import { useMemories } from "../../../features/memories/memories-provider";
import type { Memory } from "../../../types/memory";

type Action = "save" | "retry" | "discard" | null;

export default function DraftReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { discardDraft, getDraftById, retryDraft, saveDraft } = useMemories();
  const [draft, setDraft] = React.useState<Memory | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [action, setAction] = React.useState<Action>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let isMounted = true;
    void getDraftById(id)
      .then((nextDraft) => {
        if (isMounted) {
          setDraft(nextDraft);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("无法读取草稿，请重试。");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [getDraftById, id]);

  const keepDraft = async () => {
    setAction("save");
    setError("");
    try {
      await saveDraft(id);
      router.replace("/");
    } catch {
      setError("暂时无法保留草稿，请重试。");
    } finally {
      setAction(null);
    }
  };

  const regenerate = async () => {
    setAction("retry");
    setError("");
    try {
      setDraft(await retryDraft(id));
    } catch {
      setError("暂时无法重新生成草稿，请重试。");
    } finally {
      setAction(null);
    }
  };

  const confirmDiscard = () => {
    Alert.alert("丢弃草稿", "丢弃后不会保存为旅行记忆。", [
      { text: "取消", style: "cancel" },
      {
        text: "丢弃",
        style: "destructive",
        onPress: () => {
          void discard();
        },
      },
    ]);
  };

  const discard = async () => {
    setAction("discard");
    setError("");
    try {
      await discardDraft(id);
      router.replace("/");
    } catch {
      setError("暂时无法丢弃草稿，请重试。");
    } finally {
      setAction(null);
    }
  };

  const openEditor = () => {
    router.push({ pathname: "/memory/[id]/edit", params: { id } });
  };

  const isActing = action !== null;
  const headerRight = draft
    ? () => (
        <View style={{ flexDirection: "row", gap: 2 }}>
          <IconButton
            accessibilityLabel="重新生成草稿"
            disabled={isActing}
            icon="refresh"
            onPress={() => void regenerate()}
          />
          <IconButton
            accessibilityLabel="编辑这册草稿"
            disabled={isActing}
            icon="edit"
            onPress={openEditor}
          />
          <IconButton
            accessibilityLabel="丢弃草稿"
            disabled={isActing}
            icon="trash"
            onPress={confirmDiscard}
            tone="danger"
          />
        </View>
      )
    : undefined;

  if (isLoading) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20 }}>
        <Text selectable style={{ color: colors.muted }}>正在读取草稿…</Text>
      </ScrollView>
    );
  }

  if (!draft) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 16, padding: 20 }}>
        <Text selectable style={{ color: colors.muted }}>这个草稿已不存在或已被处理。</Text>
        <AppButton label="返回记忆" onPress={() => router.replace("/")} />
      </ScrollView>
    );
  }

  const city = cityContent[draft.city];

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 20 }}>
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          这是仅保存在本机的演示草稿。右上角可重新生成、编辑或丢弃；确认后才会加入你的旅行记忆。
        </Text>
        <View style={{ backgroundColor: city.color, borderRadius: 22, gap: 8, padding: 22 }}>
          <Text selectable style={{ color: colors.ink, fontSize: 28, fontWeight: "800" }}>{draft.title}</Text>
          <Text selectable style={{ color: colors.muted }}>{city.name} · {draft.travelDate}</Text>
          <Text selectable style={{ color: colors.muted }}>{draft.photoUris.length} 张本地照片 · {draft.pages.length} 页草稿</Text>
        </View>
        {draft.pages.map((page) => (
          <View key={page.id} style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 8, padding: 18 }}>
            <Text selectable style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{page.position + 1} / {draft.pages.length}</Text>
            <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>{page.headline}</Text>
            <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{page.body}</Text>
          </View>
        ))}
        {error ? <Text selectable style={{ color: colors.danger, lineHeight: 21 }}>{error}</Text> : null}
        <AppButton label={action === "save" ? "正在保留…" : "保留草稿"} disabled={isActing} onPress={() => void keepDraft()} />
      </ScrollView>
    </>
  );
}
