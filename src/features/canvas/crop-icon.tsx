import * as React from "react";
import Svg, { Path } from "react-native-svg";

export type CropIconProps = {
  color?: string;
  size?: number;
};

/** Standard crop mark drawn locally so its shape is identical on every platform. */
export function CropIcon({ color = "currentColor", size = 22 }: CropIconProps) {
  return (
    <Svg fill="none" height={size} testID="crop-icon" viewBox="0 0 24 24" width={size}>
      <Path d="M8 2V16H22" stroke={color} strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.8} testID="crop-icon-line-a" />
      <Path d="M2 8H16V22" stroke={color} strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.8} testID="crop-icon-line-b" />
    </Svg>
  );
}
