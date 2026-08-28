# Photo Management and Cropping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify page photo management under “照片与模板”, enforce an eight-photo page limit, and add reusable non-destructive cropping for page photos and cover backgrounds.

**Architecture:** Persist normalized focus and zoom metadata beside existing canvas image JSON, render it through one shared cropped-image component, and keep all photo-sheet changes transactional. Reuse the existing picker, staging, gesture, undo, local storage, shared snapshot, and capture pipelines.

**Tech Stack:** React Native, Expo Image, Expo Image Picker, Gesture Handler, Reanimated, Jest, Testing Library.

---

- [ ] Add crop types, validation, geometry helpers, and shared rendering with failing tests first.
- [ ] Build the reusable full-screen crop modal with bounded pan, pinch, reset, cancel, and confirm tests.
- [ ] Refactor the photo-layout sheet to stable photo draft items, single-photo addition, reordering, drag-to-trash deletion, cropping, template-family preservation, and atomic commit.
- [ ] Remove the standalone add-photo action and add image/cover crop affordances to the canvas editor.
- [ ] Change the page limit to eight and split legacy overflow pages in editor drafts while preserving non-image content and crop metadata.
- [ ] Preserve crop metadata through local draft parsing, saved albums, shared snapshots, readers, and exports.
- [ ] Run focused suites after each red-green cycle, then lint, typecheck, test:ci, build:server, and beta:preflight:ios.
