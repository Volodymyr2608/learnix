import { Eye } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import type { PreviewButtonProps } from "@/app/_components/Course/components/PreviewButton/types";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";

const PreviewButton = ({ courseId }: PreviewButtonProps) => {
	if (!courseId) return null;

	return (
		<Button asChild variant="outline">
			<Link href={INSTRUCTOR_URLS.previewCourse(courseId)}>
				<Eye className="mr-2 h-4 w-4" />
				Preview
			</Link>
		</Button>
	);
};

export default PreviewButton;
