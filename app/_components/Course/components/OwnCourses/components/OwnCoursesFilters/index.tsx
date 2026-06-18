"use client";

import { ArrowUpDown, Filter, Search, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/app/_components/_shared/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import {
	CATEGORY_OPTIONS,
	SORT_OPTIONS,
	STATUS_OPTIONS,
} from "@/app/_components/Course/components/OwnCourses/constants";
import { useOwnCoursesUrl } from "@/app/_components/Course/components/OwnCourses/hooks/useOwnCoursesUrl";
import { useDebouncedValue } from "@/app/_components/Instructor/Students/hooks/useDebouncedValue";
import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";
import type { OwnCoursesFiltersProps } from "./types";

export function OwnCoursesFilters({ query }: OwnCoursesFiltersProps) {
	const { update } = useOwnCoursesUrl();
	const [search, setSearch] = useState(query.q);
	const debouncedSearch = useDebouncedValue(search, 300);

	// Keep the input in sync when the URL changes (e.g. back/forward navigation).
	useEffect(() => {
		setSearch(query.q);
	}, [query.q]);

	// Push the debounced search term to the URL once typing settles.
	// biome-ignore lint/correctness/useExhaustiveDependencies: react only to the debounced value
	useEffect(() => {
		if (debouncedSearch !== query.q) {
			update({ q: debouncedSearch });
		}
	}, [debouncedSearch]);

	return (
		<div className="flex flex-col gap-4 md:flex-row">
			<div className="relative flex-1">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="pl-10"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search your courses..."
					value={search}
				/>
			</div>
			<Select
				onValueChange={(v) =>
					update({ status: v as GetOwnCoursesInput["status"] })
				}
				value={query.status}
			>
				<SelectTrigger className="w-40">
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
				onValueChange={(category) => update({ category })}
				value={query.category}
			>
				<SelectTrigger className="w-44">
					<Tag className="mr-2 h-4 w-4" />
					<SelectValue placeholder="Category" />
				</SelectTrigger>
				<SelectContent>
					{CATEGORY_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				onValueChange={(v) => update({ sort: v as GetOwnCoursesInput["sort"] })}
				value={query.sort}
			>
				<SelectTrigger className="w-44">
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
	);
}
