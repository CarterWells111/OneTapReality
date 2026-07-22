# Privacy Declaration Entry Design

## Goal

Simplify the 我的 page by replacing its full local-data, NFC, and destructive-data-management block with one small, tappable declaration note, while preserving all details and deletion safeguards on a dedicated native screen.

## Selected approach

The profile page will show a single footer-style row labelled `本机数据与隐私声明 ›`. It has a 44px minimum touch target and opens `/privacy`. The new `本机数据与隐私声明` screen is the sole place for the local-only privacy statement, DemoDraftGenerator limitation, Expo Go NFC limitation, and the existing destructive `删除所有本地数据` action.

## Screen behavior

- The profile page removes the `本机数据与隐私` section, both explanation cards, and the delete button. Its archive, next-step, gift, settings, loading, and navigation behavior remain unchanged.
- The declaration page explains that travel metadata, local photo URIs, and story content are stored only in this device's SQLite database; the local demo generator does not recognize or upload images; and Expo Go shows NFC simulation only.
- A final `数据管理` section contains the existing `删除所有本地数据` button. Tapping it shows the same two-button destructive confirmation currently used on the profile page. Confirming clears memories via `clearAllMemories`; cancelling changes nothing.
- The declaration route uses the existing native stack and visual tokens. It adds no account, cloud sync, network, analytics, payment, AI model, real NFC, schema, or storage behavior.

## Test coverage

1. Profile renders the single declaration entry and routes to `/privacy`; it no longer renders the old privacy section or delete button.
2. Declaration page renders all three factual statements and the deletion action.
3. The deletion action still creates a destructive Alert confirmation and calls `clearAllMemories` only when its destructive callback runs.
4. The new stack route is registered as `privacy/index` with title `本机数据与隐私声明`.

## Scope boundary

This is an information-architecture change only. Existing local data is neither migrated nor automatically deleted, and the user must still explicitly confirm deletion.
