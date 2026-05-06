# Validation: Instructor Onboarding

## Manual scenarios

### S1 — Happy path

1. Navigate to `/instructors` as an unauthenticated visitor.
2. Fill in all required fields (fullName, email, password, expertise, experience, bio, courseIdea).
3. Submit the form.
4. **Verify**: redirected to `/instructors/success`.
5. **Verify** in Prisma Studio: `User` row exists with `role = INSTRUCTOR`; `InstructorProfile` row exists linked to that user.

### S2 — Validation errors

| Scenario | Expected |
|---|---|
| Missing required field (e.g., bio) | Form error shown; no API call |
| Invalid email format | Form error shown |
| Invalid LinkedIn or website URL | Form error shown |

### S3 — Transaction rollback

1. Simulate a failure mid-transaction (e.g., temporarily break `UserService.updateUser`).
2. Submit the form.
3. **Verify**: no `User` row and no `InstructorProfile` row were created (full rollback).

### S4 — Duplicate email

1. Submit the form with an email address already registered.
2. **Verify**: error is shown; no duplicate user is created.
