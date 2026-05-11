"use client";

import { Search } from "lucide-react";
import { Input } from "@/app/_components/_shared/ui/input";
import type { BrowseCoursesProps } from "@/app/_components/Course/components/BrowseCourses/types";
import BrowseCourseCard from "./components/BrowseCourseCard";
import { CategoryFilter } from "./components/CategoryFilter";
import { useBrowseSearch } from "./hooks/useBrowseSearch";

const BrowseCourses = ({
	courses,
	enrolledMap,
	q,
	category,
}: BrowseCoursesProps) => {
	const { search, handleSearch } = useBrowseSearch(q, category);

	return (
		<>
			<div className="relative">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="pl-10"
					onChange={(e) => handleSearch(e.target.value)}
					placeholder="Search for courses..."
					value={search}
				/>
			</div>

			<CategoryFilter category={category} search={search} />

			{courses.length > 0 ? (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{courses.map((course) => (
						<BrowseCourseCard
							course={course}
							isEnrolled={course.id in enrolledMap}
							key={course.id}
							nextLessonId={enrolledMap[course.id] ?? null}
						/>
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
