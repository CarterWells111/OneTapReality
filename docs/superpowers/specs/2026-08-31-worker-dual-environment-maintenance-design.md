# Gift Maintenance Worker Dual-Environment Design

## Goal

Keep production and external-Beta staging database maintenance current with the existing `onetap-gift-maintenance` Cloudflare Worker, its existing hourly Cron, and the existing maintenance API contract. The change must not create another Worker, trigger, storage binding, queue, database, monitoring service, or paid plan commitment.

## Context and root cause

The current Worker sends one hourly authenticated `POST` only to the production maintenance endpoint. Production maintenance is healthy, but staging maintenance had not completed for about seven days. The request-triggered maintenance fallback did not provide a reliable schedule during low Beta traffic, leaving due media cleanup jobs and expired authentication/session rows waiting until a separately approved manual maintenance call.

The API already exposes the same protected maintenance endpoint in both environments. The missing piece is scheduled staging delivery, not a new queue or maintenance implementation.

## Decision

The existing Worker will keep one `0 * * * *` Cron and will call two targets sequentially on every scheduled invocation:

1. production, using the existing `MAINTENANCE_ENDPOINT` and `MAINTENANCE_SECRET` bindings;
2. staging, using `STAGING_MAINTENANCE_ENDPOINT` and `STAGING_MAINTENANCE_SECRET` bindings.

The staging endpoint is a non-secret HTTPS URL committed in `wrangler.toml`. Both secrets remain Cloudflare Worker secrets and must never be committed, printed, included in errors, or placed in client code. The scheduled handler continues to call `controller.noRetry()` before any request. The Worker adds no internal retry.

If one target fails, the Worker still attempts the other target. After both attempts, it throws one sanitized aggregate error when any target failed. This preserves independent maintenance progress while making the scheduled invocation visibly fail in existing Cloudflare metrics. Failure details are limited to the target label and a safe reason such as missing binding, invalid endpoint, network failure, or HTTP status; response bodies, endpoint URLs, secrets, object keys, and user data are never included.

## Execution flow

For each target in the fixed production-then-staging order, the Worker will:

1. confirm that the endpoint and secret bindings are present and non-empty;
2. parse the endpoint and require the `https:` protocol;
3. issue one `POST` with only the existing `x-gift-maintenance-secret` header, reject redirects, and attach an abort signal;
4. enforce a 25-second target deadline covering both the request and response cleanup;
5. cancel the response body without reading or logging it;
6. treat every non-2xx response as a target failure;
7. record only a sanitized failure classification and continue to the next target.

After the second target, the invocation succeeds only when both targets succeeded. A configuration or request failure for one environment must not prevent the other environment from being attempted.

## Configuration matrix

| Binding | Type | Repository value | Runtime source |
| --- | --- | --- | --- |
| `MAINTENANCE_ENDPOINT` | non-secret variable | production HTTPS maintenance URL | `wrangler.toml` |
| `MAINTENANCE_SECRET` | secret | never committed | existing Cloudflare Worker secret |
| `STAGING_MAINTENANCE_ENDPOINT` | non-secret variable | staging HTTPS maintenance URL | `wrangler.toml` |
| `STAGING_MAINTENANCE_SECRET` | secret | never committed | separately approved Cloudflare Worker secret |

Both secret bindings are required for a healthy scheduled invocation. A Wrangler dry-run may compile without real secret values because it must not call either endpoint.

## Failure behavior

- A production failure does not suppress the staging request.
- A staging failure does not undo a successful production request.
- HTTP failures are reported by target label and status only.
- Network and configuration failures use fixed sanitized categories and do not interpolate raw exception messages.
- A request or response cleanup that exceeds the 25-second per-target deadline is aborted and reported as `network_error`; it cannot prevent the next target from being attempted.
- Cloudflare platform retries remain disabled and the Worker performs no retry loop.
- Maintenance endpoint idempotency remains the server's responsibility; this change does not alter database leases, batch limits, retention rules, or R2 deletion behavior.

## Security and privacy

The Worker remains schedule-only and exposes no `fetch` handler, route, or public URL. It stores no data and receives no R2, KV, D1, Durable Object, Queue, or analytics binding. It sends secrets only to their corresponding fixed HTTPS endpoints. Tests and documentation use placeholder values and must not contain either live secret.

The Worker must never log or return maintenance response bodies. It must not include full endpoints or raw caught errors in thrown messages because either could disclose query strings, platform details, or upstream content.

## Cost boundary

The design keeps one Worker and one hourly scheduled invocation. It adds one outbound subrequest per hour, approximately 744 additional subrequests in a 31-day month, while creating no additional Worker invocation, service, storage binding, database, queue, or monitoring product. Existing Railway maintenance requests may add a very small amount of compute and database usage; this remains within the owner's accepted small existing-platform usage and introduces no new billing category.

If implementation or deployment requires a paid Cloudflare plan, a second Cron, a new Railway service, a paid binding, or another billing commitment, work must stop and request a new decision.

## Verification

Tests will be written before implementation and will cover:

- production is called before staging;
- each endpoint receives exactly its matching secret header;
- both endpoints are attempted exactly once;
- a first-target HTTP or network failure still allows the second target to run;
- one or two failures produce one sanitized aggregate failure after both attempts;
- missing or empty bindings and non-HTTPS endpoints fail only their target and never expose values;
- response bodies are cancelled and never read;
- stalled requests and stalled response cleanup time out per target without suppressing the next target;
- the Worker exposes only `scheduled`, disables platform retries, and keeps one hourly trigger;
- `wrangler.toml` contains both endpoint variables, contains neither secret, and has no paid storage or queue binding.

After the focused failing tests and minimal implementation, local verification will run `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build:server`, and `npm run worker:check`. The dry-run must not deploy or contact either maintenance endpoint.

## Deployment and rollback

This design authorizes local code, tests, and documentation only. Pushing a branch, creating or merging a PR, creating the staging Worker secret, changing Cloudflare configuration, deploying the Worker, and invoking either live endpoint each require their applicable separate approval.

After a future approved deployment, rollback is the previous known-good Worker version, which restores production-only scheduled maintenance. Staging then relies temporarily on its request fallback and separately approved manual maintenance until the dual-target Worker is corrected. Rollback must not delete secrets, change databases, or create a replacement service automatically.

## Alternatives considered

- A second staging-only Worker was rejected because it adds a separately deployed service and configuration surface.
- A second Cron trigger was rejected because the current hourly invocation can safely make both requests.
- Request-triggered fallback alone was rejected because low staging traffic already allowed maintenance to become stale for about seven days.
- Internal retries were rejected because maintenance already has server-side leases and backoff, while retries would add traffic and blur failure evidence.

## Out of scope

- Database migrations, retention changes, maintenance batch changes, or R2 lifecycle changes.
- New Worker routes, public endpoints, logging destinations, analytics, alerting, or paid monitoring.
- Railway, Cloudflare, R2, Resend, TestFlight, staging, or production configuration changes in this local implementation phase.
