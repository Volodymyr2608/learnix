import { ArrowUpDown, BookOpen, Filter, Search } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import type { GetStudentsInput } from "@/server/entities/instructor/students";
import type { StudentsFiltersProps } from "./types";

export function StudentsFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	courseId,
	onCourseChange,
	sort,
	onSortChange,
	courses,
}: StudentsFiltersProps) {
	return (
		<Card className="p-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="relative flex-1 md:max-w-sm">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search students..."
						value={search}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<Select
						onValueChange={(v) =>
							onStatusChange(v as GetStudentsInput["status"])
						}
						value={status}
					>
						<SelectTrigger className="w-[140px]">
							<Filter className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="completed">Completed</SelectItem>
							<SelectItem value="inactive">Inactive</SelectItem>
						</SelectContent>
					</Select>
					<Select onValueChange={onCourseChange} value={courseId}>
						<SelectTrigger className="w-[220px]">
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
						onValueChange={(v) => onSortChange(v as GetStudentsInput["sort"])}
						value={sort}
					>
						<SelectTrigger className="w-[160px]">
							<ArrowUpDown className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="recent">Most Recent</SelectItem>
							<SelectItem value="name">Name</SelectItem>
							<SelectItem value="progress">Progress</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
		</Card>
	);
}
