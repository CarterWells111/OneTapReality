import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";

import { cityRegistry, type City } from "../../types/city";

const palettes = [
  { sky: "#DCE9ED", ridge: "#8FAAB2", foreground: "#4D6D75" },
  { sky: "#F3E5D7", ridge: "#CAA58F", foreground: "#89695B" },
  { sky: "#E6E6F0", ridge: "#A7A4BC", foreground: "#696781" },
  { sky: "#E4EBDD", ridge: "#A4B59C", foreground: "#657E64" },
] as const;

/** A local, city-labelled travel illustration for cities without a dedicated watercolor. */
export function CityVectorArtwork({ city, large = false }: { readonly city: City; readonly large?: boolean }) {
  const index = cityRegistry.findIndex((entry) => entry.id === city);
  const entry = cityRegistry[index];
  const palette = palettes[index % palettes.length];
  const rise = 29 + index % 13;
  const sunX = 77 + index % 24;
  return (
    <View style={styles.frame} testID={`${large ? "city-archive-hero" : "city-card"}-vector-${city}`}>
      <Svg height="100%" viewBox="0 0 118 92" width="100%" accessibilityLabel={`${entry.name}本地城市插画`}>
        <Rect fill={palette.sky} height="92" width="118" />
        <Circle cx={sunX} cy="24" fill="#FFF6DC" opacity="0.86" r="13" />
        <Path d={`M0 65 L22 ${rise + 17} L43 64 L67 ${rise} L94 65 L118 ${rise + 12} V92 H0 Z`} fill={palette.ridge} opacity="0.75" />
        <Path d={`M0 79 L20 68 L36 73 L58 ${57 + index % 10} L82 72 L101 61 L118 73 V92 H0 Z`} fill={palette.foreground} opacity="0.75" />
        <Path d="M9 77 H109" stroke="#FFF8EE" strokeWidth="1.4" opacity="0.7" />
        <SvgText fill="#FFFDF8" fontSize="15" fontWeight="700" textAnchor="middle" x="59" y="83">{entry.name}</SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { borderRadius: 12, flex: 1, overflow: "hidden" } });
