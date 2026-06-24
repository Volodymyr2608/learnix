import { BookOpen, GraduationCap, Rocket } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import type { Tab } from "@/app/_components/Course/components/MyCourses/types";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import type { MyCoursesEmptyStateProps } from "./types";

const COPY: Record<
	Tab,
	{ icon: typeof BookOpen; title: string; description: string }
> = {
	all: {
		icon: BookOpen,
		title: "No courses yet",
		description:
			"You haven't enrolled in any courses. Browse the catalog and start your learning journey.",
	},
	"in-progress": {
		icon: Rocket,
		title: "Nothing in progress",
		description:
			"Courses you've started will show up here. Pick one and keep the momentum going.",
	},
	completed: {
		icon: GraduationCap,
		title: "No completed courses yet",
		description:
			"Finish a course and it will appear here, ready to revisit any time.",
	},
};

export function MyCoursesEmptyState({ currentTab }: MyCoursesEmptyStateProps) {
	const { icon: Icon, title, description } = COPY[currentTab];

	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-border border-dashed bg-card py-20 text-center">
			<div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
				<Icon className="h-8 w-8 text-primary" />
			</div>
			<h2 className="mt-5 font-semibold text-lg">{title}</h2>
			<p className="mt-1.5 max-w-sm text-muted-foreground text-sm">
				{description}
			</p>
			<Button asChild className="mt-6">
				<Link href={STUDENT_URLS.browseCourse}>Browse Courses</Link>
			</Button>
		</div>
	);
}