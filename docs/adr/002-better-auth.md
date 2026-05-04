# ADR-002: Better Auth over NextAuth.js

- **Status**: Accepted
- **Date**: 2025-11

## Context

The T3 scaffold defaults to NextAuth.js. We needed email/password sign-up (with hashed passwords stored in our own DB) plus GitHub and Google OAuth, all working with App Router without adapter quirks.

## Decision

Use **Better Auth** (`better-auth` v1.x) with the Prisma adapter and the `nextCookies` plugin.

## Consequences

**Positive**
- First-class support for email/password with bcrypt hashing in the same library — no separate credential provider hacks.
- Prisma adapter writes directly to our DB; the `User`, `Session`, `Account`, and `Verification` models are owned by us and can carry custom fields (e.g., `role`).
- `nextCookies` plugin handles cookie propagation correctly inside App Router Server Components.
- `auth.api.getSession({ headers })` is callable from the tRPC context factory, giving every procedure access to the session without extra middleware.

**Negative / Trade-offs**
- Smaller ecosystem and fewer community examples than NextAuth.js.
- The `role` field is an `additionalField` with `input: false`; role assignment must happen via a separate `userService.updateUser` call (e.g., during instructor sign-up).
- OAuth redirect URIs must be set explicitly in the config: `${BASE_URL}/api/auth/callback/{provider}`.

## Implementation notes

- Auth config: `server/better-auth/config.ts`
- Route handler: `app/api/auth/[...all]/route.ts`
- Server-side session helper: `server/better-auth/server.ts`
- Client-side auth client: `server/better-auth/client.ts`
