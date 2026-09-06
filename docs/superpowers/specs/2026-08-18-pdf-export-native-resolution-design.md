# PDF export native-resolution design

> Superseded on 2026-09-06 by `docs/superpowers/plans/2026-09-06-large-album-export-and-gift-publishing.md`. Do not implement the 360×480 scale-1 capture; the replacement uses load-aware 720×960 JPEG capture and covers gift publishing.

## Goal

Make Expo Go and TestFlight export the same PDF raster resolution: the original canvas size of 360 by 480 logical pixels. This reduces the memory pressure caused by generating a multipage PDF on iOS.

## Scope

- Change the page-capture scale from three times to one time.
- Preserve the existing 3:4 PDF page size, page order, content rendering, fallback HTML path, filename, and sharing flow.
- Add a regression test that asserts capture dimensions are the original canvas dimensions.

## Non-goals

- No PDF page-count limit is introduced or changed.
- No batch export, native PDF merger, new dependency, network request, or analytics is added.

## Error handling

Existing per-page screenshot fallback and PDF/share failure alerts remain unchanged. The change only reduces the size of the bitmap passed into the existing exporter.

## Acceptance criteria

- Expo Go and TestFlight both request 360 by 480 capture images for the standard canvas page.
- Existing PDF export and fallback behavior remain covered by tests.
- The project lint, typecheck, test, and server-build gates pass after implementation.
