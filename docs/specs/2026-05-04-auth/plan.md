# Plan: Authentication

## Email / Password sign-up (student)

1. User submits the sign-up form (`SignUpForm`).
2. Better Auth hashes the password with bcrypt and creates `User` + `Account` rows.
3. `role` defaults to `STUDENT`.
4. On success, the user is redirected to `/dashboard`.

## Email / Password sign-in

1. User submits the sign-in form (`SignInForm`).
2. Better Auth validates credentials and sets a session cookie.
3. On success, the user is redirected to their last path or `/dashboard`.

## OAuth (GitHub / Google)

1. User clicks the GitHub or Google button (`OAuthButtons`).
2. A server action calls `authClient.signIn.social({ provider, callbackURL })`.
3. Better Auth handles the OAuth redirect and callback at `/api/auth/callback/{provider}`.
4. A `User` + `Account` row is created or linked if the email already exists.
5. On success, the user is redirected to the `callbackURL`.

## Sign-out

1. User clicks the logout button (`LogoutButton`).
2. `authClient.signOut()` is called from a client component.
3. The session cookie is cleared.
