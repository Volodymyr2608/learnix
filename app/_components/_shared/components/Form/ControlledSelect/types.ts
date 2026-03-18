import type { Control, FieldValues, Path } from "react-hook-form";
import type { Select } from "@/app/_components/_shared/ui/select";

export type ControlledSelectProps<T extends FieldValues> = {
	control: Control<T>;
	name: Path<T>;
	id: string;
	label: React.ReactNode;
	placeholder?: string;
	selectProps?: React.ComponentProps<typeof Select>;
	items: { label: string; value: string }[];
};
