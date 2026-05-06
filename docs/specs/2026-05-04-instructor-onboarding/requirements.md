# Requirements: Instructor Onboarding

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

## Notes

- This is a `publicProcedure` — no authentication is required. The instructor account is created as part of the flow.
- Because `role` has `input: false` in Better Auth's config, it cannot be set during sign-up; it must be updated in a follow-up call (`UserService.updateUser`) within the same transaction.
- If any step of the transaction fails, the entire operation is rolled back (no partial user + no profile).
