import {
	BookOpen,
	Brain,
	Calendar,
	Clock,
	Compass,
	Flame,
	GraduationCap,
	type LucideIcon,
	Star,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { AchievementIconKey } from "@/server/entities/student/achievements";
import type { AchievementRowProps, AchievementsProps } from "./types";

const ICONS: Record<AchievementIconKey, LucideIcon> = {
	graduation: GraduationCap,
	compass: Compass,
	flame: Flame,
	calendar: Calendar,
	clock: Clock,
	book: BookOpen,
	brain: Brain,
	star: Star,
};

function AchievementRow({ item }: AchievementRowProps) {
	const Icon = ICONS[item.icon];
	return (
		<div className="flex items-start gap-4">
			<div
				className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
					item.earned
						? "bg-primary text-primary-foreground"
						: "bg-muted text-muted-foreground"
				}`}
			>
				<Icon className="h-6 w-6" />
			</div>
			<div className="flex-1 space-y-1">
				<p className={`font-medium ${!item.earned && "text-muted-foreground"}`}>
					{item.title}
				</p>
				<p className="text-muted-foreground text-sm">{item.description}</p>
				{!item.earned && (
					<div className="space-y-1 pt-1">
						<Progress value={(item.current / item.target) * 100} />
						<p className="text-muted-foreground text-xs">
							{item.current} / {item.target}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

export default function Achievements({ items }: AchievementsProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Achievements</CardTitle>
				<CardDescription>Your earned badges and milestones</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="max-h-[22rem] space-y-4 overflow-y-auto pr-2">
					{items.map((item) => (
						<AchievementRow item={item} key={item.key} />
					))}
				</div>
			</CardContent>
		</Card>
	);
}
