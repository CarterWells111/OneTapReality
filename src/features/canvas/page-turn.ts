export const PAGE_TURN_DISTANCE_RATIO = 0.22;
export const PAGE_TURN_VELOCITY = 650;

export type PageTurnDirection = -1 | 0 | 1;

type PageTurnInput = {
  currentIndex: number;
  pageCount: number;
  pageWidth: number;
  translationX: number;
  velocityX: number;
};

type PageTurnDecision = {
  direction: PageTurnDirection;
  targetIndex: number;
  shouldTurn: boolean;
};

export function shouldCanvasPageHandlePan({
  pageHeight,
  pageWidth,
  selectedElement,
  startX,
  startY,
}: {
  pageHeight: number;
  pageWidth: number;
  selectedElement?: { height: number; width: number; x: number; y: number };
  startX: number;
  startY: number;
}) {
  "worklet";
  if (!selectedElement) {
    return true;
  }
  const left = selectedElement.x * pageWidth;
  const right = left + selectedElement.width * pageWidth;
  const top = selectedElement.y * pageHeight;
  const bottom = top + selectedElement.height * pageHeight;
  return startX < left || startX > right || startY < top || startY > bottom;
}

export function resolvePageTurn({
  currentIndex,
  pageCount,
  pageWidth,
  translationX,
  velocityX,
}: PageTurnInput): PageTurnDecision {
  "worklet";
  const crossedDistance = Math.abs(translationX) >= pageWidth * PAGE_TURN_DISTANCE_RATIO;
  const crossedVelocity = Math.abs(velocityX) >= PAGE_TURN_VELOCITY;

  if (!crossedDistance && !crossedVelocity) {
    return { direction: 0, targetIndex: currentIndex, shouldTurn: false };
  }

  const horizontalIntent = crossedDistance ? translationX : velocityX;
  const direction: PageTurnDirection = horizontalIntent < 0 ? 1 : -1;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= pageCount) {
    return { direction: 0, targetIndex: currentIndex, shouldTurn: false };
  }

  return { direction, targetIndex, shouldTurn: true };
}
