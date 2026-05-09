"use client";

import "@mdxeditor/editor/style.css";
import "./styles.css";

import { languages } from "@codemirror/language-data";
import {
	BlockTypeSelect,
	BoldItalicUnderlineToggles,
	CodeToggle,
	CreateLink,
	codeBlockPlugin,
	codeMirrorPlugin,
	headingsPlugin,
	InsertCodeBlock,
	InsertImage,
	InsertTable,
	InsertThematicBreak,
	imagePlugin,
	ListsToggle,
	linkDialogPlugin,
	linkPlugin,
	listsPlugin,
	MDXEditor,
	type MDXEditorMethods,
	type MDXEditorProps,
	markdownShortcutPlugin,
	quotePlugin,
	Separator,
	tablePlugin,
	thematicBreakPlugin,
	toolbarPlugin,
	UndoRedo,
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
