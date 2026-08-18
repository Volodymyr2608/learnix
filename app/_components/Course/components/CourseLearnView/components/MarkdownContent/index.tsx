import Markdown from "react-markdown";
import { SafeAnchor } from "@/app/_components/_shared/markdown/SafeAnchor";
import { authoredContentUrlPolicy } from "@/app/_components/_shared/markdown/urlPolicy";
import type { MarkdownContentProps } from "./types";

/**
 * Instructor-authored lesson bodies. Off-origin links are ordinary course
 * material and survive; off-origin images do not, because they load without a
 * click. No `rehype-raw`: the content is markdown, and enabling raw HTML would
 * hand an instructor a script tag in every enrolled student's browser.
 */
export const MarkdownContent = ({ content }: MarkdownContentProps) => (
	<div className="prose prose-sm dark:prose-invert max-w-none">
		<Markdown
			components={{ a: SafeAnchor }}
			urlTransform={authoredContentUrlPolicy}
		>
			{content}
		</Markdown>
	</div>
);
