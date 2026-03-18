import type { UniqueIdentifier } from "@dnd-kit/core";

const findIndexById = (
	items: { id: string }[] | null | undefined,
	id: UniqueIdentifier | undefined,
): number => {
	if (!Array.isArray(items)) return -1;
	return items.findIndex((item) => item.id === id);
};

export default findIndexById;
