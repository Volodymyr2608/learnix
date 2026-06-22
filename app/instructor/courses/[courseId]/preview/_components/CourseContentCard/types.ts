import type { OwnCoursePreview } from "@/server/entities/course";

export type PreviewSection = OwnCoursePreview["sections"][number];

export type CourseContentCardProps = {
	courseId: string;
	sections: PreviewSection[];
};

export type SectionBlockProps = {
	courseId: string;
	section: PreviewSection;
};
