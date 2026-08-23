import {
  resolveCanvasPageWidth,
  resolveCanvasPreviewContentScale,
} from '../src/features/canvas/canvas-display-metrics';

describe('canvas display metrics', () => {
  test('clamps the page width to the canonical preview bounds', () => {
    expect(resolveCanvasPageWidth(250)).toBe(280);
    expect(resolveCanvasPageWidth(390)).toBe(350);
    expect(resolveCanvasPageWidth(500)).toBe(360);
  });

  test('scales preview content from display width to canonical page width', () => {
    expect(resolveCanvasPreviewContentScale(175, 390)).toBe(0.5);
  });

  test('uses scale one when display width is not finite or positive', () => {
    expect(resolveCanvasPreviewContentScale(0, 390)).toBe(1);
    expect(resolveCanvasPreviewContentScale(-1, 390)).toBe(1);
    expect(resolveCanvasPreviewContentScale(Number.NaN, 390)).toBe(1);
    expect(resolveCanvasPreviewContentScale(Number.POSITIVE_INFINITY, 390)).toBe(1);
  });
});
