# ADR-009: Video Delivery Strategy

- **Status**: Accepted
- **Date**: 2026-05

## Context

Course preview videos and lesson videos are uploaded to **Vercel Blob** (ADR-007) and stored as plain URLs on `Course.previewVideoUrl` and `Lesson.videoUrl`. Before building the lesson viewer in Phase 4, we need to decide how those URLs are consumed by the player.

The choice has downstream effects on: player component selection, streaming quality, bandwidth cost, and upload workflow.

### Options considered

**Option A — Serve directly from Vercel Blob**
The player receives the Blob URL and plays it as a standard `<video>` element or a library like `react-player`. Vercel Blob uses Vercel's CDN, so global delivery is reasonable.

| | |
|---|---|
| Pro | Zero additional infrastructure or cost beyond existing Blob storage |
| Pro | Upload workflow already works — no changes needed |
| Con | No adaptive bitrate streaming (HLS/DASH) — one quality level for all connections |
| Con | No automatic transcoding — large raw uploads play at original size/codec |
| Con | No video analytics, thumbnail generation, or DRM |
| Con | Vercel Blob is not optimised for video delivery at scale |

**Option B — Mux**
A dedicated video platform. Instructors upload to Blob, then a background job or webhook pushes the video to Mux for processing. The player uses `@mux/mux-player-react`.

| | |
|---|---|
| Pro | HLS adaptive bitrate streaming — quality adjusts to connection speed |
| Pro | Automatic transcoding, thumbnail extraction, captions |
| Pro | Per-minute video analytics (watch time, engagement) |
| Con | Per-minute storage + delivery cost (currently ~$0.015/min stored + $0.005/min delivered) |
| Con | Upload flow becomes two-step: Blob → Mux processing job |
| Con | Adds a third-party dependency and `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` env vars |

**Option C — Cloudflare Stream**
Functionally similar to Mux. Cheaper per-minute pricing, no egress fees, Cloudflare's global CDN. Player is a standard `<iframe>` or Cloudflare's JS SDK.

| | |
|---|---|
| Pro | Lower cost than Mux at scale; no egress fees |
| Pro | HLS adaptive streaming, thumbnail generation |
| Con | Less polished DX than Mux; fewer React-specific integrations |
| Con | Same two-step upload complexity as Mux |

## Decision

**Option A for MVP (Phase 4).** Serve lesson videos directly from Vercel Blob using `react-player`.

Rationale:
- The platform is not yet differentiated on video quality — content quality matters more at this stage.
- Vercel Blob CDN is sufficient for a small learner base.
- Adding Mux/Cloudflare now requires a background job infrastructure (ADR-013, not yet decided) for the transcoding pipeline.
- The upload workflow, data model, and file size limits (≤ 100 MB, ADR-007) remain unchanged.

### Migration trigger

Switch to Mux (Option B) when any of these occur:
- Instructors consistently upload videos > 500 MB, making raw delivery impractical.
- Student playback complaints about buffering on slow connections.
- Video analytics become a feature requirement.

Migration requires: adding `Lesson.muxAssetId` and `Lesson.muxPlaybackId` to the schema, a processing job after upload, and swapping `react-player` for `@mux/mux-player-react`.

## Consequences

**Positive**
- No new infrastructure, no new env vars, no changes to the upload flow.
- Phase 4 can proceed with `react-player` wrapping the existing Blob URL.

**Negative / Trade-offs**
- Single video quality for all students — users on slow connections will buffer on large files.
- 100 MB upload cap (ADR-007) limits video length to roughly 30–60 minutes at standard quality.
- If Mux migration is needed later, the `Lesson` schema requires a migration and existing videos must be re-uploaded or re-processed.
