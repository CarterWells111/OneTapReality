import { Pressable, Text, View } from "react-native";

import {
  addStoryPage,
  moveStoryPage,
  removeStoryPage,
} from "../features/pages/story-page-manager";
import type { StoryPage } from "../types/memory";
import { colors } from "./ui";

function defaultCreatePageId() {
  return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function RowButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderRadius: 10,
        borderWidth: 1,
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: 10,
        paddingVertical: 6,
      })}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * 可复用的册页管理组件：新增、删除、排序。
 * 只操作传入的 pages 并通过 onChange 回传标准化结果，不接触存储或路由。
 */
export function PageManager({
  pages,
  onChange,
  createPageId = defaultCreatePageId,
}: {
  pages: StoryPage[];
  onChange: (pages: StoryPage[]) => void;
  createPageId?: () => string;
}) {
  return (
    <View style={{ gap: 10 }}>
      {pages.map((page) => (
        <View
          key={page.id}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: 14,
            borderWidth: 1,
            gap: 8,
            padding: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontSize: 15, fontWeight: "600" }}
          >
            {page.position + 1}. {page.headline || "未命名册页"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <RowButton
              label="上移"
              testID={`move-up-${page.id}`}
              onPress={() => onChange(moveStoryPage(pages, page.id, -1))}
            />
            <RowButton
              label="下移"
              testID={`move-down-${page.id}`}
              onPress={() => onChange(moveStoryPage(pages, page.id, 1))}
            />
            <RowButton
              label="删除"
              testID={`remove-${page.id}`}
              onPress={() => onChange(removeStoryPage(pages, page.id))}
            />
          </View>
        </View>
      ))}
      <RowButton
        label="添加册页"
        testID="add-page"
        onPress={() =>
          onChange(
            addStoryPage(pages, {
              id: createPageId(),
              kind: "photo",
              headline: "新的一页",
            })
          )
        }
      />
    </View>
  );
}
