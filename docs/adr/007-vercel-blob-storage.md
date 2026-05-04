# ADR-007: Vercel Blob for Media Storage

- **Status**: Accepted
- **Date**: 2025-11

## Context

Course thumbnails (images) and preview videos need to be stored externally. We needed a simple solution compatible with Vercel deployment without managing a separate S3 bucket.

## Decision

Use **Vercel Blob** (`@vercel/blob`) via a dedicated upload route handler at `app/api/uploads/route.ts`. Files are uploaded client-side to this endpoint before the tRPC course mutation. The returned blob URL is then stored on the `Course` record (`thumbnailUrl`, `previewVideoUrl`).

Old blobs are deleted via `vercelService.deleteFileFromVercelStorage` inside `CourseService.prepareCourseUpdate` when a thumbnail or video is replaced.

## Constraints enforced at the form level

- Thumbnail: image files only, max 2 MB
- Preview video: video files only, max 100 MB

## Consequences

**Positive**
- Zero infrastructure to manage; blobs are served from Vercel's CDN.
- Simple client-side upload flow: upload first, get URL, then save the course record.

**Negative / Trade-offs**
- Tied to Vercel; migrating to another host requires replacing the upload route and `vercelService`.
- Old blob deletion is fire-and-forget (no `await`); a failure silently leaves orphaned blobs.
- The `BLOB_READ_WRITE_TOKEN` env var is needed for the upload route but is not declared in the `lib/env.js` schema (Vercel injects it automatically in deployed environments).
