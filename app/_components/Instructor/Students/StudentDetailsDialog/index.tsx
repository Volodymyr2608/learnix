import { CheckCircle2, XCircle } from "lucide-react";
import {
	DialogBody,
	ScrollableDialogContent,
} from "@/app/_components/_shared/components/ScrollableDialog";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Dialog,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { formatLastActive, getInitials, statusBadgeClass } from "../utils";
import type { StudentDetailsDialogProps } from "./types";

export function StudentDetailsDialog({
	student,
	open,
	onOpenChange,
}: StudentDetailsDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<ScrollableDialogContent className="max-w-2xl">
				{student && (
					<>
						<DialogHeader>
							<DialogTitle>Student Details</DialogTitle>
							<DialogDescription>
								View detailed information about this student
							</DialogDescription>
						</DialogHeader>
						<DialogBody className="space-y-6 py-4">
							<div className="flex items-center gap-4">
								<Avatar className="h-16 w-16">
									<AvatarImage
										alt={student.name}
										src={student.image || undefined}
									/>
									<AvatarFallback className="bg-primary/10 text-primary text-xl">
										{getInitials(student.name)}
									</AvatarFallback>
								</Avatar>
								<div>
									<h3 className="font-semibold text-xl">{student.name}</h3>
									<p className="text-muted-foreground">{student.email}</p>
									<div className="mt-1 flex items-center gap-2">
										<Badge
											className={statusBadgeClass(student.status)}
											variant="outline"
										>
											{student.status.charAt(0).toUpperCase() +
												student.status.slice(1)}
										</Badge>
										<span className="text-muted-foreground text-sm">
											Joined{" "}
											{student.joinedAt.toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</span>
									</div>
								</div>
							</div>

							<div className="rounded-lg border p-4">
								<div className="flex items-center justify-between">
									<span className="font-medium">Overall Progress</span>
									<span className="font-bold text-lg">
										{student.overallProgress}%
									</span>
								</div>
								<Progress
									className="mt-2 h-2"
									value={student.overallProgress}
								/>
								<p className="mt-2 text-muted-foreground text-sm">
									Last active: {formatLastActive(student.lastActiveAt)}
								</p>
							</div>

							<div>
								<h4 className="mb-3 font-medium">Enrolled Courses</h4>
								<div className="space-y-3">
									{student.courses.map((course) => (
										<div
											className="rounded-lg border p-4"
											key={course.courseId}
										>
											<div className="flex items-start justify-between">
												<div className="flex-1">
													<div className="flex items-center gap-2">
														<h5 className="font-medium">{course.title}</h5>
														<CourseStatusIcon
															completed={course.completed}
															progress={course.progress}
														/>
													</div>
													<div className="mt-2 flex items-center gap-3">
														<Progress
															className="flex-1"
															value={course.progress}
														/>
														<span className="font-medium text-sm">
															{course.progress}%
														</span>
													</div>
												</div>
											</div>
											<div className="mt-2">
												<Badge
													className={
														course.completed
															? "border-green-500/20 bg-green-500/10 text-green-600"
															: "border-blue-500/20 bg-blue-500/10 text-blue-600"
													}
													variant="outline"
												>
													{course.completed ? "Completed" : "In Progress"}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</div>
						</DialogBody>
					</>
				)}
			</ScrollableDialogContent>
		</Dialog>
	);
}

function CourseStatusIcon({
	completed,
	progress,
}: {
	completed: boolean;
	progress: number;
}) {
	if (completed) return <CheckCircle2 className="h-4 w-4 text-green-600" />;
	if (progress < 20) return <XCircle className="h-4 w-4 text-gray-400" />;
	return null;
}
