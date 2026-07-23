# Production API Origin Design

## Goal

Make production native builds connect to the deployed Railway API at
`https://onetapserver-production.up.railway.app` without changing local Expo
development behavior.

## Configuration

Add an EAS build configuration with a `production` profile. The profile exposes
only the public `EXPO_PUBLIC_API_ORIGIN` value. Existing `app.config.ts` remains
the single integration point: it normalizes the value and applies it to Expo
Router, while the backend API client reads the same build-time variable.

Local development keeps `EXPO_PUBLIC_API_ORIGIN` empty, so one Expo dev server
continues to serve both the app bundle and relative `/api/*` requests.

## Security and Scope

The Railway origin is public and safe to embed in the app bundle.
`DATABASE_URL`, `DEVICE_TOKEN_PEPPER`, and all other server credentials remain
outside EAS client configuration and only exist in the Railway API service.

This change does not enable automatic synchronization, upload local photos,
replace the local SQLite data source, or add accounts, analytics, payments, or
AI.

## Verification

- A focused configuration test reads `eas.json` and requires the production
  profile to contain the exact HTTPS Railway origin.
- The test also ensures the profile does not contain `DATABASE_URL` or
  `DEVICE_TOKEN_PEPPER`.
- Existing app-config tests continue to verify Router origin normalization.
- Documentation records the production build command and the in-app manual
  connection check.
