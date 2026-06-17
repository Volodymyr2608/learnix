"use client";

import { useEffect, useState } from "react";
import type { StudentRow } from "@/server/entities/instructor/students";
import { api } from "@/trpc/client";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { StudentDetailsDialog } from "./StudentDetailsDialog";
import { StudentsFilters } from "./StudentsFilters";
import { StudentsStatsCards } from "./StudentsStatsCards";
import { StudentsTable } from "./StudentsTable";
import type { StudentsQueryState } from "./types";

export function Students() {
	const [query, setQuery] = useState<StudentsQueryState>({
		q: "",
		status: "all",
		courseId: "all",
		sort: "recent",
		page: 1,
	});
	const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(
		null,
	);
	const [detailsOpen, setDetailsOpen] = useState(false);

	const debouncedSearch = useDebouncedValue(query.q, 300);

	// biome-ignore lint/correctness/useExhaustiveDependencies: page must not retrigger itself
	useEffect(() => {
		setQuery((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
	}, [debouncedSearch, query.status, query.courseId, query.sort]);

	const counts = api.instructor.getStudentStatusCounts.useQuery();
	const ownCourses = api.course.getOwnCourses.useQuery();
	const students = api.instructor.getStudents.useQuery({
		q: debouncedSearch || undefined,
		status: query.status,
		courseId: query.courseId === "all" ? undefined : query.courseId,
		sort: query.sort,
		page: query.page,
	});

	const handleViewDetails = (student: StudentRow) => {
		setSelectedStudent(student);
		setDetailsOpen(true);
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Students</h1>
				<p className="text-muted-foreground">
					Manage and track your students&apos; progress
				</p>
			</div>

			<StudentsStatsCards counts={counts.data} isLoading={counts.isLoading} />

			<StudentsFilters
				courseId={query.courseId}
				courses={(ownCourses.data ?? []).map((c) => ({
					id: c.id,
					title: c.title,
				}))}
				onCourseChange={(courseId) => setQuery((p) => ({ ...p, courseId }))}
				onSearchChange={(q) => setQuery((p) => ({ ...p, q }))}
				onSortChange={(sort) => setQuery((p) => ({ ...p, sort }))}
				onStatusChange={(status) => setQuery((p) => ({ ...p, status }))}
				search={query.q}
				sort={query.sort}
				status={query.status}
			/>

			<StudentsTable
				currentPage={students.data?.currentPage ?? 1}
				isLoading={students.isLoading}
				lastPage={students.data?.lastPage ?? 1}
				onPageChange={(page) => setQuery((p) => ({ ...p, page }))}
				onViewDetails={handleViewDetails}
				students={students.data?.data ?? []}
			/>

			<StudentDetailsDialog
				onOpenChange={setDetailsOpen}
				open={detailsOpen}
				student={selectedStudent}
			/>
		</div>
	);
}
