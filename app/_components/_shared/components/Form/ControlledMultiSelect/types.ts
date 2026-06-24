import type { Control, FieldValues, Path } from "react-hook-form";

export type ControlledMultiSelectProps<T extends FieldValues> = {
	control: Control<T>;
	name: Path<T>;
	label: React.ReactNode;
	items: { label: string; value: string }[];
};
