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
| `initWithoutDefaultIntegrations` | present, but it is **`@sentry/node`'s**, not `@sentry/nextjs`'s | re-exported by the `Object.keys(node).forEach` sweep at `@sentry/nextjs/build/cjs/index.server.js:67-69`; the package's own `init` is `build/cjs/server/index.js:68` | **not used** — see below |
| `linkedErrorsIntegration` | present | `typeof === "function"` | `sentry.server.config.ts` |
| `dedupeIntegration` | present | ditto | ditto |
| `inboundFiltersIntegration` | present | ditto | ditto |
| `distDirRewriteFramesIntegration` | **not exported** | absent from `index.server.js`'s exports; defined at `build/cjs/server/distDirRewriteFramesIntegration.js` | AC 35 — can only be re-admitted by name from the defaults |
| `integrations` as a function | **replaces** the resolved list; it is not merged with the defaults | `@sentry/core/build/cjs/integration.js:29-31` | S14 — this is what makes the pinned list structural |
| `captureRequestError` | present, but captures the **raw** error | `build/cjs/common/captureRequestError.js` — `captureException(error)` with no projection, and it puts the request headers on the scope | **not used** — `instrumentation.ts`'s `onRequestError` calls `reportError` (AC 6) |
| `sourcemaps.deleteSourcemapsAfterUpload` | defaults `true` for client maps | Sentry Next.js build docs | AC 35 — we set it explicitly anyway, so the assertion pins a literal rather than a default |
| `widenClientFileUpload` | defaults `false` | ditto | AC 35 |
| `tunnelRoute` | no default, but **present in Sentry's own recommended snippet** | ditto | AC 34 — an active omission, not a no-op |

## `init()` vs `initWithoutDefaultIntegrations` — read from source, 2026-08-24

The first implementation called `Sentry.initWithoutDefaultIntegrations(...)` with a plain array. That
function is **not** `@sentry/nextjs`'s: the package re-exports every remaining `@sentry/node` symbol
in a runtime sweep (`build/cjs/index.server.js:67-69`), and `@sentry/node`'s version is just
`_init(options, () => [])` (`@sentry/node/build/cjs/sdk/index.js:67`). So it skipped everything
`@sentry/nextjs`'s own `init()` (`build/cjs/server/index.js:68`) does around `node.init`:

| What Next.js's `init()` adds | Consequence of skipping it |
|---|---|
| `distDirRewriteFramesIntegration({ distDirName })` | **the one that matters.** It rewrites `<abs>/.next/...` frames to `app:///_next/...`, the path the uploaded artifacts are keyed by. Without it the source maps AC 35's build config uploads resolve against nothing — the upload apparatus is silently inert |
| the injected release name (`process.env._sentryRelease`) | events carry no release, so they are not associated with the artifact bundle either |
| `applySdkMetadata(opts, "nextjs", [...])` | events are attributed to the plain Node SDK |
| `isBuild()` early return | `init` would run during `next build`'s page-data collection |
| `sdkAlreadyInitialized()` guard | a second `register()` would re-init |
| `DropReactControlFlowErrors` global event processor | React postpone / "Suspense Exception: This is not a real error!" throws are captured as issues. They are control flow, not errors, and each one costs quota (AC 24's concern) |
| `httpIntegration({ disableIncomingRequestSpans: true })` | see "deliberately still excluded" below |

## Why the pinned list survives the switch

`sentry.server.config.ts` now calls `Sentry.init` with `integrations` as a **function**. Per
`@sentry/core/build/cjs/integration.js:29-31`, a function `integrations` *replaces* the resolved list
outright — the defaults are passed in as an argument and are otherwise discarded. So S14's residual
stays closed structurally, not by vigilance: a future release adding `captureConsoleIntegration` or
`extraErrorDataIntegration` cannot reach an event, because the final list is one we build.

The three constructed:

- `linkedErrorsIntegration({ limit: LINKED_ERROR_DEPTH })` — pinned to the same constant the
  projection walks to, so the two cannot drift apart.
- `dedupeIntegration()` — suppresses consecutive identical events. Note it does **not** bound the
  quota flood S6 describes (that needs AC 24's throttle); it only removes exact repeats.
- `inboundFiltersIntegration()` — the SDK's own noise filter.

Plus exactly one re-admitted **by name**, because the SDK does not export it and it therefore cannot
be constructed: `DistDirRewriteFrames`. `sentry.server.config.test.ts` pins the resolved list to those
four against a defaults array that deliberately contains `CaptureConsole` and `ExtraErrorData`, and
asserts the list still resolves when the defaults offer no `DistDirRewriteFrames` at all.

`httpIntegration` is **deliberately still excluded**, unchanged from the first implementation. With
`tracesSampleRate: 0` and incoming spans already disabled, what it would add is outgoing-request
breadcrumbs — method, URL, query string for every OpenAI, Upstash, Stripe and Resend call — which is
a data channel AC 11 explicitly asserts stays empty. It is not what forks the isolation scope: in
10.70.0 nothing under `@sentry/node-core/integrations/http` calls `withIsolationScope`.

## Not verified here

- `Dedupe`'s exact equality semantics were not read from source; AC 24's throttle is written not to
  depend on them (`security.md` S6 states this explicitly).
- **Which request surfaces fork an isolation scope.** Only `withIsolationScope()` sets the OTel fork
  key (`@sentry/opentelemetry` asyncContextStrategy:1814-1819) and `wrapRouteHandlerWithSentry` is the
  caller on this app's surfaces; `wrapServerComponentWithSentry` reads `getIsolationScope()` without
  forking. Whether the RSC path is covered was not established, so `enrichScope` is written to be safe
  either way — its allowlist means only ids can ever persist on a shared scope, never a payload.

## The wizard was not used

`npx @sentry/wizard` requires interactive browser OAuth, and no cached login (`~/.sentryclirc`) or
`SENTRY_AUTH_TOKEN` was available in this environment. The SDK was installed with `pnpm add` and every
config file written by hand instead — which produces the same end state, since the plan's Task 1
stripped six of the wizard's defaults anyway. The only artefacts still needed from a Sentry account
are the `SENTRY_DSN` value and, for source-map upload, `SENTRY_AUTH_TOKEN`; neither is required for
the build, the tests, or local development (AC 28).