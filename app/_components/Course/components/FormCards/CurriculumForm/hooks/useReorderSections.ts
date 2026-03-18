import type { UniqueIdentifier } from "@dnd-kit/core";
import { useCallback } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import findIndexById from "@/app/_components/_shared/utils/findIndexById";

const useReorderSections = () => {
	const { control } = useFormContext();

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
		},
		[move],
	);

	return { handleQuestionDragEnd };
};

export default useReorderSections;
