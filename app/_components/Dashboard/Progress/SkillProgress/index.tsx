import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { SkillProgressProps, SkillProgressRowProps } from "./types";

function SkillProgressRow({ item }: SkillProgressRowProps) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium">{item.skill}</p>
					<p className="text-muted-foreground text-sm">
						{item.completed} completed
					</p>
				</div>
				<span className="font-medium text-sm">{item.level}%</span>
			</div>
			<Progress value={item.level} />
		</div>
	);
}

export default function SkillProgress({ items }: SkillProgressProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Skill Progress</CardTitle>
				<CardDescription>
					Your proficiency across different skills
				</CardDescription>
			</CardHeader>
			<CardContent>
				{items.length === 0 && (
					<p className="text-muted-foreground text-sm">
						Enroll in courses to start building skills.
					</p>
				)}
				{items.length > 0 && (
					<div className="space-y-6">
						{items.map((item) => (
							<SkillProgressRow item={item} key={item.skillId} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
