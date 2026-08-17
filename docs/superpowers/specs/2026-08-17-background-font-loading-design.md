# Background Font Loading Design

## Outcome

OneTapReality renders immediately with the platform system font. Five approved local Chinese fonts load serially in the background. Selecting an unavailable font prioritizes it without blocking edits or changing the saved target font ID.

## Components

- `fonts.ts` is the single registry for font IDs, families, sources, labels, and byte sizes.
- `FontLoadingProvider` owns loaded/loading/failed state, a serial priority queue, weighted completed-byte progress, dismissal, and retry.
- Canvas text resolves its saved target family through the provider. Until loaded it uses the system font; provider updates re-render the text when registration completes.
- The font picker requests the selected font before saving the existing font ID. A global closeable banner appears only for an explicit user request and continues loading after dismissal.
- `RootLayout` no longer returns `null` while fonts load. Font loading cannot block SQLite, authentication, routing, or the first screen.

## Error and progress semantics

Expo Font exposes completion rather than reliable byte-level transfer progress for bundled assets, so progress is weighted by known file byte sizes and advances when each font completes. Failure keeps the temporary system font, shows a retry action, and does not cancel the remaining queue.

## Boundaries

No font is fetched from a new remote service. Fonts remain bundled local assets. Album JSON and font IDs remain unchanged. No database migration, API, analytics, or third-party dependency is introduced.
