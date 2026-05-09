# Requirements: Lesson Rich Text Editor (WYSIWYG over Markdown)

## Status: planned — Phase 4 polish

## Problem

Instructors author lesson body text in a plain `<Textarea>` (`app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/index.tsx`) labelled "Supports Markdown formatting." That is uncomfortable: there is no preview, no toolbar, no inline image upload, and the author must remember markdown syntax. The instructor experience lags behind the rest of the dashboard, where forms are otherwise modern (drag-and-drop curriculum, controlled fields, AI quiz dialog).

Meanwhile, every downstream consumer already speaks markdown:

- The student lesson view (`app/_components/Course/components/CourseLearnView/index.tsx`) renders content via `react-markdown`.
- The AI Quiz Generator's `getLessonContent` tool (ADR-008) reads `Lesson.content` as plain text.
- Future RAG over lesson chunks (ADR-012, Phase 8) and lesson auto-summary (Phase 9) will both ingest the same markdown.
- `Lesson.content` is `String? @db.Text` — no schema constraint forces a particular format.

## Goal

Give instructors a WYSIWYG editing surface (toolbar, headings, lists, tables, code blocks, inline image upload) **without changing the storage format**. Markdown remains the source of truth so the student renderer, AI tools, and any future embedding pipeline keep working with no changes on their side.

When this ships, an instructor opens a lesson, switches to **Text Content**, sees a live editor with a toolbar, types/pastes/drops formatted content, and saves — and the bytes hitting `Lesson.content` are still markdown indistinguishable in shape from what the legacy textarea produced.

## Architectural decisions

- **Library**: [`@mdxeditor/editor`](https://mdxeditor.dev/) — a React WYSIWYG editor that natively reads/writes markdown. Chosen over CKEditor 5 (HTML output, partly commercial), TipTap/BlockNote (JSON output, requires a markdown serializer), and Lexical (more boilerplate). MDXEditor outputs markdown directly — no serializer, no schema migration, no second source of truth.
- **Storage**: unchanged. `Lesson.content` stays `String? @db.Text` containing markdown. `LessonContentUpdateDto` (`server/entities/lesson/index.ts`) and the `lesson.updateContent` tRPC procedure are not modified.
- **Mount strategy**: client-only via `next/dynamic({ ssr: false })`, per the MDXEditor App Router guide. The editor is loaded only when an instructor opens the **Text Content** tab; the rest of the lesson edit page continues to SSR normally.
- **Image uploads**: reuse the existing Vercel Blob endpoint at `app/api/uploads/route.ts` (ADR-007). The MDXEditor `imageUploadHandler` posts a `File` to `/api/uploads` under field name `file` and reads `mediaUrl` from the response.
- **Code blocks**: CodeMirror 6 powers the language picker and syntax highlighting (`@codemirror/language-data`). Default block language `ts` to match the project's primary language.
- **No AI inside the editor (yet)**. Inline AI helpers (rewrite, expand, summarise) stay out of v1. They land naturally on this editor in a later phase via a slash-command plugin and a new `/api/chat/lesson-edit` SSE endpoint following ADR-006 + ADR-008.
- **No embeddings work**. ADR-012 (pgvector) and Phase 8/9 features remain unblocked by this change because the storage format does not move.

## Functional requirements

| Surface | Behaviour |
|---|---|
| Instructor lesson edit, **Text Content** tab | Renders a WYSIWYG editor instead of the markdown textarea. Toolbar exposes: undo/redo, bold/italic/underline, inline code, block-type select (paragraph, H1–H4, quote), bullet/numbered/checklist lists, create link, insert image, insert table, insert code block, insert thematic break. Markdown shortcuts (`#`, `*`, `>`, etc.) work for power users. |
| Initial state | If `Lesson.content` is null/empty, the editor shows an empty document with placeholder text. If it contains existing markdown (legacy textarea content), the editor renders it visually with no manual migration. |
| Saving | Editor `onChange(markdown)` updates the existing form state via the existing `useLessonEditor` hook. The save button and `lesson.updateContent` mutation are unchanged. |
| Image upload | Toolbar **Insert image** and paste/drop both call the existing `/api/uploads` endpoint. The returned `mediaUrl` is inserted as standard markdown `![alt](url)`. Failed uploads surface a toast; the markdown is not modified. |
| Student view | `CourseLearnView` continues rendering `Lesson.content` via `react-markdown` with no changes. |
| AI Quiz Generator | `getLessonContent` tool reads `Lesson.content` as before; the agent receives markdown text indistinguishable from legacy lessons. |

## Non-functional requirements

- The editor bundle (MDXEditor + CodeMirror language data ≈ a few hundred KB gzipped) must not load on the server or on routes other than the lesson edit page. `next/dynamic({ ssr: false })` enforces this.
- Existing lessons (any markdown body produced by the textarea era) must round-trip without loss after one open/save cycle. Standard markdown features only — no MDX, no custom directives.
- No new env var, no new migration, no new external service.

## New / modified files

| Action | Path | Purpose |
|---|---|---|
| New | `app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/InitializedMarkdownEditor.tsx` | Client component mounting `<MDXEditor>` with the chosen plugin set and toolbar; forwards ref. |
| New | `app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/index.tsx` | Public component wrapping `Initialized*` in `next/dynamic({ ssr: false })`. |
| New | `app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/imageUploadHandler.ts` | Adapter: `File` → POST `/api/uploads` (field `file`) → return `mediaUrl`. |
| New | `app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/styles.css` | Spacing/typography overrides so the editor sits cleanly inside `<Card>`; imports the editor's bundled stylesheet. |
| Modify | `app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/index.tsx` | Replace `<Textarea>` with `<MarkdownEditor markdown={content} onChange={onChange} />`. Remove the "Supports Markdown formatting" caption. |
| Modify | `package.json` | Add `@mdxeditor/editor`, `@codemirror/language-data`. |
| Modify | `docs/README.md` | Index entry under "Features — planned". |

## Out of scope

- Inline AI editor helpers (rewrite/expand/summarise/grammar) — separate spec, depends on ADR-008 lesson-assistant infrastructure and on this editor being in place.
- Embeddings / RAG over lesson chunks (ADR-012, Phase 8) — explicitly decoupled by keeping markdown as storage.
- Migrating lesson content schema to JSON or HTML — rejected; would require a serializer and break AI tools and the student renderer.
- A diff / source-view toggle — defer; markdown shortcuts cover power users for v1.
- Sandpack live React previews, frontmatter blocks, admonitions — out for v1 to keep bundle lean.
- A custom theme matching shadcn precisely — v1 ships with light theme overrides only; a dark-mode pass comes later if instructors ask for it.

## Estimated effort

| Task | Time |
|---|---|
| Install deps + scaffold the four new files | 0.5 h |
| Toolbar + plugin configuration | 1 h |
| Image upload adapter + integration | 0.5 h |
| Wire into `TextTab`, drop the textarea | 0.5 h |
| CSS spacing pass inside `<Card>` | 0.5 h |
| Manual verification per `validation.md` | 1 h |
| **Total** | **~4 h** |

## Future extensions

- **Inline AI commands** — `/ai rewrite`, `/ai expand`, `/ai grammar` via a slash-command plugin streaming through a new `/api/chat/lesson-edit` SSE endpoint (ADR-006 + ADR-008).
- **Diff view** — toggle to inspect raw markdown side-by-side with the WYSIWYG view.
- **Custom blocks** — callouts, video embeds, quiz inline previews. Would be implemented as MDXEditor JSX components and rendered on the student side via `react-markdown` plugins or a switch to MDX rendering.
- **Collaborative editing** — Yjs / Liveblocks integration if multi-instructor authoring becomes a thing.
