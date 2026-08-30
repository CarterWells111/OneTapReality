# Staging Open Email Authentication Design

## Goal

Allow every syntactically valid, deliverable email address to request a one-time login code from the external-Beta staging API, while preserving developer-only administration, gift membership authorization, environment isolation, abuse controls, and an explicit rollback path. Production already uses the same open-email default, so public release will not require another login-policy change.

## Context and root cause

The `beta-external` iOS build points to `https://api-staging.onetapreality.com`. The staging Railway service still has a non-empty `ALPHA_ALLOWED_EMAILS` value containing the original internal developers. `POST /api/auth/request` calls `requireAlphaEmailAllowed`; when that variable is non-empty, an address outside the list receives `403 beta_invite_required` before Resend is called. This explains why the four developers can receive codes while newly invited TestFlight users cannot.

The repository already defines the desired open behavior: when `ALPHA_ALLOWED_EMAILS` is absent or empty, `requireAlphaEmailAllowed` permits the request. The client also maps network failures and `beta_invite_required` to different user-facing messages. The change therefore does not require a new authentication mechanism, App rebuild, database migration, dependency, or client secret.

## Decision

The active external-Beta staging service will leave `ALPHA_ALLOWED_EMAILS` unset or empty. App Store Connect invitations will remain the distribution mechanism for the TestFlight binary, but they will not be copied into a second server-side allowlist. The project will not integrate the App Store Connect tester API or introduce Apple API credentials, polling, or webhooks.

`GIFT_ADMIN_EMAILS` remains a separate, non-empty developer allowlist. Opening account login must not change `isGiftAdminEmail`, the developer NFC console, gift administration, or any role derived from an authenticated session.

## Configuration matrix

| Environment | Account login policy | Required controls |
| --- | --- | --- |
| External-Beta staging | `ALPHA_ALLOWED_EMAILS` absent or empty; all valid emails may request codes | `GIFT_SHARING_ENABLED=true`, staging-only database/R2/peppers/origins, verified Resend sender, existing rate limits |
| Production | `ALPHA_ALLOWED_EMAILS` absent or empty; same open-email policy | Production-isolated database/R2/peppers/origins; review access disabled |
| Future explicitly restricted environment | Non-empty `ALPHA_ALLOWED_EMAILS` only after a new recorded decision | `beta_invite_required` response and client copy remain available |

The current staging service is shared by internal staging builds and the external-Beta build. Once the variable is cleared, account login is open for every client using that staging API. Administrative and gift authorization remain restricted independently.

## Request and authorization flow

1. The client submits an email to `POST /api/auth/request`.
2. The server checks `GIFT_SHARING_ENABLED`, validates and normalizes the email, and checks account-deletion state.
3. With `ALPHA_ALLOWED_EMAILS` empty, the invitation gate passes without consulting App Store Connect or another remote service.
4. Existing atomic issuance limits apply before the code is stored and sent through Resend. Failed delivery removes the issued code.
5. Successful verification creates the existing 30-day account session.
6. Every privileged operation continues to derive authorization independently: developer features use `GIFT_ADMIN_EMAILS`; gift reads and writes use the gift token, membership role, activation state, and server-side ownership checks.

An arbitrary logged-in account can create its own account record and use account-level Beta features, but it cannot enumerate or access another account's gifts or media solely by being logged in.

## User-visible errors

- Invalid email input continues to show the validation message.
- Network failure continues to show the network-specific message rather than an invitation or email-delivery message.
- Request and verification limits continue to show their rate-limit messages.
- Email-provider or server configuration failures continue to use the existing safe fallback and never expose raw provider errors.
- `beta_invite_required` remains mapped to “此邮箱暂未加入测试，请确认邀请邮箱后重试。” for any future restricted environment, but the active external-Beta staging configuration will not normally emit it.

No App Store Connect invitation status is displayed or inferred because the server will not query or store TestFlight tester membership.

## Security, privacy, and operations

Opening login increases the number of people who can request email codes and create staging accounts. Existing per-window issuance limits, verification-attempt limits, one-time code hashing, short expiry, session hashing, account deletion, request-log redaction, and `GIFT_SHARING_ENABLED` remain mandatory. No email list, verification code, session token, Apple credential, or Resend credential may enter the client bundle, Git, logs, screenshots, Issues, or chat.

The external change is limited to the Railway staging variable and the resulting service deployment. It must not alter production variables, App Store Connect groups, EAS settings, R2 credentials, database contents, or Resend credentials. Platform configuration changes require the existing operations approval and a redacted deployment record.

## Verification

Repository verification will cover both policies:

- An empty or absent `ALPHA_ALLOWED_EMAILS` allows an otherwise valid address.
- A non-empty future allowlist still rejects an address outside it with `403 beta_invite_required` and does not send a code.
- `GIFT_ADMIN_EMAILS` remains independent from account login.
- Client error mapping keeps invitation, network, validation, delivery, and rate-limit outcomes distinct.
- Active documents and `.env.example` describe the external-Beta open-email policy without weakening environment isolation.

After the approved Railway change, operational verification will:

1. Confirm `/api/health` returns HTTP 200 with `database=ok` and the expected schema version.
2. Use one controlled, disposable email not present in the former four-person list to request and verify a code without recording the address or code.
3. Confirm the resulting account is not an administrator and cannot access an unrelated gift.
4. Confirm a malformed email still returns the validation error and that raw provider failures are not exposed.

The live email request and verification are external writes and require the release owner's approval at execution time.

## Rollback

For an immediate incident, set `GIFT_SHARING_ENABLED=false` to stop new login codes and gift-sharing operations according to the existing P0 procedure. To restore restricted login after the incident is understood, set `ALPHA_ALLOWED_EMAILS` to the approved developer list, redeploy staging, verify a controlled outside address receives `403 beta_invite_required` without an email being sent, and record only redacted evidence. Rollback must not change production or disclose the list.

## Out of scope

- App Store Connect tester synchronization, Apple API keys, polling, or webhooks.
- Public TestFlight links or automatic TestFlight group management.
- Changes to passwords, session duration, administrator selection, gift membership, R2 authorization, payment, analytics, or third-party services.
- An EAS build, TestFlight submission, App Store release, production deployment, or database migration.
