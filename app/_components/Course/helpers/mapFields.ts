import type { CourseSchemaInput } from "@/server/entities/course";

export const mapList = (list: { value: string }[]) =>
	list.map((item) => item.value.trim());

export const extractCommonFields = (data: CourseSchemaInput) => {
	const {
		objectives,
		requirements,
		subtitle,
		originalPriceCents,
		sections,
		...rest
	} = data;

	return {
		rest,
		mappedObjectives: mapList(objectives),
		mappedRequirements: mapList(requirements),
		subtitle: subtitle ?? null,
		originalPriceCents: originalPriceCents ?? null,
		sections: sections.map((section, index) => ({
			...section,
			order: index + 1,
		})),
	};
};
