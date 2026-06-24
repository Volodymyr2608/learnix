# Validation: Authentication

## Manual scenarios

### S1 — Email / password sign-up

1. Navigate to the sign-up page.
2. Submit a valid name, email, and password.
3. **Verify**: redirected to `/dashboard`; `User` row exists in DB with `role = STUDENT`.

### S2 — Email / password sign-in

1. Sign out, navigate to the sign-in page.
2. Submit valid credentials.
3. **Verify**: redirected to `/dashboard`; session cookie is set.
4. Submit invalid credentials.
5. **Verify**: error message shown; no redirect.

### S3 — OAuth (GitHub)

1. Click the GitHub button.
2. Authorize in GitHub.
3. **Verify**: redirected to the callback URL; `User` + `Account` rows exist in DB.

### S4 — OAuth (Google)

1. Click the Google button and authorize.
2. **Verify**: same as S3.

### S5 — Sign-out

1. Click the logout button.
2. **Verify**: session cookie is cleared; navigating to `/dashboard` redirects to sign-in.

### S6 — Guard enforcement

| Action | Role | Expected |
|---|---|---|
| Access `/dashboard` with no session | anonymous | Redirect to sign-in |
| Call any `protectedProcedure` with no session | anonymous | `UNAUTHORIZED` |
| Call `instructorProcedure` as `STUDENT` | STUDENT | `FORBIDDEN` |
| Call `studentProcedure` as `INSTRUCTOR` | INSTRUCTOR | `FORBIDDEN` |
| Call SSE endpoint with no session | anonymous | `401` |
