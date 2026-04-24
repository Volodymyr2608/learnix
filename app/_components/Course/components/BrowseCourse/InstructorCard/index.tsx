import { BookOpen, Star, Users } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { InstructorCardProps } from "@/app/_components/Course/components/BrowseCourse/InstructorCard/types";

const InstructorCard = ({ instructor }: InstructorCardProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Instructor</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-start gap-4">
					<Avatar className="h-20 w-20">
						<AvatarImage src={instructor.avatar || "/placeholder.svg"} />
						<AvatarFallback>{instructor.name[0]}</AvatarFallback>
					</Avatar>
					<div className="space-y-2">
						<h3 className="font-semibold text-lg">{instructor.name}</h3>
						<p className="text-muted-foreground text-sm">Instructor</p>
						<div className="flex flex-wrap gap-4 text-sm">
							<div className="flex items-center gap-1">
								<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
								<span>{instructor.rating} Instructor Rating</span>
							</div>
							<div className="flex items-center gap-1">
								<Users className="h-4 w-4" />
								<span>{instructor.students.toLocaleString()} Students</span>
							</div>
							<div className="flex items-center gap-1">
								<BookOpen className="h-4 w-4" />
								<span>{instructor.courses} Courses</span>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};

export default InstructorCard;
