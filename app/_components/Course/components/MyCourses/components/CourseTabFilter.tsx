import Link from "next/link";
import { TABS } from "@/app/_components/Course/components/MyCourses/constants";
import type { Tab } from "@/app/_components/Course/components/MyCourses/types";
import { cn } from "@/lib/utils/cn";

type Props = {
	currentTab: Tab;
};

export const CourseTabFilter = ({ currentTab }: Props) => {
	return (
		<div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px]">
			{TABS.map((t) => (
				<Link
					className={cn(
						"inline-flex h-[calc(100%-1px)] items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1 font-medium text-sm transition-colors",
						currentTab === t.value
							? "border-input bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
					href={`/dashboard/courses?tab=${t.value}`}
					key={t.value}
				>
					{t.label}
				</Link>
			))}
		</div>
	);
};
