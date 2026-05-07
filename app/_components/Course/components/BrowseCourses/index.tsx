"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/app/_components/_shared/ui/input";
import BrowseCourseCard from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard";
import type { BrowseCoursesProps } from "@/app/_components/Course/components/BrowseCourses/types";
import CATEGORIES from "@/app/_components/Course/constants/categories";
import { cn } from "@/lib/utils/cn";

function toSlug(cat: string): string {
	return cat.toLowerCase().replace(/\s+/g, "-");
}

function buildCategoryHref(cat: string, q: string): string {
	const params = new URLSearchParams();
	if (q) params.set("q", q);
	if (cat !== "All") params.set("category", toSlug(cat));
	const qs = params.toString();
	return `/dashboard/browse${qs ? `?${qs}` : ""}`;
}

const BrowseCourses = ({
	courses,
	enrolledMap,
	q,
	category,
}: BrowseCoursesProps) => {
	const router = useRouter();
	const [search, setSearch] = useState(q);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		setSearch(q);
	}, [q]);

	const handleSearch = useCallback(
		(value: string) => {
			setSearch(value);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				const params = new URLSearchParams();
				if (value) params.set("q", value);
				if (category && category !== "all") params.set("category", category);
				const qs = params.toString();
				router.push(`/dashboard/browse${qs ? `?${qs}` : ""}`);
			}, 300);
		},
		[category, router],
	);

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

			<div className="flex gap-2 overflow-x-auto pb-2">
				{CATEGORIES.map((cat) => {
					const isActive =
						cat === "All" ? category === "all" : category === toSlug(cat);
					return (
						<Link
							className={cn(
								"inline-flex shrink-0 items-center justify-center rounded-md border px-3 py-1 font-medium text-sm transition-colors",
								isActive
									? "border-primary bg-primary text-primary-foreground"
									: "border-input bg-background hover:bg-muted",
							)}
							href={buildCategoryHref(cat, search)}
							key={cat}
						>
							{cat}
						</Link>
					);
				})}
			</div>

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
