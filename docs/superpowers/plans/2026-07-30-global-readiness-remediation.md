# Global readiness remediation plan

> Scope: repository-only repairs following the 2026-07-30 release-readiness audit. No cloud service, DNS, database, storage, email, EAS, TestFlight, or App Store Connect resource is changed by this plan.

## Goal

Make active project identifiers internally consistent with OneTapReality, preserve the API health contract under its correct public service name, and remove legacy City Key brand URLs without falsely enabling an unimplemented physical deep-link flow.

## Guardrails

- Preserve the existing `.tralbum` export format as a historical file-format compatibility exception.
- Do not rename persisted SecureStore keys in this change; a future migration must dual-read old keys before deleting them.
- Keep City Key as a parser-only utility. Adding a public deep link requires a separate decision, an Expo route, AASA/App Links changes, and iOS/Android device tests.
- Staging is not considered available until `staging.onetapreality.com` and `api-staging.onetapreality.com` resolve and pass their documented checks. This plan only records that operational boundary.

## Implementation steps

1. Add failing contract tests for the health service identifier and City Key output URLs. Add a Node test that protects active collaboration documents from reintroducing legacy brand identifiers.
2. Change the typed health response, health route, client fixtures, and README health example to `onetapreality-api` without changing the response schema or version.
3. Change City Key parser comments, accepted prefixes, generator prefixes, and tests from legacy URLs to `onetapreality://` and `https://onetapreality.com/`. Keep rejection coverage for legacy and hostile URLs.
4. Update active operating documents (`AGENTS.md`, execution checklist, code conventions) to describe OneTapReality, the existing NFC/login/cloud scope, PR-only integration, required quality gates, and the staging prerequisite. Mark historical records as history instead of rewriting audit evidence.
5. Run targeted tests, then `lint`, `typecheck`, `test:ci`, and `build:server`. Re-scan active production code and active docs for old URL/brand identifiers, inspect the diff, commit to a dedicated branch, and open a PR.

## External follow-up (not executed here)

1. Provision a separate Railway staging service and PostgreSQL database; give it distinct peppers, admin email, cleanup key, and `ALPHA_ALLOWED_EMAILS`.
2. Provision a private, separate R2 bucket and least-privilege credentials; set the staging gift origin to `https://staging.onetapreality.com`.
3. Create Cloudflare DNS and route the staging website/API. Deploy AASA and `assetlinks.json` for both the staging and production app identities.
4. Verify staging health, test card URL, deep link, email login, claim, publish, invited read-only view, disable, and object deletion. Exercise `GIFT_SHARING_ENABLED=false` before distributing an `alpha` build or physical staging card.
