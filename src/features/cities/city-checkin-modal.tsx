import * as React from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../../components/ui";
import { getCityCheckinImage } from "./city-checkin-images";
import { cityContent } from "./city-content";
import type { City } from "../../types/memory";

type CityCheckinModalProps = {
  city: City;
  visible: boolean;
  onClose: () => void;
};

export function CityCheckinModal({ city, visible, onClose }: CityCheckinModalProps) {
  const insets = useSafeAreaInsets();
  const content = cityContent[city];
  const mapImage = getCityCheckinImage(city);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
      visible={visible}
    >
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        {/* 头部 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text selectable style={styles.cityName}>{content.name}</Text>
            <Text selectable style={styles.citySubtitle}>足迹打卡地图</Text>
          </View>
          <Pressable
            accessibilityLabel="关闭打卡地图"
            accessibilityRole="button"
            hitSlop={{ bottom: 12, left: 12, right: 12, top: 12 }}
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Text selectable style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* 城市手绘打卡地图底图 */}
        <View style={styles.mapContainer}>
          <View style={styles.mapFrame}>
            {mapImage ? (
              <Image
                accessibilityLabel={`${content.name}手绘打卡地图`}
                resizeMode="contain"
                source={mapImage}
                style={styles.mapImage}
                testID={`city-checkin-map-${city}`}
              />
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text selectable style={styles.mapPlaceholderText}>这座城市还没有打卡地图</Text>
              </View>
            )}
          </View>
        </View>

        {/* 底部信息 */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Text selectable style={styles.footerQuote}>{content.discoverySlogan}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerLeft: {
    gap: 2,
  },
  cityName: {
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 28,
    fontWeight: "800",
  },
  citySubtitle: {
    color: colors.warmAccent,
    fontFamily: bodyFont,
    fontSize: 13,
    letterSpacing: 2,
  },
  closeBtn: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeBtnText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  mapContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  mapFrame: {
    borderColor: colors.paperEdge,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
  mapImage: {
    height: "100%",
    width: "100%",
  },
  mapPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    flex: 1,
    justifyContent: "center",
  },
  mapPlaceholderText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
  },
  footer: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  footerQuote: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
});
