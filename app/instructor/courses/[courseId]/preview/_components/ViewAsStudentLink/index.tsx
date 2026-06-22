import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import type { ViewAsStudentLinkProps } from "./types";

export function ViewAsStudentLink({
	courseId,
	isPublished,
}: ViewAsStudentLinkProps) {
	if (!isPublished) return null;
	return (
		<Button asChild className="w-full" variant="outline">
			<Link href={STUDENT_URLS.courseDetail(courseId)}>
				<ExternalLink className="mr-2 h-4 w-4" />
				View as student
			</Link>
		</Button>
	);
}
