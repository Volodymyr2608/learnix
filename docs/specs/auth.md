# Spec: Authentication

## Overview

All users must authenticate before accessing any dashboard or instructor route. Better Auth manages sessions; the `role` field on `User` determines what they can access after sign-in.

## Roles

| Role | Default | Assigned by |
|------|---------|-------------|
| `STUDENT` | Yes, on sign-up | Automatic |
| `INSTRUCTOR` | No | `InstructorService.createInstructor` |
| `ADMIN` | No | Manual DB assignment |

## Flows

### Email / Password sign-up (student)

1. User submits the sign-up form (`SignUpForm`).
2. Better Auth hashes the password with bcrypt and creates `User` + `Account` rows.
3. `role` defaults to `STUDENT`.
4. On success, the user is redirected to `/dashboard`.

### Email / Password sign-in

1. User submits the sign-in form (`SignInForm`).
2. Better Auth validates credentials and sets a session cookie.
3. On success, the user is redirected to their last path or `/dashboard`.

### OAuth (GitHub / Google)

1. User clicks the GitHub or Google button (`OAuthButtons`).
2. A server action calls `authClient.signIn.social({ provider, callbackURL })`.
3. Better Auth handles the OAuth redirect and callback at `/api/auth/callback/{provider}`.
4. A `User` + `Account` row is created or linked if the email already exists.
5. On success, the user is redirected to the `callbackURL`.

### Sign-out

1. User clicks the logout button (`LogoutButton`).
2. `authClient.signOut()` is called from a client component.
3. The session cookie is cleared.

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
BETTER_AUTH_SECRET=          # required in production
BETTER_AUTH_GITHUB_CLIENT_ID=
BETTER_AUTH_GITHUB_CLIENT_SECRET=
BETTER_AUTH_GOOGLE_CLIENT_ID=
BETTER_AUTH_GOOGLE_CLIENT_SECRET=
BASE_URL=
```
