import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors } from "../../components/ui";
import { MIN_TRAVEL_DATE, parseIsoTravelDate, toIsoTravelDate } from "./travel-date";

export type AlbumMetadataValue = {
  title: string;
  travelDate: string | null;
};

type Props = AlbumMetadataValue & {
  contextLabel?: string;
  disabled: boolean;
  onChange: (change: Partial<AlbumMetadataValue>) => void;
};

const TITLE_DOUBLE_PRESS_WINDOW_MS = 350;

export function AlbumMetadataEditor({
  contextLabel,
  disabled,
  onChange,
  title,
  travelDate,
}: Props) {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const disabledRef = React.useRef(disabled);
  const lastTitlePressRef = React.useRef<number | null>(null);
  const onChangeRef = React.useRef(onChange);
  disabledRef.current = disabled;
  onChangeRef.current = onChange;
  const dateLabel = travelDate ?? "未设置旅行日期";
  const contextualDateLabel = contextLabel ? `${contextLabel} · ${dateLabel}` : dateLabel;
  const maximumDate = new Date();
  const parsedPickerDate = parseIsoTravelDate(travelDate ?? "");
  const pickerValue = parsedPickerDate < MIN_TRAVEL_DATE
    ? MIN_TRAVEL_DATE
    : parsedPickerDate > maximumDate
      ? maximumDate
      : parsedPickerDate;

  React.useEffect(() => {
    if (!disabled) return;
    lastTitlePressRef.current = null;
    setIsEditingTitle(false);
    setShowDatePicker(false);
  }, [disabled]);

  const beginTitleEditing = () => {
    if (disabledRef.current) return;
    lastTitlePressRef.current = null;
    setIsEditingTitle(true);
  };

  const handleTitlePress = () => {
    if (disabledRef.current) return;
    const now = Date.now();
    const elapsed = lastTitlePressRef.current === null ? null : now - lastTitlePressRef.current;
    if (elapsed !== null && elapsed >= 0 && elapsed <= TITLE_DOUBLE_PRESS_WINDOW_MS) {
      beginTitleEditing();
      return;
    }
    lastTitlePressRef.current = now;
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowDatePicker(false);
    if (!disabledRef.current && event.type === "set" && selected) {
      onChangeRef.current({ travelDate: toIsoTravelDate(selected) });
    }
  };

  const datePicker = (
    <DateTimePicker
      disabled={disabled}
      maximumDate={maximumDate}
      minimumDate={MIN_TRAVEL_DATE}
      mode="date"
      onChange={handleDateChange}
      value={pickerValue}
    />
  );

  return (
    <View style={styles.metadataHeader} testID="saved-memory-metadata-header">
      {!disabled && isEditingTitle ? (
        <TextInput
          accessibilityLabel="纪念册标题"
          autoFocus
          editable={!disabled}
          onBlur={() => setIsEditingTitle(false)}
          onChangeText={(nextTitle) => {
            if (!disabledRef.current) onChangeRef.current({ title: nextTitle });
          }}
          onSubmitEditing={() => setIsEditingTitle(false)}
          returnKeyType="done"
          style={styles.titleInput}
          value={title}
        />
      ) : (
        <Pressable
          accessibilityActions={[{ name: "activate", label: "修改旅行册名称" }]}
          accessibilityHint="连续点击两次进入编辑"
          accessibilityLabel="双击修改旅行册名称"
          accessibilityRole="button"
          accessibilityValue={{ text: title }}
          disabled={disabled}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "activate") beginTitleEditing();
          }}
          onPress={handleTitlePress}
        >
          <Text selectable style={styles.metadataTitle}>{title}</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityLabel="选择旅行日期"
        accessibilityRole="button"
        accessibilityValue={{ text: contextualDateLabel }}
        disabled={disabled}
        onPress={() => {
          if (!disabledRef.current) setShowDatePicker(true);
        }}
      >
        <Text selectable style={styles.metadataLine}>{contextualDateLabel}</Text>
      </Pressable>
      {!disabled && showDatePicker && Platform.OS === "android" ? datePicker : null}
      {!disabled && showDatePicker && Platform.OS === "ios" ? (
        <Modal animationType="slide" onRequestClose={() => setShowDatePicker(false)} transparent visible>
          <View style={styles.overlay}>
            <View style={styles.dateSheet}>
              <Text selectable style={styles.sheetTitle}>选择旅行日期</Text>
              {React.cloneElement(datePicker, {
                display: "spinner",
                textColor: colors.ink,
                themeVariant: "light",
              })}
              <AppButton label="完成" onPress={() => setShowDatePicker(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metadataHeader: { gap: 6, paddingHorizontal: 20 },
  metadataTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  metadataLine: { color: colors.muted, fontSize: 15 },
  titleInput: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  dateSheet: { backgroundColor: colors.surface, gap: 12, padding: 20 },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
});
