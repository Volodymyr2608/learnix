export const validateProceed = (params: {
	courseId?: string;
	instructorId?: string;
}) => {
	const { courseId, instructorId } = params;

	if (!courseId) {
		console.error("Course id is missing");
		return null;
	}

	if (!instructorId) {
		console.error("Instructor id is missing");
		return null;
	}

	return { courseId, instructorId };
};
