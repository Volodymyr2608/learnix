# Validation: Course Management

## Manual scenarios

### S1 — Create course

1. Sign in as INSTRUCTOR.
2. Navigate to the course creation page and fill all required fields (title, description, category, level, language, duration, price, ≥4 objectives, ≥2 requirements, ≥1 section with ≥1 lesson).
3. Upload a thumbnail image (≤2 MB).
4. Click **Save**.
5. **Verify**: course appears in the instructor's course list with `status = draft`.
6. **Verify** in Prisma Studio: `Course`, `Section`, and `Lesson` rows exist in a consistent state.

### S2 — Update course

1. Open an existing course in the editor.
2. Change the title and add a new section.
3. Click **Save**.
4. **Verify**: changes persist on reload; the new section appears in the curriculum.

### S3 — Reorder sections

1. Open the curriculum editor.
2. Drag a section to a new position and save.
3. **Verify**: section `order` values reflect the new order in the DB.

### S4 — Publish / unpublish

1. Toggle the course status to `published`.
2. **Verify**: course appears in `getPublishedCourses` and on the browse page.
3. Toggle back to `draft`.
4. **Verify**: course no longer appears on the browse page.

### S5 — Soft delete

1. Delete a course from the instructor portal.
2. **Verify**: course no longer appears in `getOwnCourses`; `deletedAt` is set in DB; the row still exists.

### S6 — Validation errors

| Scenario | Expected |
|---|---|
| Title under 3 characters | Form error shown; no API call |
| Fewer than 4 objectives | Form error shown |
| Thumbnail over 2 MB | Upload rejected; error shown |
| No sections | Form error shown |
