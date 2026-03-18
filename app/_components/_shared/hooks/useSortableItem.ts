import { type UseSortableArguments, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const useSortableItem = (args: UseSortableArguments) => {
	const { attributes, listeners, ...sortable } = useSortable(args);

	const style = {
		transform: CSS.Transform.toString(sortable.transform),
		transition: sortable.transition,
	};

	const dragHandleProps = { ...attributes, ...listeners };

	return {
		...sortable,
		dragHandleProps,
		style,
	};
};

export default useSortableItem;
