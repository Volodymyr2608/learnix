# Requirements: Authentication

## Overview

All users must authenticate before accessing any dashboard or instructor route. Better Auth manages sessions; the `role` field on `User` determines what they can access after sign-in.

## Roles

| Role | Default | Assigned by |
|------|---------|-------------|
| `STUDENT` | Yes, on sign-up | Automatic |
| `INSTRUCTOR` | No | `InstructorService.createInstructor` |
| `ADMIN` | No | Manual DB assignment |

## Guards

- tRPC `protectedProcedure`: throws `UNAUTHORIZED` if no session.
- tRPC `instructorProcedure` / `studentProcedure` / `adminProcedure`: throws `FORBIDDEN` if the session user's `role` doesn't match.
- SSE chat route: calls `getSession()` server-side and returns `401` if no session.

## Session access

- **Server Components / tRPC RSC**: `auth.api.getSession({ headers })` — called in `createTRPCContext`.
- **Client Components**: `authClient.useSession()` hook from `server/better-auth/client.ts`.
- **Route Handlers**: `getSession()` from `server/better-auth/server.ts`.

## Environment variables required

```
BETTER_AUTH_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_GITHUB_CLIENT_ID=
BETTER_AUTH_GITHUB_CLIENT_SECRET=
BETTER_AUTH_GOOGLE_CLIENT_ID=
BETTER_AUTH_GOOGLE_CLIENT_SECRET=
BASE_URL=
```
