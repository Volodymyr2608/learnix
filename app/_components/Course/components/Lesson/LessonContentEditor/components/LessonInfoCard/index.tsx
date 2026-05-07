import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import type { LessonInfoCardProps } from "./types";

export const LessonInfoCard = ({ data, onUpdate }: LessonInfoCardProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Lesson Information</CardTitle>
				<CardDescription>Basic details about this lesson</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="lessonTitle">Lesson Title</Label>
						<Input
							id="lessonTitle"
							onChange={(e) => onUpdate({ title: e.target.value })}
							placeholder="Enter lesson title"
							value={data.title}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="duration">Duration (mm:ss)</Label>
						<Input
							id="duration"
							onChange={(e) => onUpdate({ duration: e.target.value })}
							placeholder="15:30"
							value={data.duration}
						/>
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor="description">Description</Label>
					<Textarea
						id="description"
						onChange={(e) => onUpdate({ description: e.target.value })}
						placeholder="Brief description of what students will learn"
						rows={2}
						value={data.description}
					/>
				</div>
			</CardContent>
		</Card>
	);
};
