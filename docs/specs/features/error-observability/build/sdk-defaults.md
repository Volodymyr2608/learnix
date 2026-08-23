# Installed SDK defaults — read, not assumed

`security.md` **S14** requires the SDK behaviours that AC 14, 24 and 35 depend on to be verified
against the package actually installed, because the plan was written before it existed. This is that
record. Re-run these checks on any `@sentry/nextjs` major upgrade.

**Version:** `@sentry/nextjs@10.70.0` (peer `next: ^13.2.0 || ^14.0 || ^15.0.0-rc.0 || ^16.0.0-0`;
this repo is on Next 16.1.6).

| Behaviour | Observed | Where | Consumed by |
|---|---|---|---|
| `linkedErrors` cause key | `"cause"` | `@sentry/core@10.70.0/build/cjs/integrations/linkederrors.js:7` | AC 14 |
| `linkedErrors` depth limit | **5** | same file `:8` (`DEFAULT_LIMIT = 5`) | `LINKED_ERROR_DEPTH` in `projectError.ts`, AC 14 |
| `initWithoutDefaultIntegrations` | present | `typeof === "function"` | S14 — pins the integration list |
| `linkedErrorsIntegration` | present | ditto | `sentry.server.config.ts` |
| `dedupeIntegration` | present | ditto | ditto |
| `inboundFiltersIntegration` | present | ditto | ditto |
| `captureRequestError` | present | ditto | AC 6, `instrumentation.ts` |
| `sourcemaps.deleteSourcemapsAfterUpload` | defaults `true` for client maps | Sentry Next.js build docs | AC 35 — we set it explicitly anyway, so the assertion pins a literal rather than a default |
| `widenClientFileUpload` | defaults `false` | ditto | AC 35 |
| `tunnelRoute` | no default, but **present in Sentry's own recommended snippet** | ditto | AC 34 — an active omission, not a no-op |

## Why `initWithoutDefaultIntegrations` rather than filtering defaults

S14's residual is *SDK default drift*: a later upgrade adding `captureConsoleIntegration` or
`extraErrorDataIntegration` would reintroduce raw error objects into `extra`, bypassing the
projection. Filtering a default list mitigates that by vigilance — you have to notice the new entry.
Starting from nothing and naming the three integrations we want closes it structurally: a new default
cannot appear in a list we construct ourselves.

The three kept:

- `linkedErrorsIntegration({ limit: LINKED_ERROR_DEPTH })` — pinned to the same constant the
  projection walks to, so the two cannot drift apart.
- `dedupeIntegration()` — suppresses consecutive identical events. Note it does **not** bound the
  quota flood S6 describes (that needs AC 24's throttle); it only removes exact repeats.
- `inboundFiltersIntegration()` — the SDK's own noise filter.

## Not verified here

`Dedupe`'s exact equality semantics were not read from source; AC 24's throttle is written not to
depend on them (`security.md` S6 states this explicitly).

## The wizard was not used

`npx @sentry/wizard` requires interactive browser OAuth, and no cached login (`~/.sentryclirc`) or
`SENTRY_AUTH_TOKEN` was available in this environment. The SDK was installed with `pnpm add` and every
config file written by hand instead — which produces the same end state, since the plan's Task 1
stripped six of the wizard's defaults anyway. The only artefacts still needed from a Sentry account
are the `SENTRY_DSN` value and, for source-map upload, `SENTRY_AUTH_TOKEN`; neither is required for
the build, the tests, or local development (AC 28).