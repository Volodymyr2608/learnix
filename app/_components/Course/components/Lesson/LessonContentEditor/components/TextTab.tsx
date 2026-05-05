import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Textarea } from "@/app/_components/_shared/ui/textarea";

interface TextTabProps {
	content: string;
	onChange: (value: string) => void;
}

export function TextTab({ content, onChange }: TextTabProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Text Content</CardTitle>
				<CardDescription>
					Add written content, notes, or transcripts for this lesson
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Textarea
					className="font-mono text-sm"
					onChange={(e) => onChange(e.target.value)}
					placeholder="Write your lesson content here. You can include explanations, code examples, tips, etc."
					rows={15}
					value={content}
				/>
				<p className="mt-2 text-muted-foreground text-sm">
					Supports Markdown formatting
				</p>
			</CardContent>
		</Card>
	);
}
