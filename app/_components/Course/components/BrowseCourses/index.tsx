"use client";

import { Search } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Input } from "@/app/_components/_shared/ui/input";
import BrowseCourseCard from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard";
import type { BrowseCoursesProps } from "@/app/_components/Course/components/BrowseCourses/types";
import CATEGORIES from "@/app/_components/Course/constants/categories";
import { api } from "@/trpc/client";

const BrowseCourses = ({ initialCourses }: BrowseCoursesProps) => {
	const { data: courses = [] } = api.course.getPublishedCourses.useQuery(
		undefined,
		{
			initialData: initialCourses,
			refetchOnWindowFocus: true,
			refetchOnMount: true,
		},
	);

	return (
		<>
			<div className="relative">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input className="pl-10" placeholder="Search for courses..." />
			</div>

			<div className="flex gap-2 overflow-x-auto pb-2">
				{CATEGORIES.map((category) => (
					<Button
						className="shrink-0"
						key={category}
						size="sm"
						variant={category === "All" ? "default" : "outline"}
					>
						{category}
					</Button>
				))}
			</div>

			{courses.length > 0 ? (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{courses.map((course) => (
						<BrowseCourseCard course={course} key={course.id} />
					))}
				</div>
			) : (
				<p className="text-center text-lg text-muted-foreground">
					No courses found.
				</p>
			)}
		</>
	);
};

export default BrowseCourses;
