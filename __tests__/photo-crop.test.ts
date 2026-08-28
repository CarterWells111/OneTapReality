import {
  panPhotoCrop,
  normalizePhotoCropState,
  resolvePhotoCropGeometry,
  zoomPhotoCrop,
} from "../src/features/canvas/photo-crop";

describe("photo crop geometry", () => {
  it("defaults invalid crop data to a centered one-times crop", () => {
    expect(normalizePhotoCropState(undefined)).toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 });
    expect(normalizePhotoCropState({ focusX: Number.NaN, focusY: "left", zoom: 9 })).toEqual({
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1,
    });
  });

  it("clamps finite crop values to the supported focus and zoom ranges", () => {
    expect(normalizePhotoCropState({ focusX: -0.2, focusY: 1.4, zoom: 7 })).toEqual({
      focusX: 0,
      focusY: 1,
      zoom: 4,
    });
  });

  it("uses cover geometry and keeps the selected focus inside the viewport", () => {
    expect(resolvePhotoCropGeometry({
      crop: { focusX: 1, focusY: 0.5, zoom: 1 },
      sourceHeight: 200,
      sourceWidth: 400,
      viewportHeight: 100,
      viewportWidth: 100,
    })).toEqual({ height: 100, left: -100, top: 0, width: 200 });

    expect(resolvePhotoCropGeometry({
      crop: { focusX: 0.25, focusY: 0.75, zoom: 2 },
      sourceHeight: 200,
      sourceWidth: 400,
      viewportHeight: 100,
      viewportWidth: 100,
    })).toEqual({ height: 200, left: -50, top: -100, width: 400 });
  });

  it("converts pan and pinch gestures into bounded crop state", () => {
    expect(panPhotoCrop({ focusX: 0.5, focusY: 0.5, zoom: 2 }, {
      translationX: 60,
      translationY: -100,
      viewportHeight: 400,
      viewportWidth: 300,
    })).toEqual({ focusX: 0.4, focusY: 0.625, zoom: 2 });
    expect(zoomPhotoCrop({ focusX: 0.4, focusY: 0.625, zoom: 2 }, 3)).toEqual({
      focusX: 0.4,
      focusY: 0.625,
      zoom: 4,
    });
  });

  it("maps a pan through the rendered cover size so release does not jump", () => {
    expect(panPhotoCrop({ focusX: 0.5, focusY: 0.5, zoom: 1 }, {
      sourceHeight: 400,
      sourceWidth: 600,
      translationX: 60,
      translationY: 0,
      viewportHeight: 400,
      viewportWidth: 300,
    })).toEqual({ focusX: 0.4, focusY: 0.5, zoom: 1 });

    const zoomed = panPhotoCrop({ focusX: 0.5, focusY: 0.5, zoom: 3 }, {
      sourceHeight: 800,
      sourceWidth: 600,
      translationX: 60,
      translationY: -100,
      viewportHeight: 400,
      viewportWidth: 300,
    });
    expect(zoomed.focusX).toBeCloseTo(0.433333, 5);
    expect(zoomed.focusY).toBeCloseTo(0.583333, 5);
    expect(zoomed.zoom).toBe(3);
  });
});
