# Requirements: Course Management

## Overview

Instructors create and manage courses through a multi-section form. A course has basic info, media, objectives, requirements, pricing, and a curriculum of sections and lessons. Courses start as `draft` and can be published.

## Data model

```
Course
  ├── id, title, subtitle, description
  ├── category, level, language, duration
  ├── price, originalPrice
  ├── status: draft | published
  ├── thumbnailUrl, previewVideoUrl
  ├── objectives: String[]
  ├── requirements: String[]
  ├── instructorId → User
  ├── deletedAt (soft-delete)
  └── sections[]
        └── lessons[]
```

## Validation rules (enforced by `courseSchema` in `server/entities/course/index.ts`)

| Field | Rule |
|-------|------|
| title | 3–60 characters |
| description | 10–500 characters |
| category, level, language, duration, price | required |
| thumbnail | image file ≤ 2 MB **or** existing URL |
| previewVideo | video file ≤ 100 MB (optional) |
| objectives | minimum 4 entries, each non-empty |
| requirements | minimum 2 entries, each non-empty |
| sections | minimum 1; each section needs minimum 1 lesson |
