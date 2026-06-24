# Plan: Instructor Onboarding

## tRPC endpoint (`instructorRouter`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `instructor.create` | `publicProcedure` | Creates user account, assigns INSTRUCTOR role, creates profile — all in one transaction |

## Onboarding flow

1. Visitor navigates to `/instructors` (public marketing page).
2. `ApplicationForm` is rendered with `InstructorApplicationForm` inside.
3. On submit, `useCreateInstructor` calls `api.instructor.create.mutate(dto)`.
4. `InstructorService.createInstructor` runs in a transaction:
   a. `AuthService.signUp` creates the `User` + `Account` rows via Better Auth.
   b. `UserService.updateUser` sets `role = INSTRUCTOR` on the new user.
   c. `instructorRepository.create` creates the `InstructorProfile` row.
5. On success, the user is redirected to `/instructors/success`.
