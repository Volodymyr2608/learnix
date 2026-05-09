"use client";

import type { MDXEditorMethods, MDXEditorProps } from "@mdxeditor/editor";
import dynamic from "next/dynamic";
import { forwardRef } from "react";

const Editor = dynamic(() => import("./InitializedMarkdownEditor"), {
	ssr: false,
});

export const MarkdownEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
	(props, ref) => <Editor {...props} editorRef={ref} />,
);

MarkdownEditor.displayName = "MarkdownEditor";
