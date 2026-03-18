import type { UniqueIdentifier } from "@dnd-kit/core";
import { useCallback } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import findIndexById from "@/app/_components/_shared/utils/findIndexById";
import type { CourseWithRelations } from "@/prisma/zod";

const useReorderSections = () => {
	const { control, getValues, setValue } = useFormContext();

	const { move } = useFieldArray({
		control,
		name: "sections",
	});
	const handleQuestionDragEnd = useCallback(
		async ({
			activeId,
			overId,
			sections,
		}: {
			activeId: UniqueIdentifier;
			overId: UniqueIdentifier | undefined;
			sections: Record<"id", string>[];
		}) => {
			const oldIndex = findIndexById(sections, activeId);
			const newIndex = findIndexById(sections, overId);

			if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

			move(oldIndex, newIndex);

			const updated = (
				getValues("sections") as CourseWithRelations["sections"]
			).map((s, index) => ({
				...s,
				order: index + 1,
			}));

			setValue("sections", updated, { shouldDirty: true });
		},
		[move, setValue, getValues],
	);

	return { handleQuestionDragEnd };
};

export default useReorderSections;
