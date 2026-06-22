import { Award, Clock, Globe, Star, Users } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import CourseContent from "@/app/_components/Course/components/BrowseCourse/CourseContent";
import CourseDetailEnrollCard from "@/app/_components/Course/components/BrowseCourse/CourseDetailEnrollCard";
import DescriptionCard from "@/app/_components/Course/components/BrowseCourse/DescriptionCard";
import InstructorCard from "@/app/_components/Course/components/BrowseCourse/InstructorCard";
import ObjectivesCard from "@/app/_components/Course/components/BrowseCourse/ObjectivesCard";
import RequirementsCard from "@/app/_components/Course/components/BrowseCourse/RequirementsCard";
import StudentFeedbackCard from "@/app/_components/Course/components/BrowseCourse/StudentFeedbackCard";
import { capitalize } from "@/lib/utils/capitalize";
import type { CourseDetailViewProps } from "./types";

const CourseDetailView = ({ course, previewMode }: CourseDetailViewProps) => {
	return (
		<div className="grid gap-6 lg:grid-cols-3">
			<div className="space-y-6 lg:col-span-2">
				<div className="space-y-2">
					<Badge>{capitalize(course.category)}</Badge>
					<h1 className="font-bold text-3xl tracking-tight">{course.title}</h1>
					<p className="text-lg text-muted-foreground">{course.subtitle}</p>
				</div>

				<div className="flex flex-wrap items-center gap-4 text-sm">
					<div className="flex items-center gap-1">
						<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
						<span className="font-semibold">{course.rating}</span>
						<span className="text-muted-foreground">
							({course.reviewCount.toLocaleString()} reviews)
						</span>
					</div>
					<div className="flex items-center gap-1 text-muted-foreground">
						<Users className="h-4 w-4" />
						<span>{course.students.toLocaleString()} students</span>
					</div>
					<div className="flex items-center gap-1 text-muted-foreground">
						<Clock className="h-4 w-4" />
						<span>{course.duration} hours</span>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<Avatar>
						<AvatarImage src={course.instructor.avatar || "/placeholder.svg"} />
						<AvatarFallback>{course.instructor.name[0]}</AvatarFallback>
					</Avatar>
					<div>
						<p className="font-medium text-sm">
							Created by {course.instructor.name}
						</p>
						<p className="text-muted-foreground text-xs">Instructor</p>
					</div>
				</div>

				<div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
					<div className="flex items-center gap-1">
						<Globe className="h-4 w-4" />
						<span>{capitalize(course.language)}</span>
					</div>
					<div className="flex items-center gap-1">
						<Award className="h-4 w-4" />
						<span>{capitalize(course.level)}</span>
					</div>
					<span>Last updated {course.lastUpdated}</span>
				</div>
				<ObjectivesCard objectives={course.objectives} />
				<CourseContent curriculum={course.curriculum} />
				<RequirementsCard requirements={course.requirements} />
				<DescriptionCard description={course.description} />
				<InstructorCard instructor={course.instructor} />
				<StudentFeedbackCard
					rating={course.rating}
					ratingDistribution={course.ratingDistribution}
					reviews={course.reviews}
				/>
			</div>
			<div className="lg:sticky lg:top-4 lg:self-start">
				<CourseDetailEnrollCard course={course} previewMode={previewMode} />
			</div>
		</div>
	);
};

export default CourseDetailView;
