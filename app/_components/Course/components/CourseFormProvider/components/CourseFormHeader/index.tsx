import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import type { CourseFormHeaderProps } from "@/app/_components/Course/components/CourseFormProvider/components/CourseFormHeader/types";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";

const CourseFormHeader = ({
	children,
	title,
	description,
}: CourseFormHeaderProps) => {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				<Link href={INSTRUCTOR_URLS.courses}>
					<Button size="icon" variant="ghost">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">{title}</h1>
					<p className="text-muted-foreground">{description}</p>
				</div>
			</div>

			{children}
		</div>
	);
};

export default CourseFormHeader;
