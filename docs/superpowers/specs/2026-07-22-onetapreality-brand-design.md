# OneTapReality｜一触如初 Brand Refresh Design

## Goal

Rename the user-facing product to `OneTapReality｜一触如初`, introduce the slogan `让每一次触碰，都回到故事最初的地方。`, and replace the current green-led interface with a four-color brand system drawn from the supplied references.

## Scope

- Update the Expo display name, README title, and user-facing product-name references from `旅忆` to `OneTapReality｜一触如初` or the compact Chinese name `一触如初` where space is constrained.
- Replace the default profile nickname `旅忆用户` with `一触如初用户`.
- Display the complete product name and slogan on the memory home hero and show the compact brand name plus slogan in the profile hero.
- Centralize the new colors in `src/components/ui.tsx`, then replace direct legacy warm-white and green literal usages in user-visible UI with semantic tokens.
- Keep technical identifiers unchanged: Expo slug `travel-memory-demo`, scheme `lvyidemo`, SQLite database name `luyi.db`, and existing local-storage keys. This preserves Expo Go compatibility and existing local data.

## Color system

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Parchment | `background` | `#F7F2EA` | app and splash background |
| Archive blue | `accent` | `#56708A` | primary controls, selected states, navigation emphasis |
| Memory terracotta | `warmAccent` | `#B56B52` | gift conversion card, warm highlights, secondary emotional emphasis |
| Soft paper | `accentSoft` | `#FFF2CF` | hero panels, empty states, image placeholders, subtle cards |
| White | `surface` | `#FFFFFF` | form fields and reading surfaces for contrast |
| Ink | `ink` | `#26313E` | primary text |
| Muted ink | `muted` | `#64707D` | supportive text |
| Rule | `line` | `#DED7CC` | borders and dividers |
| Error | `danger` | `#A33A33` | destructive action and validation error only |

Archive blue remains the functional primary color; terracotta must be limited to memory, gift, and emotional-conversion moments so it remains meaningful rather than decorative noise. The two pale colors are not interchangeable: parchment is the page ground, while soft paper is a contained highlight. The interface remains static and native, with no animation, remote asset, or layout overhaul.

## Brand hierarchy

- **Expo and README:** use the full name `OneTapReality｜一触如初`.
- **Home hero:** show `OneTapReality｜一触如初` as the main title and the exact slogan below it; retain existing local-only product explanation after the slogan.
- **Profile hero:** show `一触如初 · 共同档案` as eyebrow, retain the user's nickname and travel archive title, and place the slogan as the supporting brand line.
- **Compact controls:** use `一触如初` rather than the full bilingual name when the full wording would compromise a 44px native tap target or create a wrapping navigation label.

## Components and behavior

- `colors` gains `warmAccent` and `warmAccentSoft`; existing primary, secondary, and danger button behavior remains intact. A small `warm` visual tone may be added only where the existing gift conversion action uses it.
- Gift cards and their arrow use terracotta; primary create/save actions and active city/editor states use archive blue.
- The Expo splash and Android adaptive-icon background use parchment. No icon artwork, image asset, database, router, storage, permission, AI, NFC, payment, account, or networking behavior changes.

## Acceptance tests

1. `app.json` display name is exactly `OneTapReality｜一触如初`, while slug, scheme, and SQLite name remain unchanged.
2. All user-facing old product-name strings are replaced intentionally; the legacy name stays only in stable internal identifiers where changing it risks local-data compatibility.
3. Home and profile pages render the exact slogan.
4. The semantic palette exposes archive blue, terracotta, parchment, and soft paper at the exact values above; no existing tests regress.
5. `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npx expo-doctor`, and iOS Expo export pass before a new Draft PR is created.

## Explicit exclusions

This refresh does not add animation, visual effects, external fonts, remote images, a new logo asset, account functionality, cloud sync, analytics, AI model calls, real NFC, orders, payment, or migrations.
