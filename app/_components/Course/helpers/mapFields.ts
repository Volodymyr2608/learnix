import type { CourseSchemaInput } from "@/server/entities/course";

export const mapList = (list: { value: string }[]) =>
	list.map((item) => item.value.trim());

export const extractCommonFields = (data: CourseSchemaInput) => {
	const {
		objectives,
		requirements,
		subtitle,
		originalPrice,
		// previewVideo,
		// thumbnail,
		...rest
	} = data;

	return {
		rest,
		mappedObjectives: mapList(objectives),
		mappedRequirements: mapList(requirements),
		subtitle: subtitle ?? null,
		originalPrice: originalPrice ?? null,
	};
};
