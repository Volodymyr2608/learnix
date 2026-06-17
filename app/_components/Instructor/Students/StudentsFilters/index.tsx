"use client";

import { ArrowUpDown, BookOpen, Filter, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import { SORT_OPTIONS } from "@/app/_components/Instructor/Students/StudentsFilters/constants/sortOptions";
import { STATUS_OPTIONS } from "@/app/_components/Instructor/Students/StudentsFilters/constants/statusOptions";
import type { GetStudentsInput } from "@/server/entities/instructor/students";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useStudentsUrl } from "../hooks/useStudentsUrl";
import type { StudentsFiltersProps } from "./types";

export function StudentsFilters({ query, courses }: StudentsFiltersProps) {
	const { update } = useStudentsUrl();
	const [search, setSearch] = useState(query.q);
	const debouncedSearch = useDebouncedValue(search, 300);

	// Keep the input in sync when the URL changes (e.g. back/forward navigation).
	useEffect(() => {
		setSearch(query.q);
	}, [query.q]);

	// Push the debounced search term to the URL once typing settles.
	// biome-ignore lint/correctness/useExhaustiveDependencies: update is stable per render of searchParams; reacting only to the debounced value is intentional
	useEffect(() => {
		if (debouncedSearch !== query.q) {
			update({ q: debouncedSearch });
		}
	}, [debouncedSearch]);

	return (
		<Card className="p-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="relative flex-1 md:max-w-sm">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search students..."
						value={search}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<Select
						onValueChange={(v) =>
							update({ status: v as GetStudentsInput["status"] })
						}
						value={query.status}
					>
						<SelectTrigger className="w-37">
							<Filter className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							{STATUS_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						onValueChange={(courseId) => update({ courseId })}
						value={query.courseId}
					>
						<SelectTrigger className="w-55">
							<BookOpen className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Course" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Courses</SelectItem>
							{courses.map((course) => (
								<SelectItem key={course.id} value={course.id}>
									{course.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						onValueChange={(v) =>
							update({ sort: v as GetStudentsInput["sort"] })
						}
						value={query.sort}
					>
						<SelectTrigger className="w-42">
							<ArrowUpDown className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							{SORT_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</Card>
	);
}
