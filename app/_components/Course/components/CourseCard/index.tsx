import { BarChart, Edit, Eye } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { CourseCardProps } from "@/app/_components/Course/components/CourseCard/types";
import DeleteCourseButton from "@/app/_components/Course/components/DeleteCourseButton";
import { STATUS_COURSE } from "@/lib/constants/statusCourse";
import { STATUS_VARIANT } from "@/lib/constants/statusVariants";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import updatedLabel from "@/lib/utils/date/updatedLabel";

const CourseCard = ({ course }: CourseCardProps) => {
	return (
		<Card className="overflow-hidden">
			<div className="relative aspect-video w-full overflow-hidden bg-muted">
				<Image
					alt={course.title}
					className="h-full w-full object-cover"
					fill
					src={course.thumbnailUrl || "/placeholder.svg"}
				/>
			</div>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<CardTitle className="line-clamp-1">{course.title}</CardTitle>
						<CardDescription className="mt-1">
							{updatedLabel(new Date(course.updatedAt))}
						</CardDescription>
					</div>
					<Badge variant={STATUS_VARIANT[course.status]}>
						{STATUS_COURSE[course.status]}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-4 text-center">
					<div>
						<p className="font-bold text-2xl">{"-"}</p>
						<p className="text-muted-foreground text-xs">Students</p>
					</div>
					<div>
						<p className="font-bold text-2xl">{"-"}</p>
						<p className="text-muted-foreground text-xs">Rating</p>
					</div>
					<div>
						<p className="font-bold text-2xl">{"-"}</p>
						<p className="text-muted-foreground text-xs">Revenue</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button asChild className="flex-1 bg-transparent" variant="outline">
						<Link href={INSTRUCTOR_URLS.editCourse(course.id)}>
							<Edit className="mr-2 h-4 w-4" />
							Edit
						</Link>
					</Button>
					<Button asChild className="flex-1 bg-transparent" variant="outline">
						<Link href={INSTRUCTOR_URLS.previewCourse(course.id)}>
							<Eye className="mr-2 h-4 w-4" />
							Preview
						</Link>
					</Button>
					<Button asChild size="icon" variant="outline">
						<Link href={`/instructor/courses/${course.id}/analytics`}>
							<BarChart className="h-4 w-4" />
						</Link>
					</Button>
					<DeleteCourseButton
						course={{
							id: course.id,
							title: course.title,
						}}
					/>
				</div>
			</CardContent>
		</Card>
	);
};

export default CourseCard;
