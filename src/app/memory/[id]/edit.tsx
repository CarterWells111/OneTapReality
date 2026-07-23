import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors } from "../../../components/ui";
import { canvasStickers } from "../../../features/canvas/canvas-assets";
import { CanvasPage } from "../../../features/canvas/canvas-page";
import { CanvasToolbar } from "../../../features/canvas/canvas-toolbar";
import { MAX_PHOTOS_PER_CANVAS_PAGE } from "../../../features/canvas/auto-layout";
import {
  addCanvasPage,
  addStickerToPage,
  addTextToPage,
  canvasPages,
  changeCanvasElementLayer,
  deleteCanvasElement,
  deleteCanvasPage,
  duplicateCanvasElement,
  moveCanvasPage,
  pageImageUris,
  toggleCanvasPhotoSelection,
  updateCanvasElement,
} from "../../../features/canvas/editor-pages";
import { useMemories } from "../../../features/memories/memories-provider";
import type { Memory, StoryPage } from "../../../types/memory";

function buildCanvasId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EditMemoryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getDraftById, getMemoryById, updatePages } = useMemories();
  const savedMemory = getMemoryById(id);
  const [draftMemory, setDraftMemory] = React.useState<Memory | null>(null);
  const memory = savedMemory ?? draftMemory ?? undefined;
  const [pages, setPages] = React.useState<StoryPage[]>([]);

  React.useEffect(() => {
    if (savedMemory) {
      return;
    }
    let isMounted = true;
    void getDraftById(id)
      .then((nextDraft) => {
        if (isMounted) {
          setDraftMemory(nextDraft);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [getDraftById, id, savedMemory]);
  const [selectedPageId, setSelectedPageId] = React.useState<string>();
  const [selectedElementId, setSelectedElementId] = React.useState<string>();
  const [selectedPhotoUris, setSelectedPhotoUris] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!memory) {
      return;
    }
    const nextPages = canvasPages(memory.pages);
    setPages(nextPages);
    setSelectedPageId(nextPages[0]?.id);
    setSelectedElementId(undefined);
    setSelectedPhotoUris([]);
  }, [memory]);

  if (!memory || pages.length === 0) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.loading}>
        <Text selectable style={styles.muted}>正在读取可编辑的旅行册…</Text>
      </ScrollView>
    );
  }

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];
  const selectedElement = selectedPage.layout?.elements.find((element) => element.id === selectedElementId);
  const selectedText = selectedElement?.type === "text" ? selectedElement : undefined;

  const selectPage = (pageId: string) => {
    setSelectedPageId(pageId);
    setSelectedElementId(undefined);
  };

  const addPage = () => {
    const usedPhotoUris = new Set(pages.flatMap(pageImageUris));
    const nextPhoto = memory.photoUris.find((uri) => !usedPhotoUris.has(uri)) ?? memory.photoUris[0];
    const photoUris = selectedPhotoUris.length > 0 ? selectedPhotoUris : nextPhoto ? [nextPhoto] : [];
    const nextPages = addCanvasPage(pages, photoUris, buildCanvasId("page"));
    setPages(nextPages);
    setSelectedPhotoUris([]);
    selectPage(nextPages.at(-1)!.id);
  };

  const togglePhoto = (uri: string) => {
    if (!selectedPhotoUris.includes(uri) && selectedPhotoUris.length >= MAX_PHOTOS_PER_CANVAS_PAGE) {
      Alert.alert("单页最多 12 张", "请先取消一张已选照片，或把其他照片放到下一页。");
      return;
    }
    setSelectedPhotoUris((current) => toggleCanvasPhotoSelection(current, uri));
  };

  const removePage = () => {
    if (pages.length <= 1) {
      Alert.alert("至少保留一页", "旅行册需要保留至少一页画布。");
      return;
    }
    Alert.alert("删除这一页？", "删除后可在保存前继续调整其他页面。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除", style: "destructive", onPress: () => {
          const nextPages = deleteCanvasPage(pages, selectedPage.id);
          setPages(nextPages);
          selectPage(nextPages[Math.min(selectedPage.position, nextPages.length - 1)].id);
        },
      },
    ]);
  };

  const updateSelectedElement = (elementId: string, patch: Parameters<typeof updateCanvasElement>[3]) => {
    setPages((current) => updateCanvasElement(current, selectedPage.id, elementId, patch));
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await updatePages(memory, canvasPages(pages));
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text selectable style={styles.muted}>
        本页只在设备本地编辑。先选中元素，再用手指拖动、双指缩放或旋转；保存前不会写入旅行册。
      </Text>

      <View style={styles.photoSource}>
        <Text style={styles.fieldLabel}>选择照片（可多选）</Text>
        <ScrollView contentContainerStyle={styles.photoChoices} horizontal showsHorizontalScrollIndicator={false}>
          {memory.photoUris.map((uri, index) => {
            const isSelected = selectedPhotoUris.includes(uri);
            return (
              <Pressable
                accessibilityLabel={`选择第 ${index + 1} 张照片`}
                key={uri}
                onPress={() => togglePhoto(uri)}
                style={[styles.photoChoice, isSelected && styles.photoChoiceSelected]}
                testID={`canvas-photo-choice-${index}`}>
                <Image contentFit="cover" source={uri} style={styles.photoPreview} />
                {isSelected ? <Text style={styles.photoCheck}>已选</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.thumbnailRow} horizontal showsHorizontalScrollIndicator={false}>
        {pages.map((page, index) => (
          <Pressable
            accessibilityLabel={`第 ${index + 1} 页`}
            key={page.id}
            onPress={() => selectPage(page.id)}
            style={[styles.thumbnail, page.id === selectedPage.id && styles.thumbnailActive]}
            testID="canvas-page-thumbnail">
            <Text style={[styles.thumbnailNumber, page.id === selectedPage.id && styles.thumbnailNumberActive]}>{index + 1}</Text>
            <Text numberOfLines={1} style={styles.thumbnailTitle}>{page.headline}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={addPage} style={styles.addThumbnail}>
          <Text style={styles.addThumbnailText}>添加页面</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.pageActions}>
        <AppButton label="上一页" onPress={() => setPages((current) => moveCanvasPage(current, selectedPage.id, "backward"))} tone="secondary" />
        <AppButton label="下一页" onPress={() => setPages((current) => moveCanvasPage(current, selectedPage.id, "forward"))} tone="secondary" />
        <AppButton label="删除页面" onPress={removePage} tone="danger" />
      </View>

      <CanvasPage
        layout={selectedPage.layout!}
        onSelectElement={setSelectedElementId}
        onTransformEnd={updateSelectedElement}
        selectedElementId={selectedElementId}
      />

      {selectedText ? (
        <View style={styles.textEditor}>
          <Text style={styles.fieldLabel}>编辑选中文字</Text>
          <TextInput
            accessibilityLabel="编辑选中文字"
            multiline
            onChangeText={(text) => updateSelectedElement(selectedText.id, { text })}
            style={styles.textInput}
            value={selectedText.text}
          />
        </View>
      ) : null}

      <CanvasToolbar
        onAddSticker={(stickerId = canvasStickers[0].id) => {
          const nextId = buildCanvasId("sticker");
          setPages((current) => addStickerToPage(current, selectedPage.id, nextId, stickerId));
          setSelectedElementId(nextId);
        }}
        onAddText={() => {
          const nextId = buildCanvasId("text");
          setPages((current) => addTextToPage(current, selectedPage.id, nextId));
          setSelectedElementId(nextId);
        }}
        onChangeLayer={(elementId, direction) => setPages((current) => changeCanvasElementLayer(current, selectedPage.id, elementId, direction))}
        onDelete={(elementId) => {
          setPages((current) => deleteCanvasElement(current, selectedPage.id, elementId));
          setSelectedElementId(undefined);
        }}
        onDuplicate={(elementId) => {
          const nextId = buildCanvasId("copy");
          setPages((current) => duplicateCanvasElement(current, selectedPage.id, elementId, nextId));
          setSelectedElementId(nextId);
        }}
        onUpdateElement={updateSelectedElement}
        selectedElement={selectedElement}
      />

      <View style={styles.stickerRow}>
        <Text style={styles.fieldLabel}>选择贴纸</Text>
        <ScrollView contentContainerStyle={styles.stickerChoices} horizontal showsHorizontalScrollIndicator={false}>
          {canvasStickers.map((sticker) => (
            <Pressable
              accessibilityLabel={`添加${sticker.label}`}
              key={sticker.id}
              onPress={() => {
                const nextId = buildCanvasId("sticker");
                setPages((current) => addStickerToPage(current, selectedPage.id, nextId, sticker.id));
                setSelectedElementId(nextId);
              }}
              style={styles.stickerChoice}>
              <Text style={styles.stickerGlyph}>{sticker.glyph}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <AppButton disabled={isSaving} label={isSaving ? "正在保存…" : "保存画布"} onPress={() => void save()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 20 },
  content: { gap: 18, padding: 20 },
  muted: { color: colors.muted, lineHeight: 22 },
  thumbnailRow: { gap: 10, paddingRight: 20 },
  thumbnail: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderWidth: 1, gap: 4, minWidth: 104, padding: 10 },
  thumbnailActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  thumbnailNumber: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  thumbnailNumberActive: { color: colors.accent },
  thumbnailTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  addThumbnail: { alignItems: "center", borderColor: colors.accent, borderRadius: 12, borderStyle: "dashed", borderWidth: 1, justifyContent: "center", minWidth: 104, padding: 10 },
  addThumbnailText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  pageActions: { flexDirection: "row", gap: 8 },
  textEditor: { gap: 8 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  textInput: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.ink, minHeight: 82, padding: 12, textAlignVertical: "top" },
  stickerRow: { gap: 8 },
  stickerChoices: { gap: 8, paddingRight: 20 },
  stickerChoice: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  stickerGlyph: { fontSize: 24 },
  photoSource: { gap: 8 },
  photoChoices: { gap: 10, paddingRight: 20 },
  photoChoice: { borderColor: colors.line, borderRadius: 12, borderWidth: 2, height: 72, overflow: "hidden", width: 72 },
  photoChoiceSelected: { borderColor: colors.accent },
  photoPreview: { height: "100%", width: "100%" },
  photoCheck: { backgroundColor: colors.accent, bottom: 0, color: "#FFFFFF", fontSize: 11, fontWeight: "800", left: 0, paddingHorizontal: 5, paddingVertical: 2, position: "absolute" },
});
