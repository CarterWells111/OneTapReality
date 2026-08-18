# Canvas Temporary Save Design

## Goal

Add an in-place formal save action and prevent a successful save from changing persisted canvas image geometry.

## Save modes

`保存并退出画布` remains the exit action. `保存当前修改` uses the same formal persistence path: it waits for the recovery queue, writes the latest `canvasPages` snapshot, clears the recovery draft, and reports failures in the existing alert area. It does not navigate away.

After an in-place save succeeds, the editor keeps the submitted pages and active cursor, unlocks input, and clears the completed-save retry state. A later edit or save is therefore a new formal-save transaction rather than a replay of the old one.

## Geometry invariant

The snapshot sent to `updatePages` is the source of truth. A save-and-reload round trip must preserve every canvas element's normalized position, size, and rotation. The regression test compares the persisted snapshot with the editor reload payload, so asynchronous provider refreshes cannot silently replace it with a stale layout.

## Testing

Tests cover temporary save staying in the editor and allowing another edit, final save continuing to dismiss to the detail route, and save/reload preserving image geometry. Existing recovery and formal-save failure behavior remains unchanged.
