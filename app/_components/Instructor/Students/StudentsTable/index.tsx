import { Eye, Mail, MoreHorizontal, Users } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { formatLastActive, getInitials, statusBadgeClass } from "../utils";
import type { StudentsTableProps, StudentTableRowProps } from "./types";

function StudentTableRow({ student, onViewDetails }: StudentTableRowProps) {
	return (
		<tr className="border-b last:border-0 hover:bg-muted/30">
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Avatar className="h-10 w-10">
						<AvatarImage alt={student.name} src={student.image || undefined} />
						<AvatarFallback className="bg-primary/10 text-primary">
							{getInitials(student.name)}
						</AvatarFallback>
					</Avatar>
					<div>
						<p className="font-medium">{student.name}</p>
						<p className="text-muted-foreground text-sm">{student.email}</p>
					</div>
				</div>
			</td>
			<td className="px-6 py-4">
				<div className="flex flex-wrap gap-1">
					{student.courses.slice(0, 2).map((course) => (
						<Badge
							className="text-xs"
							key={course.courseId}
							variant="secondary"
						>
							{course.title.length > 20
								? `${course.title.substring(0, 20)}...`
								: course.title}
						</Badge>
					))}
					{student.courses.length > 2 && (
						<Badge className="text-xs" variant="outline">
							+{student.courses.length - 2} more
						</Badge>
					)}
				</div>
			</td>
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Progress className="w-24" value={student.overallProgress} />
					<span className="font-medium text-sm">
						{student.overallProgress}%
					</span>
				</div>
			</td>
			<td className="px-6 py-4">
				<span className="text-muted-foreground text-sm">
					{formatLastActive(student.lastActiveAt)}
				</span>
			</td>
			<td className="px-6 py-4">
				<Badge className={statusBadgeClass(student.status)} variant="outline">
					{student.status.charAt(0).toUpperCase() + student.status.slice(1)}
				</Badge>
			</td>
			<td className="px-6 py-4 text-right">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => onViewDetails(student)}>
							<Eye className="mr-2 h-4 w-4" />
							View Details
						</DropdownMenuItem>
						<DropdownMenuItem disabled>
							<Mail className="mr-2 h-4 w-4" />
							Send Message
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</td>
		</tr>
	);
}

export function StudentsTable({
	students,
	isLoading,
	currentPage,
	lastPage,
	onPageChange,
	onViewDetails,
}: StudentsTableProps) {
	return (
		<Card>
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b bg-muted/50">
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Student
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Enrolled Courses
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Progress
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Last Active
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Status
							</th>
							<th className="px-6 py-4 text-right font-medium text-muted-foreground text-sm">
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{students.map((student) => (
							<StudentTableRow
								key={student.id}
								onViewDetails={onViewDetails}
								student={student}
							/>
						))}
					</tbody>
				</table>
			</div>

			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<p className="text-muted-foreground text-sm">Loading students…</p>
				</div>
			)}

			{!isLoading && students.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12">
					<Users className="h-12 w-12 text-muted-foreground" />
					<p className="mt-4 font-medium text-lg">No students found</p>
					<p className="text-muted-foreground text-sm">
						Try adjusting your search or filter criteria
					</p>
				</div>
			)}

			{!isLoading && students.length > 0 && lastPage > 1 && (
				<div className="flex items-center justify-between border-t px-6 py-4">
					<span className="text-muted-foreground text-sm">
						Page {currentPage} of {lastPage}
					</span>
					<div className="flex gap-2">
						<Button
							disabled={currentPage <= 1}
							onClick={() => onPageChange(currentPage - 1)}
							size="sm"
							variant="outline"
						>
							Previous
						</Button>
						<Button
							disabled={currentPage >= lastPage}
							onClick={() => onPageChange(currentPage + 1)}
							size="sm"
							variant="outline"
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</Card>
	);
}
