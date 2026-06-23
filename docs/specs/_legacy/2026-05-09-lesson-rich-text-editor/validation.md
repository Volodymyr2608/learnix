# Validation: Lesson Rich Text Editor (WYSIWYG over Markdown)

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No new lint or format issues. |
| `pnpm build` | Production build succeeds. The lesson edit route appears in the build output without hydration warnings; MDXEditor internals do not appear in the server-bundle chunk list. |

## Manual scenarios

Run `pnpm dev`. Sign in as INSTRUCTOR with at least one course containing a lesson.

### S1 — First open of a fresh lesson

1. Open a lesson whose `content` is empty.
2. **Verify**: the **Text Content** tab shows the WYSIWYG editor with a toolbar (undo/redo, bold/italic/underline, code toggle, block-type select, lists toggle, link, image, table, code block, thematic break) and an empty editable area.
3. **Verify**: no horizontal overflow in the surrounding `<Card>`; the toolbar sits flush to the top of the content area.

### S2 — Authoring round-trip

1. In the editor, add: an H2 heading, a paragraph, a bulleted list (3 items), an inline link, a table (2x2), a fenced code block (`ts`), and a blockquote.
2. Click **Save**.
3. Reload the page.
4. **Verify**: every block re-hydrates visually identical to before the reload.
5. Open Prisma Studio. Inspect `Lesson.content`.
6. **Verify**: the value is plain markdown — fenced code blocks use triple backticks, lists use `-`/`1.`, headings use `##`. No HTML, no JSX, no front-matter.

### S3 — Image upload via toolbar

1. Click the **Insert image** toolbar button.
2. Choose a local image file under 2 MB.
3. **Verify**: a progress indicator appears; on success the image renders inline.
4. **Verify** (via DevTools network tab): the request hits `POST /api/uploads`, the response is `{ mediaUrl: "https://*.public.blob.vercel-storage.com/..." }`.
5. Click **Save**, reload.
6. **Verify**: the markdown source in `Lesson.content` contains `![...](https://*.public.blob.vercel-storage.com/...)` and the image still renders after reload.

### S4 — Image upload via paste / drop

1. Drag an image file onto the editor body.
2. **Verify**: the image uploads and inserts at the drop location.
3. Repeat with copy-pasting an image from the clipboard.
4. **Verify**: same behaviour.

### S5 — Image upload failure

1. Stop Vercel Blob locally (or temporarily edit `imageUploadHandler.ts` to point at a 500-returning endpoint).
2. Try to insert an image.
3. **Verify**: a clear error toast appears; the markdown document is unchanged (no broken `![]()` left behind).

### S6 — Backwards-compatibility with legacy lessons

1. Use Prisma Studio (or a SQL update) to set a lesson's `content` to a chunk of legacy markdown:
   ```
   # Old heading

   - one
   - two
   - three

   ```js
   console.log("hi");
   ```

   > a quote

   [link](https://example.com)
   ```
2. Open the lesson in the editor.
3. **Verify**: every element renders visually (heading, list, code block, blockquote, link). No raw `#` or backticks visible in the editing surface.
4. Make a small edit (e.g. change one list item) and save.
5. **Verify**: the saved markdown is structurally equivalent — only the edited line changed; other markdown nodes are untouched in shape.

### S7 — Markdown shortcuts still work

1. In an empty editor, type `# Heading` then press Enter.
2. **Verify**: the line becomes an H1 and the next line is a paragraph.
3. Type `- item` Enter `- item`.
4. **Verify**: a bulleted list forms.
5. Type ``` ```ts ``` Enter.
6. **Verify**: a TypeScript code block is created with CodeMirror highlighting.

### S8 — Code-block language picker

1. Insert a code block via the toolbar.
2. **Verify**: the language picker shows a list including `JavaScript`, `TypeScript`, `Python`, `JSON`, `Markdown`, etc. (sourced from `@codemirror/language-data`).
3. Switch language to Python; type some Python.
4. **Verify**: syntax highlighting updates immediately.
5. Save and reload.
6. **Verify**: the fence `language` annotation persists in the markdown (e.g. ```` ```python ````).

### S9 — Student render unchanged

1. As a STUDENT enrolled in the course, open the same lesson.
2. **Verify**: `react-markdown` renders the lesson identically to how it would have rendered if the content had been authored in the legacy textarea — same headings, lists, code highlighting, tables, blockquotes, images.

### S10 — AI Quiz Generator regression

1. Back as the instructor, open the **Quiz** tab on a lesson whose body was authored with the new editor.
2. Click **Generate with AI**.
3. **Verify**: the agent returns 3–5 well-formed questions referencing concepts from the lesson body. The `getLessonContent` tool reads markdown text indistinguishable from legacy lessons.

### S11 — Bundle isolation

1. Run `pnpm build`.
2. **Verify** (in the Next.js build output, or by inspecting `.next/server/`): no MDXEditor / Lexical / CodeMirror chunks land in the server bundle. They appear only in client chunks for the lesson edit page.
3. Open a non-instructor route (e.g. `/dashboard`) in the browser and inspect network requests.
4. **Verify**: no MDXEditor chunk is fetched.

### S12 — Empty save

1. Clear the editor body completely.
2. Click **Save**.
3. **Verify**: the mutation succeeds; `Lesson.content` becomes an empty string (or null per the existing `LessonContentUpdateDto`); reopening the lesson shows an empty editor.
