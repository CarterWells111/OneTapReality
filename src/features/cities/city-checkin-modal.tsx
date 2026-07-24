import * as React from "react";
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../../components/ui";
import { headingFontFamily } from "../typography/fonts";
import { cityContent } from "./city-content";
import { getCityCheckinImage } from "./city-checkin-images";
import type { City } from "../../types/memory";

/** 每个打卡城市在地图弹窗上的光点位置（0-1 相对坐标） */
type CheckinSpot = {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly unlocked: boolean;
};

/** 各城市的打卡光点布局 */
const cityCheckinSpots: Record<string, readonly CheckinSpot[]> = {
  beijing: [
    { id: "beijing-gugong", label: "故宫", x: 0.52, y: 0.42, unlocked: true },
    { id: "beijing-changcheng", label: "长城", x: 0.48, y: 0.22, unlocked: true },
    { id: "beijing-tiantan", label: "天坛", x: 0.55, y: 0.48, unlocked: true },
    { id: "beijing-yiheyuan", label: "颐和园", x: 0.42, y: 0.35, unlocked: false },
  ],
  shanghai: [
    { id: "shanghai-waitan", label: "外滩", x: 0.55, y: 0.40, unlocked: true },
    { id: "shanghai-lujiazui", label: "陆家嘴", x: 0.62, y: 0.35, unlocked: true },
    { id: "shanghai-yuyuan", label: "豫园", x: 0.48, y: 0.45, unlocked: true },
    { id: "shanghai-faxing", label: "法兴寺", x: 0.38, y: 0.50, unlocked: false },
  ],
  hangzhou: [
    { id: "hangzhou-xihu", label: "西湖", x: 0.40, y: 0.42, unlocked: true },
    { id: "hangzhou-lingyin", label: "灵隐寺", x: 0.32, y: 0.30, unlocked: true },
    { id: "hangzhou-longjing", label: "龙井村", x: 0.48, y: 0.35, unlocked: true },
    { id: "hangzhou-xixi", label: "西溪湿地", x: 0.25, y: 0.48, unlocked: false },
  ],
  xian: [
    { id: "xian-bingmayong", label: "兵马俑", x: 0.62, y: 0.38, unlocked: true },
    { id: "xian-chengqiang", label: "城墙", x: 0.48, y: 0.44, unlocked: true },
    { id: "xian-dayanta", label: "大雁塔", x: 0.52, y: 0.50, unlocked: true },
    { id: "xian-huashan", label: "华山", x: 0.72, y: 0.28, unlocked: false },
  ],
  chengdu: [
    { id: "chengdu-xiongmao", label: "大熊猫基地", x: 0.55, y: 0.28, unlocked: true },
    { id: "chengdu-jinli", label: "锦里", x: 0.45, y: 0.48, unlocked: true },
    { id: "chengdu-dufu", label: "杜甫草堂", x: 0.38, y: 0.42, unlocked: true },
    { id: "chengdu-qingcheng", label: "青城山", x: 0.30, y: 0.32, unlocked: false },
  ],
  lhasa: [
    { id: "lhasa-potala", label: "布达拉宫", x: 0.50, y: 0.40, unlocked: true },
    { id: "lhasa-jokhang", label: "大昭寺", x: 0.45, y: 0.48, unlocked: true },
    { id: "lhasa-namtso", label: "纳木错", x: 0.35, y: 0.22, unlocked: false },
  ],
  guangzhou: [
    { id: "guangzhou-canton", label: "广州塔", x: 0.52, y: 0.45, unlocked: true },
    { id: "guangzhou-shamian", label: "沙面", x: 0.38, y: 0.48, unlocked: true },
    { id: "guangzhou-baiyun", label: "白云山", x: 0.48, y: 0.28, unlocked: true },
    { id: "guangzhou-chendian", label: "陈家祠", x: 0.42, y: 0.52, unlocked: false },
  ],
  nanjing: [
    { id: "nanjing-zijing", label: "紫金山", x: 0.55, y: 0.32, unlocked: true },
    { id: "nanjing-fuzimiao", label: "夫子庙", x: 0.48, y: 0.48, unlocked: true },
    { id: "nanjing-xuanwu", label: "玄武湖", x: 0.52, y: 0.40, unlocked: true },
    { id: "nanjing-mingxiaoling", label: "明孝陵", x: 0.58, y: 0.35, unlocked: false },
  ],
  kunming: [
    { id: "kunming-dianchi", label: "滇池", x: 0.42, y: 0.50, unlocked: true },
    { id: "kunming-shilin", label: "石林", x: 0.62, y: 0.38, unlocked: true },
    { id: "kunming-cuihu", label: "翠湖", x: 0.48, y: 0.42, unlocked: false },
  ],
  harbin: [
    { id: "harbin-bingxue", label: "冰雪大世界", x: 0.42, y: 0.32, unlocked: true },
    { id: "harbin-sophia", label: "索菲亚教堂", x: 0.50, y: 0.44, unlocked: true },
    { id: "harbin-zhongyang", label: "中央大街", x: 0.48, y: 0.48, unlocked: true },
    { id: "harbin-taiyangsdao", label: "太阳岛", x: 0.52, y: 0.30, unlocked: false },
  ],
};

type CityCheckinModalProps = {
  city: City;
  visible: boolean;
  onClose: () => void;
};

const SPOT_DOT_SIZE = 10;
const SPOT_HIT_SIZE = 40;
const SPOT_PULSE_SIZE = 24;

function SpotDot({ spot, onPress }: { spot: CheckinSpot; onPress: (spot: CheckinSpot) => void }) {
  return (
    <Pressable
      accessibilityLabel={`${spot.label}${spot.unlocked ? "，已打卡" : "，尚未打卡"}`}
      accessibilityRole="button"
      hitSlop={{ bottom: 12, left: 12, right: 12, top: 12 }}
      onPress={() => onPress(spot)}
      style={({ pressed: pr }) => [{
        alignItems: "center",
        height: SPOT_HIT_SIZE,
        justifyContent: "center",
        left: `${spot.x * 100}%`,
        marginLeft: -SPOT_HIT_SIZE / 2,
        marginTop: -SPOT_HIT_SIZE / 2,
        position: "absolute",
        top: `${spot.y * 100}%`,
        width: SPOT_HIT_SIZE,
        zIndex: 10,
      }, pr && { opacity: 0.7 }]}
    >
      {/* 外圈脉冲 */}
      <View style={{
        alignItems: "center",
        backgroundColor: spot.unlocked ? "rgba(181, 107, 82, 0.12)" : "rgba(86, 112, 138, 0.12)",
        borderRadius: SPOT_PULSE_SIZE / 2,
        height: SPOT_PULSE_SIZE,
        justifyContent: "center",
        position: "absolute",
        width: SPOT_PULSE_SIZE,
      }} />
      {/* 实心圆点 */}
      <View style={{
        backgroundColor: spot.unlocked ? colors.warmAccent : colors.muted,
        borderRadius: SPOT_DOT_SIZE / 2,
        height: SPOT_DOT_SIZE,
        width: SPOT_DOT_SIZE,
      }} />
    </Pressable>
  );
}

export function CityCheckinModal({ city, visible, onClose }: CityCheckinModalProps) {
  const insets = useSafeAreaInsets();
  const content = cityContent[city];
  const image = getCityCheckinImage(city);
  const spots = cityCheckinSpots[city] ?? [];

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

        {/* 地图区域 */}
        <View style={styles.mapContainer}>
          <View style={styles.mapFrame}>
            {image ? (
              <Image
                accessibilityLabel={`${content.name}足迹地图`}
                resizeMode="cover"
                source={image}
                style={styles.mapImage}
              />
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text selectable style={styles.placeholderText}>{content.name}</Text>
                <Text selectable style={styles.placeholderSub}>足迹地图加载中…</Text>
              </View>
            )}
            {/* 打卡光点层 */}
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {spots.map((spot) => (
                <SpotDot
                  key={spot.id}
                  onPress={(s) => {
                    // 打卡光点点击反馈：当前为演示交互
                    // 后续可扩展为展示详细打卡日记
                  }}
                  spot={spot}
                />
              ))}
            </View>
          </View>

          {/* 图例 */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.warmAccent }]} />
              <Text selectable style={styles.legendText}>已打卡</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.muted }]} />
              <Text selectable style={styles.legendText}>待探索</Text>
            </View>
          </View>
        </View>

        {/* 底部信息 */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Text selectable style={styles.footerQuote}>{content.discoverySlogan}</Text>
          <View style={styles.footerStats}>
            <Text selectable style={styles.footerStatText}>
              {spots.filter((s) => s.unlocked).length} / {spots.length} 处足迹
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width: screenWidth } = Dimensions.get("window");
const mapPadding = 24;
const mapWidth = screenWidth - mapPadding * 2;
const mapHeight = mapWidth * 0.72;

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
    paddingHorizontal: mapPadding,
  },
  mapFrame: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    height: mapHeight,
    overflow: "hidden",
    width: mapWidth,
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
    gap: 8,
  },
  placeholderText: {
    color: colors.muted,
    fontFamily: serifFont,
    fontSize: 24,
  },
  placeholderSub: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
  },
  legend: {
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    marginTop: 14,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  legendDot: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  legendText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12.5,
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
  footerStats: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  footerStatText: {
    color: colors.warmAccent,
    fontFamily: headingFontFamily,
    fontSize: 13,
    fontWeight: "800",
  },
});
