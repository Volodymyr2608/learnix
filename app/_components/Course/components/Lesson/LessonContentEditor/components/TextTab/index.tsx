import { MarkdownEditor } from "@/app/_components/_shared/components/MarkdownEditor";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
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
