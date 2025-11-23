import type { CourseStatus } from "@/generated/prisma";
import type { CourseSchemaInput } from "@/server/entities/course";
import { extractCommonFields } from "./mapFields";

export const prepareCoursePayload = (params: {
	data: CourseSchemaInput;
	finalStatus: CourseStatus;
	courseId?: string; // only for update
	instructorId: string;
	isNew?: boolean; // create → true
}) => {
	const { data, finalStatus, courseId, instructorId, isNew } = params;

	const {
		rest,
		mappedObjectives,
		mappedRequirements,
		subtitle,
		originalPrice,
	} = extractCommonFields(data);

	return {
		...rest,
		...(isNew ? {} : { id: courseId }),
		instructorId,
		status: finalStatus,
		objectives: mappedObjectives,
		requirements: mappedRequirements,
		subtitle,
		originalPrice,
	};
};
