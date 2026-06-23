# Plan: Lesson Rich Text Editor (WYSIWYG over Markdown)

## Implementation order

1. Install deps.
2. Image upload adapter.
3. Initialized client editor (plugins + toolbar).
4. Dynamic SSR-off wrapper.
5. Editor styles.
6. Wire into `TextTab`.
7. Verify per `validation.md`.

---

## Step 1 — Dependencies

```bash
pnpm add @mdxeditor/editor @codemirror/language-data
```

Both are MIT, pure-React/TS, no native bindings. `@codemirror/language-data` is what feeds MDXEditor's code-block language picker; without it the picker is empty.

---

## Step 2 — Image upload adapter

The existing `/api/uploads` endpoint (`app/api/uploads/route.ts`) accepts a multipart field named `file` and responds `{ mediaUrl: string }`. MDXEditor's `imageUploadHandler` contract is `(image: File) => Promise<string>` returning the public URL. Wrap the call:

```ts
// app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/imageUploadHandler.ts
export async function imageUploadHandler(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? "Failed to upload image");
  }

  const { mediaUrl } = (await response.json()) as { mediaUrl: string };
  return mediaUrl;
}
```

The throw surfaces in MDXEditor as a toast on the toolbar; the markdown document is left untouched.

---

## Step 3 — Initialized client editor

```tsx
// app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/InitializedMarkdownEditor.tsx
"use client";

import "@mdxeditor/editor/style.css";
import "./styles.css";

import { languages } from "@codemirror/language-data";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import type { ForwardedRef } from "react";

import { imageUploadHandler } from "./imageUploadHandler";

type Props = {
  editorRef: ForwardedRef<MDXEditorMethods> | null;
} & MDXEditorProps;

export default function InitializedMarkdownEditor({
  editorRef,
  ...props
}: Props) {
  return (
    <MDXEditor
      contentEditableClassName="lesson-markdown-editor__content"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        imagePlugin({ imageUploadHandler }),
        tablePlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: "ts" }),
        codeMirrorPlugin({
          codeBlockLanguages: languages,
          autoLoadLanguageSupport: true,
        }),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarClassName: "lesson-markdown-editor__toolbar",
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BoldItalicUnderlineToggles />
              <CodeToggle />
              <Separator />
              <BlockTypeSelect />
              <ListsToggle />
              <Separator />
              <CreateLink />
              <InsertImage />
              <InsertTable />
              <InsertCodeBlock />
              <InsertThematicBreak />
            </>
          ),
        }),
      ]}
      {...props}
      ref={editorRef}
    />
  );
}
```

This is the **only** file that imports MDXEditor internals directly.

---

## Step 4 — Dynamic SSR-off wrapper

```tsx
// app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/index.tsx
"use client";

import {
  type MDXEditorMethods,
  type MDXEditorProps,
} from "@mdxeditor/editor";
import dynamic from "next/dynamic";
import { forwardRef } from "react";

const Editor = dynamic(() => import("./InitializedMarkdownEditor"), {
  ssr: false,
});

export const MarkdownEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
  (props, ref) => <Editor {...props} editorRef={ref} />,
);

MarkdownEditor.displayName = "MarkdownEditor";
```

Using a `forwardRef` lets us call `.setMarkdown()`, `.getMarkdown()` from outside if we ever need imperative control (e.g. the future inline-AI feature inserting text at the cursor). The current `TextTab` does not need the ref but exposing it costs nothing.

---

## Step 5 — Styles

Two imports happen in `InitializedMarkdownEditor.tsx`:

1. `@mdxeditor/editor/style.css` — the library's bundled styles (toolbar, prose, popovers).
2. `./styles.css` — local overrides for visual fit inside our card.

```css
/* app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/components/MarkdownEditor/styles.css */

.lesson-markdown-editor__toolbar {
  border-radius: 0.5rem 0.5rem 0 0;
  border-bottom: 1px solid hsl(var(--border));
}

.lesson-markdown-editor__content {
  min-height: 360px;
  padding: 1rem;
  font-family: var(--font-sans);
  font-size: 0.95rem;
  line-height: 1.6;
}

.lesson-markdown-editor__content :where(h1, h2, h3, h4) {
  font-weight: 600;
  margin-top: 1.25em;
  margin-bottom: 0.5em;
}

.lesson-markdown-editor__content code {
  font-family: var(--font-mono);
}
```

No Tailwind classes here — MDXEditor builds its own DOM tree and `@apply` against shadcn variables would require dropping into PostCSS. CSS variables are good enough for v1.

---

## Step 6 — Wire into `TextTab`

```tsx
// app/_components/Course/components/Lesson/LessonContentEditor/components/TextTab/index.tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/_shared/ui/card";
import { MarkdownEditor } from "./components/MarkdownEditor";
import type { TextTabProps } from "./types";

export const TextTab = ({ content, onChange }: TextTabProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Text Content</CardTitle>
        <CardDescription>
          Add written content, notes, or transcripts for this lesson
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MarkdownEditor markdown={content ?? ""} onChange={onChange} />
      </CardContent>
    </Card>
  );
};
```

`useLessonEditor`'s `updateLessonData({ textContent: value })` already accepts the same `string` shape MDXEditor emits, so no hook changes.

The `Textarea` import is removed; the "Supports Markdown formatting" caption is removed (the toolbar makes it self-evident).

---

## What does not change

- `Lesson.content` schema — still `String? @db.Text`.
- `LessonContentUpdateDto` — still `z.string().nullable().optional()`.
- `lesson.updateContent` tRPC procedure (`server/api/routers/lesson.ts`).
- `lessonService.updateLessonContent` (`server/services/lesson/lesson.service.ts`).
- Student render in `CourseLearnView` (`react-markdown`).
- `/api/uploads` endpoint shape.
- AI Quiz Generator's `getLessonContent` tool.

This decoupling is the whole point of the spec: a UX upgrade that is invisible to every other layer.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bundle size on the lesson edit page jumps | `next/dynamic({ ssr: false })` keeps it off the server bundle and out of every other route. The lesson edit page is instructor-only and infrequently loaded. |
| Markdown round-trip drift on legacy lessons | MDXEditor preserves CommonMark + GFM faithfully; the manual verification matrix in `validation.md` covers headings, lists, code, tables, links, images, blockquotes. Exotic raw HTML inside markdown is the only realistic failure mode and is not used by existing lessons. |
| `next/dynamic` + `ssr: false` warnings | The `'use client'` boundary on both files plus the import-only-here rule prevents Lexical (MDXEditor's underlying engine) from touching the server bundle. |
| Image upload coupling to a specific endpoint shape | The adapter is one file with one fetch call; if `/api/uploads` ever changes its contract, only `imageUploadHandler.ts` changes. |
