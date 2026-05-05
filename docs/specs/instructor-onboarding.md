# Spec: Instructor Onboarding

## Overview

Users who want to teach on Learnix submit an application form on the public `/instructors` page. On success, a new user account is created, the user is assigned the `INSTRUCTOR` role, and an `InstructorProfile` record is created. The applicant is redirected to `/instructors/success`.

## Data model

```
InstructorProfile
  ├── id
  ├── userId → User (one-to-one)
  ├── areaOfExpertise
  ├── teachingExperience
  ├── professionalBio
  ├── courseIdea
  ├── phone (optional)
  ├── linkedinUrl (optional)
  └── websiteUrl (optional)
```

## Validation (`InstructorSchema` in `server/entities/instructor/index.ts`)

| Field | Rule |
|-------|------|
| fullName | required |
| email | valid email |
| password | required (min length enforced by Better Auth) |
| expertise | required |
| experience | required |
| bio | required |
| courseIdea | required |
| phone | optional |
| linkedIn | optional URL |
| website | optional URL |

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

## Notes

- This is a `publicProcedure` — no authentication is required. The instructor account is created as part of the flow.
- Because `role` has `input: false` in Better Auth's config, it cannot be set during sign-up; it must be updated in a follow-up call (`UserService.updateUser`) within the same transaction.
- If any step of the transaction fails, the entire operation is rolled back (no partial user + no profile).
