import { Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { bodyFont, colors } from "../../components/ui";
import type { PhotoTemplateId } from "../../types/memory";
import { getPhotoTemplatesForCount } from "./photo-templates";

const countLabels = {
  1: "单图",
  2: "双图",
  3: "三图",
} as const;

const percentage = (value: number): DimensionValue => `${Number((value * 100).toFixed(4))}%`;

export type PhotoTemplatePickerProps = {
  photoCount: number;
  selectedTemplateId?: PhotoTemplateId;
  onSelect: (id: PhotoTemplateId) => void;
};

export function PhotoTemplatePicker({ photoCount, selectedTemplateId, onSelect }: PhotoTemplatePickerProps) {
  const templates = getPhotoTemplatesForCount(photoCount);
  const countLabel = countLabels[photoCount as keyof typeof countLabels];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {countLabel
        ? templates.map((template) => {
            const selected = selectedTemplateId === template.id;

            return (
              <Pressable
                accessibilityLabel={`${template.familyLabel}${countLabel}模板`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={template.id}
                onPress={() => onSelect(template.id)}
                style={[styles.option, selected && styles.selectedOption]}
              >
                <View
                  style={styles.preview}
                  testID={`photo-template-preview-${template.id}`}
                >
                  {template.slots.map((slot, index) => (
                    <View
                      key={`${template.id}-slot-${index + 1}`}
                      style={[
                        styles.slot,
                        {
                          height: percentage(slot.height),
                          left: percentage(slot.x),
                          top: percentage(slot.y),
                          transform: [{ rotate: `${slot.rotation}deg` }],
                          width: percentage(slot.width),
                        },
                      ]}
                      testID={`photo-template-slot-${template.id}-${index + 1}`}
                    />
                  ))}
                  {selected ? (
                    <View style={styles.check} testID={`photo-template-check-${template.id}`}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  ) : null}
                </View>
                <Text selectable style={styles.label}>
                  {template.familyLabel} · {countLabel}
                </Text>
              </Pressable>
            );
          })
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10, paddingHorizontal: 2, paddingVertical: 2 },
  option: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    minHeight: 44,
    minWidth: 120,
    padding: 6,
  },
  selectedOption: { borderColor: colors.accent, borderWidth: 2 },
  preview: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    width: 108,
  },
  slot: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.paperEdge,
    borderRadius: 3,
    borderWidth: 1,
    position: "absolute",
  },
  label: { color: colors.ink, fontFamily: bodyFont, fontSize: 12, textAlign: "center" },
  check: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
  },
  checkText: { color: colors.background, fontFamily: bodyFont, fontSize: 14, fontWeight: "700", lineHeight: 18 },
});
