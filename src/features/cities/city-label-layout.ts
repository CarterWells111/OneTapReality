import { chinaMapViewBox } from "./china-map-data";

export type CityLabelViewport = {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
};

export type CityLabelLayoutSize = {
  readonly height: number;
  readonly width: number;
};

export type CityLabelLayoutInput = {
  readonly adcode: string;
  readonly coordinate: Readonly<{ x: number; y: number }>;
  readonly displayName: string;
  readonly isCapital: boolean;
  readonly productCity?: string;
};

export type CityLabelFrame = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type CityLabelLayout = {
  readonly adcode: string;
  readonly fontSize: number;
  readonly fontWeight: "400" | "600" | "700";
  readonly frame: CityLabelFrame;
  readonly opacity: number;
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
};

const LABEL_WINDOW_WIDTH_RATIO = 0.72;
const LABEL_WINDOW_HEIGHT_RATIO = 0.64;
const LABEL_FADE_RATIO = 0.04;
const LABEL_ZOOM_START = 1.6;
const LABEL_ZOOM_STEP = 0.1;
const LABEL_ZOOM_HYSTERESIS = 0.025;
const LABEL_MAX_NON_CAPITALS = 24;
const LABEL_COLLISION_GAP = 4;

const [, , mapWidth, mapHeight] = chinaMapViewBox.split(/\s+/).map(Number);

export function resolveCityLabelWindow(size: CityLabelLayoutSize) {
  "worklet";
  const width = size.width * LABEL_WINDOW_WIDTH_RATIO;
  const height = size.height * LABEL_WINDOW_HEIGHT_RATIO;
  return {
    fadeX: size.width * LABEL_FADE_RATIO,
    fadeY: size.height * LABEL_FADE_RATIO,
    height,
    width,
    x: (size.width - width) / 2,
    y: (size.height - height) / 2,
  };
}

export function getNonCapitalLabelLimit(scale: number) {
  "worklet";
  if (scale < LABEL_ZOOM_START) return 0;
  const step = Math.floor((scale - LABEL_ZOOM_START + Number.EPSILON) / LABEL_ZOOM_STEP);
  return Math.min(LABEL_MAX_NON_CAPITALS, 2 + Math.max(0, step));
}

function rawZoomTier(scale: number) {
  "worklet";
  if (scale < LABEL_ZOOM_START) return -1;
  return Math.max(0, Math.floor((scale - LABEL_ZOOM_START + Number.EPSILON) / LABEL_ZOOM_STEP));
}

export function resolveLabelZoomTier(scale: number, previousTier?: number) {
  "worklet";
  const nextTier = rawZoomTier(scale);
  if (previousTier === undefined || previousTier === nextTier) return nextTier;
  if (nextTier > previousTier) {
    const nextBoundary = LABEL_ZOOM_START + Math.max(0, previousTier + 1) * LABEL_ZOOM_STEP;
    return scale >= nextBoundary + LABEL_ZOOM_HYSTERESIS ? nextTier : previousTier;
  }
  const previousBoundary = LABEL_ZOOM_START + Math.max(0, previousTier) * LABEL_ZOOM_STEP;
  return scale <= previousBoundary - LABEL_ZOOM_HYSTERESIS ? nextTier : previousTier;
}

function nonCapitalLimitForTier(tier: number) {
  "worklet";
  return tier < 0 ? 0 : Math.min(LABEL_MAX_NON_CAPITALS, 2 + tier);
}

export function resolveCityMapContentFrame(size: CityLabelLayoutSize) {
  "worklet";
  const scale = Math.min(size.width / mapWidth, size.height / mapHeight);
  const width = mapWidth * scale;
  const height = mapHeight * scale;
  return {
    height,
    scale,
    width,
    x: (size.width - width) / 2,
    y: (size.height - height) / 2,
  };
}

export function resolveNormalizedMapScreenPoint(
  coordinate: Readonly<{ x: number; y: number }>,
  viewport: CityLabelViewport,
  size: CityLabelLayoutSize,
) {
  "worklet";
  const content = resolveCityMapContentFrame(size);
  const baseX = content.x + coordinate.x * content.width;
  const baseY = content.y + coordinate.y * content.height;
  return {
    x: size.width / 2 + (baseX - size.width / 2) * viewport.scale + viewport.translateX,
    y: size.height / 2 + (baseY - size.height / 2) * viewport.scale + viewport.translateY,
  };
}

export function resolveCityLabelEdgeOpacity(x: number, y: number, size: CityLabelLayoutSize) {
  "worklet";
  const window = resolveCityLabelWindow(size);
  const right = window.x + window.width;
  const bottom = window.y + window.height;
  if (x < window.x || x > right || y < window.y || y > bottom) return 0;
  const horizontalOpacity = Math.min(1, Math.min(x - window.x, right - x) / window.fadeX);
  const verticalOpacity = Math.min(1, Math.min(y - window.y, bottom - y) / window.fadeY);
  return Math.max(0, Math.min(horizontalOpacity, verticalOpacity));
}

function labelTypography(label: CityLabelLayoutInput) {
  "worklet";
  if (label.isCapital) return { fontSize: 13, fontWeight: "700" as const };
  if (label.productCity) return { fontSize: 12, fontWeight: "600" as const };
  return { fontSize: 11, fontWeight: "400" as const };
}

function resolveLabelFrame(label: CityLabelLayoutInput, x: number, y: number) {
  "worklet";
  const typography = labelTypography(label);
  const width = Math.max(28, label.displayName.length * typography.fontSize + 10);
  const height = typography.fontSize + 8;
  return {
    height,
    width,
    x: x - width / 2,
    y: y - height / 2,
  };
}

export function labelFramesOverlap(left: CityLabelFrame, right: CityLabelFrame) {
  "worklet";
  return !(
    left.x + left.width + LABEL_COLLISION_GAP <= right.x
    || right.x + right.width + LABEL_COLLISION_GAP <= left.x
    || left.y + left.height + LABEL_COLLISION_GAP <= right.y
    || right.y + right.height + LABEL_COLLISION_GAP <= left.y
  );
}

function priority(label: CityLabelLayoutInput) {
  "worklet";
  if (label.isCapital) return 0;
  return label.productCity ? 1 : 2;
}

type Candidate = {
  readonly distance: number;
  readonly index: number;
  readonly priority: number;
};

export function resolveCityLabelLayouts(
  labels: readonly CityLabelLayoutInput[],
  viewport: CityLabelViewport,
  size: CityLabelLayoutSize,
  zoomTier = resolveLabelZoomTier(viewport.scale),
): readonly CityLabelLayout[] {
  "worklet";
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const working = labels.map((label) => {
    const point = resolveNormalizedMapScreenPoint(label.coordinate, viewport, size);
    const typography = labelTypography(label);
    const edgeOpacity = resolveCityLabelEdgeOpacity(point.x, point.y, size);
    return {
      adcode: label.adcode,
      edgeOpacity,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      frame: resolveLabelFrame(label, point.x, point.y),
      isCapital: label.isCapital,
      x: point.x,
      y: point.y,
    };
  });
  const candidates: Candidate[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const item = working[index];
    if (item.edgeOpacity <= 0) continue;
    const label = labels[index];
    if (!label.isCapital && zoomTier < 0) continue;
    const dx = item.x - centerX;
    const dy = item.y - centerY;
    candidates.push({ distance: dx * dx + dy * dy, index, priority: priority(label) });
  }
  candidates.sort((left, right) => (
    left.priority - right.priority
    || left.distance - right.distance
    || (labels[left.index].adcode < labels[right.index].adcode ? -1 : 1)
  ));

  const selectedIndexes: number[] = [];
  let nonCapitalCount = 0;
  const nonCapitalLimit = nonCapitalLimitForTier(zoomTier);
  for (const candidate of candidates) {
    const item = working[candidate.index];
    if (!item.isCapital && nonCapitalCount >= nonCapitalLimit) continue;
    let collides = false;
    for (const selectedIndex of selectedIndexes) {
      if (labelFramesOverlap(item.frame, working[selectedIndex].frame)) {
        collides = true;
        break;
      }
    }
    if (collides) continue;
    selectedIndexes.push(candidate.index);
    if (!item.isCapital) nonCapitalCount += 1;
  }

  return working.map((item, index) => {
    const visible = selectedIndexes.includes(index);
    return {
      adcode: item.adcode,
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
      frame: item.frame,
      opacity: visible ? item.edgeOpacity : 0,
      visible,
      x: item.x,
      y: item.y,
    };
  });
}

export function resolveVisibleCityLabels<TLabel extends CityLabelLayoutInput>(
  labels: readonly TLabel[],
  viewport: CityLabelViewport,
  size: CityLabelLayoutSize,
  zoomTier = resolveLabelZoomTier(viewport.scale),
): TLabel[] {
  const visibleAdcodes = new Set(resolveCityLabelLayouts(labels, viewport, size, zoomTier)
    .filter(({ visible }) => visible)
    .map(({ adcode }) => adcode));
  return labels.filter(({ adcode }) => visibleAdcodes.has(adcode));
}
