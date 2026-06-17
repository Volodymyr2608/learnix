"use client";

import { useState } from "react";
import type { StudentRow } from "@/server/entities/instructor/students";
import { useStudentsUrl } from "../hooks/useStudentsUrl";
import { StudentDetailsDialog } from "../StudentDetailsDialog";
import { StudentsTable } from "../StudentsTable";
import type { SelectedStudent } from "../types";
import type { StudentsResultsProps } from "./types";

export function StudentsResults({ students }: StudentsResultsProps) {
	const { update, isPending } = useStudentsUrl();
	const [selectedStudent, setSelectedStudent] = useState<SelectedStudent>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);

	const handleViewDetails = (student: StudentRow) => {
		setSelectedStudent(student);
		setDetailsOpen(true);
	};

	return (
		<>
			<StudentsTable
				currentPage={students.currentPage}
				isLoading={isPending}
				lastPage={students.lastPage}
				onPageChange={(page) => update({ page })}
				onViewDetails={handleViewDetails}
				students={students.data}
			/>

			<StudentDetailsDialog
				onOpenChange={setDetailsOpen}
				open={detailsOpen}
				student={selectedStudent}
			/>
		</>
	);
}
